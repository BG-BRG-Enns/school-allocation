-- The roster: who takes part, in which class, from which import, and how a
-- roster entry is tied to a sign-in (docs/data-sources.md, docs/identity-and-roles.md
-- §3–4). Imports are frozen batches; a person is a stable id that entries of
-- successive batches point at; a binding ties that id to an Entra identity
-- once, and is closed rather than removed when the person's account
-- changes. No grants here: the migrator applies apps/api/lib/runtime-privileges.ts.

-- A person of the school as the roster knows them: an id and nothing else.
-- Kind, class, grade and name are what the roster in force says about the
-- person, so they live on the entries; the id is what a choice, an
-- assignment or a role will reference.
create table person (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- One import: from the labelled Entra groups through Microsoft Graph, or
-- from a CSV upload. Written as pending with its diff against the roster in
-- force, then committed (it becomes the roster in force) or discarded;
-- rejected when its rows do not form a roster (the same person twice, as a
-- student and a teacher). Append-only: the decision is the only change.
create table import_batch (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('graph:groups', 'csv')),
  state text not null default 'pending' check (state in ('pending', 'committed', 'discarded', 'rejected')),
  school_year text not null check (school_year ~ '^\d{4}/\d{2}$'),
  fetched_at timestamptz not null default now(),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer not null check (row_count >= 0),
  triggered_by uuid not null references app_user (id),
  -- The committed batch the diff was taken against; null for the first.
  previous_batch_id uuid references import_batch (id),
  diff_summary jsonb not null check (jsonb_typeof(diff_summary) = 'object'),
  -- Why a rejected batch was rejected, and what an accepted one should be
  -- looked at for (a member without an address): small lists of codes and
  -- keys, never names.
  problems jsonb not null default '[]' check (jsonb_typeof(problems) = 'array'),
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings) = 'array'),
  decided_at timestamptz,
  decided_by uuid references app_user (id),
  check ((state = 'pending') = (decided_at is null)),
  check ((decided_at is null) = (decided_by is null)),
  check (decided_at is null or decided_at >= fetched_at)
);
create index import_batch_committed on import_batch (decided_at desc) where state = 'committed';
create index import_batch_fetched on import_batch (fetched_at desc);

create function import_batch_guard() returns trigger language plpgsql as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('an import batch is kept, not removed');
    return null;
  end if;
  -- What a stored batch must satisfy, whoever writes it: it is born pending
  -- or rejected, and it is committed only once every entry has its person.
  if tg_op = 'INSERT' then
    if new.state not in ('pending', 'rejected') then
      perform refuse('an import batch is written pending or rejected');
    end if;
    return new;
  end if;
  if old.state <> 'pending' then
    perform refuse('a decided import batch does not change');
  end if;
  if new.state = 'committed' and exists (select 1 from roster_entry where batch_id = new.id and person_id is null) then
    perform refuse('a committed import batch has every entry resolved to a person');
  end if;
  if new.source <> old.source or new.school_year <> old.school_year or new.fetched_at <> old.fetched_at
     or new.payload_sha256 <> old.payload_sha256 or new.row_count <> old.row_count or new.triggered_by <> old.triggered_by
     or new.previous_batch_id is distinct from old.previous_batch_id or new.diff_summary <> old.diff_summary
     or new.problems <> old.problems or new.warnings <> old.warnings then
    perform refuse('only the decision on an import batch changes');
  end if;
  return new;
end
$$;
create trigger import_batch_guard before insert or update or delete on import_batch
  for each row execute function import_batch_guard();
create trigger import_batch_no_truncate before truncate on import_batch
  for each statement execute function import_batch_guard();

-- The Entra groups an administrator has labelled for the Graph import:
-- which are student groups (with their class and grade), which are teacher
-- groups. Replaced as a whole and audited; the import reads it.
create table roster_group (
  group_id uuid primary key,
  label text not null check (char_length(label) between 1 and 200),
  kind text not null check (kind in ('student', 'teacher')),
  class_name text check (class_name is null or char_length(class_name) between 1 and 16),
  grade smallint check (grade between 1 and 13),
  check ((kind = 'student') = (class_name is not null and grade is not null)),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references app_user (id)
);

-- One row of one batch: a person as that import saw them. Immutable except
-- for the person it is resolved to when the batch is committed. The key is
-- the object id where the source knows it, otherwise the address: the same
-- key in two batches is the same person, and no name takes part in that.
create table roster_entry (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batch (id),
  person_id uuid references person (id),
  kind text not null check (kind in ('student', 'teacher')),
  oid uuid,
  upn text check (upn is null or char_length(upn) between 3 and 254),
  mail text check (mail is null or char_length(mail) between 3 and 254),
  display_name text not null check (char_length(display_name) between 1 and 256),
  class_name text check (class_name is null or char_length(class_name) between 1 and 16),
  grade smallint check (grade between 1 and 13),
  class_teacher_mail text check (class_teacher_mail is null or char_length(class_teacher_mail) between 3 and 254),
  entry_key text not null generated always as (coalesce(oid::text, lower(mail), lower(upn))) stored,
  check (kind = 'teacher' or (class_name is not null and grade is not null)),
  unique (batch_id, entry_key)
);
-- A person appears once per batch; the commit resolves entries to persons
-- and this refuses a resolution that would merge two rows into one person.
create unique index roster_entry_person_once on roster_entry (batch_id, person_id) where person_id is not null;
create index roster_entry_person on roster_entry (person_id, batch_id);
create index roster_entry_mail on roster_entry (batch_id, lower(mail));
create index roster_entry_upn on roster_entry (batch_id, lower(upn));

create function roster_entry_guard() returns trigger language plpgsql as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('a roster entry is kept with its batch, not removed');
    return null;
  end if;
  if old.person_id is not null then
    perform refuse('a resolved roster entry does not change');
  end if;
  if new.batch_id <> old.batch_id or new.kind <> old.kind or new.oid is distinct from old.oid
     or new.upn is distinct from old.upn or new.mail is distinct from old.mail or new.display_name <> old.display_name
     or new.class_name is distinct from old.class_name or new.grade is distinct from old.grade
     or new.class_teacher_mail is distinct from old.class_teacher_mail then
    perform refuse('only the person of a roster entry is resolved');
  end if;
  return new;
end
$$;
create trigger roster_entry_guard before update or delete on roster_entry
  for each row execute function roster_entry_guard();
create trigger roster_entry_no_truncate before truncate on roster_entry
  for each statement execute function roster_entry_guard();

-- A person's Entra identity: made by the Graph import (the member's object
-- id), by the exact address match at a CSV person's first sign-in, or by an
-- administrator, each audited. One active binding per identity and per
-- person; a binding is closed, never removed, so the history of which
-- account was whose stays readable.
create table identity_binding (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person (id),
  tid uuid not null,
  oid uuid not null,
  method text not null check (method in ('graph', 'email_match', 'admin')),
  bound_at timestamptz not null default now(),
  -- Who made it: the administrator who committed the batch or bound by
  -- hand, or the person themselves at their first sign-in.
  bound_by uuid not null references app_user (id),
  import_batch_id uuid references import_batch (id),
  reason text check (reason is null or char_length(reason) between 1 and 500),
  unbound_at timestamptz,
  unbound_by uuid references app_user (id),
  unbind_reason text check (unbind_reason is null or char_length(unbind_reason) between 1 and 500),
  check ((unbound_at is null) = (unbound_by is null)),
  check (unbound_at is null or unbound_at >= bound_at)
);
create unique index identity_binding_active_identity on identity_binding (tid, oid) where unbound_at is null;
create unique index identity_binding_active_person on identity_binding (person_id) where unbound_at is null;
create index identity_binding_person on identity_binding (person_id);

create function identity_binding_guard() returns trigger language plpgsql as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('an identity binding is closed, not removed');
    return null;
  end if;
  if old.unbound_at is not null then
    perform refuse('a closed identity binding does not change');
  end if;
  if new.person_id <> old.person_id or new.tid <> old.tid or new.oid <> old.oid or new.method <> old.method
     or new.bound_at <> old.bound_at or new.bound_by <> old.bound_by or new.import_batch_id is distinct from old.import_batch_id
     or new.reason is distinct from old.reason then
    perform refuse('only the closing of an identity binding changes');
  end if;
  return new;
end
$$;
create trigger identity_binding_guard before update or delete on identity_binding
  for each row execute function identity_binding_guard();
create trigger identity_binding_no_truncate before truncate on identity_binding
  for each statement execute function identity_binding_guard();
