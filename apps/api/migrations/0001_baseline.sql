-- schema-version: 1
-- The schema of version 1: who signed in and which role they hold, the
-- audit log, the roster, the school's settings, grid and categories, and
-- the campaigns with their catalogue, choices, mail, allocation runs,
-- changes and attendance. A change after it is a new migration on top; this
-- file is never edited once applied (scripts/migrate.ts records its hash).
-- No grants here: the migrator applies apps/api/lib/runtime-privileges.ts
-- on every run.
--
-- The tables keep what stored rows must satisfy whoever writes them; which
-- lifecycle state allows what is school-core's, asked by the routes. A
-- guard refuses what a record never undergoes (a log rewritten, a decision
-- taken back, a row removed), for every role, the owner at a prompt
-- included. The one way past them is the retention purge at the end.

-- How a trigger refuses a change: SQLSTATE 55000, which the application maps
-- by code (lib/pg-errors.ts). The message names the rule, never a value.
create function refuse(rule text) returns void language plpgsql as $$
begin
  raise exception using message = rule, errcode = '55000';
end
$$;

-- One clock: every time the application writes or compares comes from
-- app_now(), which is the database's own now() unless the transaction set
-- app.now. Only a test sets it, through a clock of its own
-- (apps/api/lib/db.ts); the server never does, so a school's database reads
-- now(). The columns' defaults follow it, so a row a test inserts carries
-- the test's time, as everything else the application writes does.
create function app_now() returns timestamptz language sql stable parallel safe
  return coalesce(nullif(current_setting('app.now', true), '')::timestamptz, now());

-- Every guard that refuses a deletion knows the purge's switch, inline: the
-- transaction-local setting schulwahl.purge, honoured only while a definer
-- function runs (current_user differs from session_user then). The runtime
-- role may set any setting, but executes no function the grant list does
-- not name, so it cannot switch a guard off from outside; the owner at a
-- prompt cannot either (current_user is session_user there).

-- Everyone who has signed in: the stable Entra identity (tenant and object
-- id) and what the token said about them last. Nobody is matched by e-mail
-- address or by oid alone; nobody is deleted but by the retention purge.
-- The roster, which says who takes part in which class, binds to this
-- identity (identity_binding).
create table app_user (
  id uuid primary key default gen_random_uuid(),
  tid uuid not null,
  oid uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 256),
  email text check (email is null or char_length(email) between 3 and 254),
  first_sign_in_at timestamptz not null default app_now(),
  last_sign_in_at timestamptz not null default app_now(),
  -- An administrator's block: no sign-in, and the running session ends at
  -- the next request.
  blocked_at timestamptz,
  blocked_by uuid references app_user (id),
  check ((blocked_at is null) = (blocked_by is null)),
  constraint app_user_identity unique (tid, oid)
);

-- The privileged roles, granted in the application and audited: for the
-- school (campaign_id null), or for one campaign (role_grant_campaign,
-- below the campaigns). A grant is revoked, never changed or removed, so
-- the history of who could do what stays readable.
create table role_grant (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user (id),
  role text not null check (role in ('school_admin', 'campaign_organizer', 'read_only_auditor')),
  campaign_id uuid,
  granted_by uuid not null references app_user (id),
  granted_at timestamptz not null default app_now(),
  reason text not null check (char_length(reason) between 1 and 500),
  revoked_at timestamptz,
  revoked_by uuid references app_user (id),
  check ((revoked_at is null) = (revoked_by is null)),
  check (revoked_at is null or revoked_at >= granted_at)
);
-- One active grant per person, role and scope; the school scope is null.
create unique index role_grant_active on role_grant (user_id, role, campaign_id) nulls not distinct where revoked_at is null;
create index role_grant_user on role_grant (user_id) where revoked_at is null;

create function role_grant_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  if tg_op = 'DELETE' then
    perform refuse('a role grant is revoked, not removed');
  end if;
  if old.revoked_at is not null then
    perform refuse('a revoked role grant does not change');
  end if;
  if new.user_id <> old.user_id or new.role <> old.role or new.campaign_id is distinct from old.campaign_id
     or new.granted_by <> old.granted_by or new.granted_at <> old.granted_at or new.reason <> old.reason then
    perform refuse('only the revocation of a role grant changes');
  end if;
  return new;
end
$$;
create trigger role_grant_guard before update or delete on role_grant
  for each row execute function role_grant_guard();

create function role_grant_no_truncate() returns trigger language plpgsql as $$
begin
  perform refuse('a role grant is revoked, not removed');
  return null;
end
$$;
create trigger role_grant_no_truncate before truncate on role_grant
  for each statement execute function role_grant_no_truncate();

-- The administrative audit log, a hash chain per scope (lib/audit-chain.ts):
-- a campaign's id, or the fixed school scope for what is not a campaign's.
-- Append-only, and the chain is linear: one first event per scope, every
-- event the predecessor of at most one other.
create table audit_event (
  seq bigint generated always as identity primary key,
  scope_id uuid not null,
  -- A finite time in whole milliseconds, which the hashed ISO 8601 text and
  -- a JavaScript Date hold exactly.
  at timestamptz not null check (isfinite(at) and at = date_trunc('milliseconds', at)),
  -- The stable Entra identity of the actor, and the name shown for it.
  actor_tid uuid not null,
  actor_oid uuid not null,
  actor_name text not null check (char_length(actor_name) between 1 and 256),
  action text not null check (action ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$' and char_length(action) <= 64),
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object'),
  prev_seq bigint,
  prev_hash text check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  check ((prev_seq is null) = (prev_hash is null)),
  check (prev_seq < seq),
  unique (scope_id, hash),
  unique (scope_id, seq, hash),
  unique nulls not distinct (scope_id, prev_hash),
  foreign key (scope_id, prev_seq, prev_hash) references audit_event (scope_id, seq, hash)
);
create index audit_event_scope_seq on audit_event (scope_id, seq);

create function audit_event_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  perform refuse('the audit log is append-only');
  return null;
end
$$;
create trigger audit_event_guard before update or delete on audit_event
  for each row execute function audit_event_guard();
-- A row-level trigger does not see TRUNCATE; a statement-level one does.
create trigger audit_event_no_truncate before truncate on audit_event
  for each statement execute function audit_event_guard();

-- A job that runs for a while and must not be interrupted by an update or
-- a restart: an allocation run, a roster import, an outbox flush. The
-- health check reports "busy" while one is unfinished (deploy/not-busy.sh
-- asks it). A job the process died on is marked interrupted at the next
-- start; its work is re-run from its frozen input, never resumed.
create table job (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind ~ '^[a-z][a-z0-9_]*$' and char_length(kind) <= 64),
  started_by uuid references app_user (id),
  started_at timestamptz not null default app_now(),
  finished_at timestamptz,
  outcome text check (outcome in ('succeeded', 'failed', 'interrupted')),
  check ((finished_at is null) = (outcome is null)),
  check (finished_at is null or finished_at >= started_at)
);
create index job_unfinished on job (started_at) where finished_at is null;

-- The roster: who takes part, in which class, from which import, and how a
-- roster entry is tied to a sign-in (docs/data-sources.md, docs/identity-and-roles.md
-- §3–4). Imports are frozen batches; a person is a stable id that entries of
-- successive batches point at; a binding ties that id to an Entra identity
-- once, and is closed rather than removed when the person's account
-- changes.

-- A person of the school as the roster knows them: an id and nothing else.
-- Kind, class, grade and name are what the roster in force says about the
-- person, so they live on the entries; the id is what a choice, an
-- assignment or a role references.
create table person (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default app_now()
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
  fetched_at timestamptz not null default app_now(),
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

-- What a stored batch must satisfy, whoever writes it: it is born pending or
-- rejected, and it is committed only once every entry has its person.
create function import_batch_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'UPDATE' then return new; end if;
  end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('an import batch is kept, not removed');
    return null;
  end if;
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
  updated_at timestamptz not null default app_now(),
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
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
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
  bound_at timestamptz not null default app_now(),
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
  if coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'UPDATE' then return new; end if;
  end if;
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

-- The school's: its language and who set it last, and whether sending is
-- paused. One row. The pages, the workbooks and the notices speak the
-- language an administrator sets here, one of the message catalogue's
-- (packages/messages LOCALES). The audit log keeps every change with who
-- made it, so the retention purge may remove that account (D-15), which
-- empties the column. An organizer or administrator can pause sending;
-- queued mails stay queued.
create table school_setting (
  id boolean primary key default true check (id),
  locale text not null default 'de' check (locale in ('de', 'de-formal', 'en')),
  updated_at timestamptz not null default app_now(),
  updated_by uuid references app_user (id) on delete set null,
  mail_paused boolean not null default false
);
insert into school_setting default values;

-- The lesson periods (D-25), one row each, numbered from 1; replaced as a
-- whole by an administrator. Seeded with the grid most Austrian schools run
-- on.
create table period_grid (
  period smallint primary key check (period between 1 and 20),
  starts time not null,
  ends time not null,
  check (ends > starts)
);
insert into period_grid (period, starts, ends) values
  (1, '07:35', '08:25'), (2, '08:30', '09:20'), (3, '09:25', '10:15'), (4, '10:30', '11:20'), (5, '11:25', '12:15'),
  (6, '12:20', '13:10'), (7, '13:15', '14:05'), (8, '14:10', '15:00'), (9, '15:05', '15:55'), (10, '16:00', '16:50');

-- The school's categories of activities (sport, creative, careers …),
-- outside any school year, like the period grid: renamed freely, removed
-- only while nothing names them (item_category and campaign_rule refer to
-- them without a cascade).
create table category (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  created_at timestamptz not null default app_now(),
  updated_at timestamptz not null default app_now()
);
-- "Sport" and "sport" are one category.
create unique index category_name on category (lower(name));

-- Who is class teacher of which class in a school year, as assigned in the
-- app (D-17; the CSV roster may also name one by address; both count). An
-- assignment is made and revoked, never changed or removed.
create table class_teacher (
  id uuid primary key default gen_random_uuid(),
  school_year text not null check (school_year ~ '^\d{4}/\d{2}$'),
  class_name text not null check (char_length(class_name) between 1 and 16),
  person_id uuid not null references person (id),
  assigned_by uuid not null references app_user (id),
  assigned_at timestamptz not null default app_now(),
  revoked_at timestamptz,
  revoked_by uuid references app_user (id),
  check ((revoked_at is null) = (revoked_by is null))
);
create unique index class_teacher_active on class_teacher (school_year, class_name, person_id) where revoked_at is null;
create index class_teacher_person on class_teacher (person_id) where revoked_at is null;

create function class_teacher_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('a class teacher assignment is revoked, not removed');
  end if;
  if new.school_year <> old.school_year or new.class_name <> old.class_name or new.person_id <> old.person_id
     or new.assigned_by <> old.assigned_by or new.assigned_at <> old.assigned_at then
    perform refuse('a class teacher assignment is revoked, not rewritten');
  end if;
  if old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at or new.revoked_by is distinct from old.revoked_by) then
    perform refuse('a revoked assignment stays revoked');
  end if;
  return new;
end
$$;
create trigger class_teacher_guard before update or delete on class_teacher
  for each row execute function class_teacher_guard();
create trigger class_teacher_no_truncate before truncate on class_teacher
  for each statement execute function class_teacher_guard();

-- Whether a teacher is available on a project day: a teacher's, per date,
-- not per campaign (the project days of the school year's campaigns). No
-- row means available; a row says unavailable, or available only if needed.
-- No reason is stored: a free day, an exemption and an entrance exam all
-- read the same. A teacher sets their own while a campaign with that day
-- takes proposals; an organizer sets anyone's, recorded in the campaign's
-- audit chain. The rows go with their person, and the retention purge
-- removes a school year's dates.
create table teacher_availability (
  person_id uuid not null references person (id) on delete cascade,
  day date not null,
  status text not null check (status in ('unavailable', 'if_needed')),
  updated_at timestamptz not null default app_now(),
  primary key (person_id, day)
);
create index teacher_availability_day on teacher_availability (day);

-- A campaign: a project week (or, later, the electives) of one school year,
-- with its project days and lifecycle state (docs/domain-and-api.md §1–3).
create table campaign (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('project_week', 'wpf')),
  name text not null check (char_length(name) between 1 and 200),
  school_year text not null check (school_year ~ '^\d{4}/\d{2}$'),
  -- The grace week is a state of its own (school-core's lifecycle).
  state text not null default 'draft'
    check (state in ('draft', 'catalogue', 'published', 'open', 'grace', 'closed', 'allocating', 'review', 'results', 'archived')),
  -- The days activities take place on, local dates; a few at most.
  project_days date[] not null check (cardinality(project_days) between 1 and 10),
  -- Per-campaign settings a later slice reads (ranks to give, reminders).
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  -- The roster batch frozen when the window closes; null until then.
  roster_batch_id uuid references import_batch (id),
  created_by uuid not null references app_user (id),
  created_at timestamptz not null default app_now(),
  updated_at timestamptz not null default app_now(),
  -- The choice window with its grace week, the swap window after
  -- publication, and what the window asks of a student: the wishes per time
  -- group and the daily minimum per grade ({"9": 240, ...}, minutes; D-05,
  -- D-06). Whether the catalogue names the teachers is the school's call
  -- (D-13).
  opens_at timestamptz,
  closes_at timestamptz,
  late_until timestamptz,
  swap_from timestamptz,
  swap_until timestamptz,
  wishes_per_group smallint not null default 3 check (wishes_per_group between 1 and 10),
  daily_minimum jsonb not null default '{}' check (jsonb_typeof(daily_minimum) = 'object'),
  show_teachers boolean not null default true,
  -- How many days before a close the reminder goes out; 0 means none.
  reminder_days smallint not null default 1 check (reminder_days between 0 and 14),
  -- The demand's target: the places a day offers a grade should exceed the
  -- students who need one by this share, so wishes have room.
  place_headroom_percent smallint not null default 20 check (place_headroom_percent between 0 and 100),
  constraint campaign_window_order check (opens_at is null or closes_at is null or opens_at < closes_at),
  constraint campaign_grace_order check (closes_at is null or late_until is null or closes_at <= late_until),
  constraint campaign_swap_order check (swap_from is null or swap_until is null or swap_from <= swap_until)
);
create index campaign_year on campaign (school_year, created_at desc);

alter table role_grant add constraint role_grant_campaign foreign key (campaign_id) references campaign (id);

-- A campaign's rules, in the order the organizer set: the students of the
-- listed grades, and of the listed classes of them when any are listed,
-- should have at least so many activities or minutes of a category. The
-- allocation meets a rule where it can, after the days and before the
-- wishes.
create table campaign_rule (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaign (id) on delete cascade,
  position smallint not null check (position >= 0),
  category_id uuid not null references category (id),
  grades smallint[] not null check (cardinality(grades) between 1 and 13),
  classes text[] not null default '{}' check (cardinality(classes) <= 40),
  unit text not null check (unit in ('items', 'minutes')),
  minimum integer not null check (minimum between 1 and 10000),
  unique (campaign_id, position)
);
create index campaign_rule_category on campaign_rule (category_id);

-- An activity of a campaign (D-24 revised). `places` are the places
-- students may rank: the capacity of a choosable activity, the extra places
-- of an activity fixed for classes (whose students are pre-assigned and
-- count against nothing). An item is numbered when the catalogue is
-- published; the number is for the printed catalogue and never changes.
create table catalog_item (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaign (id),
  number integer check (number >= 1),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  location text not null default '' check (char_length(location) <= 200),
  fee_cents integer not null default 0 check (fee_cents between 0 and 100000),
  fee_note text not null default '' check (char_length(fee_note) <= 500),
  places integer not null default 0 check (places between 0 and 1000),
  min_participants integer not null default 0 check (min_participants between 0 and 1000),
  cancellable_below_min boolean not null default true,
  fixed_classes text[] not null default '{}',
  eligible_grades smallint[] not null default '{}',
  eligible_classes text[] not null default '{}',
  state text not null default 'draft' check (state in ('draft', 'proposed', 'approved', 'withdrawn')),
  -- The account that proposed it; the teachers are roster persons (item_teacher).
  proposed_by uuid not null references app_user (id),
  created_at timestamptz not null default app_now(),
  updated_at timestamptz not null default app_now(),
  -- The organizer's note when returning a proposal for changes.
  review_note text not null default '' check (char_length(review_note) <= 1000),
  approved_at timestamptz,
  approved_by uuid references app_user (id),
  withdrawn_at timestamptz,
  withdrawn_by uuid references app_user (id),
  withdraw_reason text check (withdraw_reason is null or char_length(withdraw_reason) between 1 and 500),
  check ((approved_at is null) = (approved_by is null)),
  check ((withdrawn_at is null) = (withdrawn_by is null)),
  check ((state = 'withdrawn') = (withdrawn_at is not null)),
  check (state <> 'withdrawn' or withdraw_reason is not null),
  check (state <> 'approved' or approved_at is not null)
);
create unique index catalog_item_number on catalog_item (campaign_id, number) where number is not null;
create index catalog_item_campaign on catalog_item (campaign_id, state);

-- A draft nobody has reviewed may go; anything later, and anything that was
-- in a published catalogue (it has a number), is withdrawn, so the record of
-- what was proposed stays and no number is given out twice.
create function catalog_item_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    if tg_op = 'TRUNCATE' or old.state <> 'draft' or old.number is not null then
      perform refuse('an item past draft or with a catalogue number is withdrawn, not removed');
    end if;
    return old;
  end if;
  if new.campaign_id <> old.campaign_id or new.proposed_by <> old.proposed_by or new.created_at <> old.created_at then
    perform refuse('an item stays with its campaign and proposer');
  end if;
  if old.number is not null and new.number is distinct from old.number then
    perform refuse('an item keeps its catalogue number');
  end if;
  return new;
end
$$;
create trigger catalog_item_guard before update or delete on catalog_item
  for each row execute function catalog_item_guard();
create trigger catalog_item_no_truncate before truncate on catalog_item
  for each statement execute function catalog_item_guard();

-- The teachers of an activity: roster persons, in the order they are named.
create table item_teacher (
  item_id uuid not null references catalog_item (id) on delete cascade,
  person_id uuid not null references person (id),
  position smallint not null check (position >= 0),
  primary key (item_id, person_id)
);

-- A session of an activity: when, where, and the minutes it credits per
-- local date it touches ([{"date": "2027-06-22", "minutes": 360}, ...]),
-- given by the teacher since travel and breaks do not count. Sessions are
-- replaced as a whole when an item is edited.
create table item_session (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references catalog_item (id) on delete cascade,
  position smallint not null check (position >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 200),
  credits jsonb not null check (jsonb_typeof(credits) = 'array'),
  check (ends_at > starts_at),
  unique (item_id, position)
);
create index item_session_item on item_session (item_id, starts_at);

-- An activity's categories: none, one or several.
create table item_category (
  item_id uuid not null references catalog_item (id) on delete cascade,
  category_id uuid not null references category (id),
  primary key (item_id, category_id)
);
create index item_category_category on item_category (category_id);

-- A student placed into a class activity when the window opened (D-24),
-- or exempted from it by an organizer with a reason (then they choose for
-- that time). A placement by class is removed again when the class is no
-- longer fixed for the activity; an exemption, an organizer's decision,
-- is never removed or changed.
create table pre_assignment (
  campaign_id uuid not null references campaign (id),
  item_id uuid not null references catalog_item (id),
  person_id uuid not null references person (id),
  source text not null check (source in ('class', 'manual')),
  created_at timestamptz not null default app_now(),
  exempted_at timestamptz,
  exempted_by uuid references app_user (id),
  exempt_reason text check (exempt_reason is null or char_length(exempt_reason) between 1 and 500),
  primary key (campaign_id, item_id, person_id),
  check ((exempted_at is null) = (exempted_by is null) and (exempted_at is null) = (exempt_reason is null))
);
create index pre_assignment_person on pre_assignment (campaign_id, person_id);

create function pre_assignment_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  if tg_op = 'DELETE' and old.source = 'class' and old.exempted_at is null then
    return old;
  end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('an exempted or manual pre-assignment is never removed');
  end if;
  if new.source <> old.source or new.created_at <> old.created_at then
    perform refuse('a pre-assignment keeps its source');
  end if;
  if old.exempted_at is not null and (new.exempted_at is distinct from old.exempted_at or new.exempted_by is distinct from old.exempted_by or new.exempt_reason is distinct from old.exempt_reason) then
    perform refuse('an exemption stays as it was given');
  end if;
  return new;
end
$$;
create trigger pre_assignment_guard before update or delete on pre_assignment
  for each row execute function pre_assignment_guard();
create trigger pre_assignment_no_truncate before truncate on pre_assignment
  for each statement execute function pre_assignment_guard();

-- A student's ranking as it stands (D-05, D-06): per time group the item
-- ids in order ({"<group key>": ["<item id>", ...]}), the window it was last
-- saved in (first, or late in the grace week), and who saved it. Replaced
-- as a whole on every save; the revisions keep the history.
create table choice (
  campaign_id uuid not null references campaign (id),
  person_id uuid not null references person (id),
  ranking jsonb not null check (jsonb_typeof(ranking) = 'object'),
  saved_in text not null check (saved_in in ('first', 'late')),
  version integer not null check (version >= 1),
  updated_at timestamptz not null default app_now(),
  entered_by uuid not null references app_user (id),
  primary key (campaign_id, person_id)
);

create table choice_revision (
  seq bigint generated always as identity primary key,
  campaign_id uuid not null references campaign (id),
  person_id uuid not null references person (id),
  version integer not null check (version >= 1),
  ranking jsonb not null check (jsonb_typeof(ranking) = 'object'),
  saved_in text not null check (saved_in in ('first', 'late')),
  saved_at timestamptz not null default app_now(),
  entered_by uuid not null references app_user (id),
  -- Set when an organizer entered the list on the student's behalf.
  reason text check (reason is null or char_length(reason) between 1 and 500),
  unique (campaign_id, person_id, version)
);

create function choice_revision_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  perform refuse('a choice revision is never changed or removed');
  return null;
end
$$;
create trigger choice_revision_guard before update or delete on choice_revision
  for each row execute function choice_revision_guard();
create trigger choice_revision_no_truncate before truncate on choice_revision
  for each statement execute function choice_revision_guard();

-- The text of a notice an organizer saved, by kind, in the language it was
-- written in, with placeholders in double braces (lib/mail/templates.ts
-- lists each kind's). A kind without a row sends the message catalogue's
-- default in the school's language; removing a row, one kind at a time and
-- audited by the application, is the reset to it. Truncating the table is
-- refused, for every role.
create table mail_template (
  kind text primary key check (kind ~ '^[a-z_]{1,40}$'),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 8000),
  updated_at timestamptz not null default app_now(),
  updated_by uuid not null references app_user (id),
  locale text not null default 'de' check (locale in ('de', 'de-formal', 'en'))
);

create function mail_template_guard() returns trigger language plpgsql as $$
begin
  perform refuse('a mail template is reset one kind at a time, never truncated');
  return null;
end
$$;
create trigger mail_template_no_truncate before truncate on mail_template
  for each statement execute function mail_template_guard();

-- A notice to send: written in the same transaction as what triggered it,
-- once per dedupe key, and worked through by the sender (lib/mail/sender.ts):
-- queued → sending → sent, or failed after the attempts a transient error
-- gets, at once on a permanent one. Rows stay as the record of what was
-- sent; the retention purge (D-15) removes them with their campaign.
--
-- The sender takes one mail at a time, at most MAIL_PER_HOUR an hour,
-- spaced from the last claim the database holds, so a restart sends no
-- burst. A mail's priority, set when it is queued, decides its turn before
-- its age: 1 for a mail someone waits for (a swap's confirmation, a change,
-- the test mail), 2 for staff, 3 for students in bulk. A reminder expires
-- at the end of the window it reminds of: still queued then, it becomes
-- `expired` and is never sent, and stays so like a sent or failed one.
create table outbox_mail (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind ~ '^[a-z_]{1,40}$'),
  campaign_id uuid references campaign (id),
  person_id uuid references person (id),
  to_address text not null check (char_length(to_address) between 3 and 320),
  subject text not null check (char_length(subject) between 1 and 998),
  body text not null check (char_length(body) <= 100000),
  dedupe_key text not null unique check (char_length(dedupe_key) between 1 and 200),
  state text not null default 'queued' check (state in ('queued', 'sending', 'sent', 'failed', 'expired')),
  attempts integer not null default 0 check (attempts >= 0),
  -- The server's reply, or what went wrong; never logged elsewhere.
  detail text check (detail is null or char_length(detail) <= 2000),
  message_id text check (message_id is null or char_length(message_id) <= 998),
  next_attempt_at timestamptz not null default app_now(),
  created_at timestamptz not null default app_now(),
  updated_at timestamptz not null default app_now(),
  sent_at timestamptz,
  priority smallint not null default 3 check (priority between 1 and 3),
  claimed_at timestamptz,
  expires_at timestamptz,
  check ((state = 'sent') = (sent_at is not null))
);
-- The queue in the order claims take it; the last claim, which the spacing is measured from.
create index outbox_mail_queue on outbox_mail (priority, created_at) where state = 'queued';
create index outbox_mail_claimed on outbox_mail (claimed_at) where claimed_at is not null;
create index outbox_mail_campaign on outbox_mail (campaign_id, created_at desc);

create function outbox_mail_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('a mail stays in the outbox as the record of what was sent');
  end if;
  if new.kind <> old.kind or new.to_address <> old.to_address or new.subject <> old.subject or new.body <> old.body
     or new.dedupe_key <> old.dedupe_key or new.created_at <> old.created_at
     or new.campaign_id is distinct from old.campaign_id or new.person_id is distinct from old.person_id then
    perform refuse('a queued mail keeps what it says and whom it is for');
  end if;
  if old.state in ('sent', 'failed', 'expired') and new.state <> old.state then
    perform refuse('a sent, failed or expired mail stays so; a new one is queued instead');
  end if;
  return new;
end
$$;
create trigger outbox_mail_guard before update or delete on outbox_mail
  for each row execute function outbox_mail_guard();
create trigger outbox_mail_no_truncate before truncate on outbox_mail
  for each statement execute function outbox_mail_guard();

-- Allocation runs (docs/domain-and-api.md §1 AllocationRun and Assignment,
-- §5): a run is the frozen input of a campaign (its snapshot), the seed and
-- the versions it was computed with, the solver's answer pass by pass and
-- what became of it; its assignment rows are the result. Many runs per
-- campaign, at most one published.
create table allocation_run (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaign (id),
  -- Lauf 1, 2, … of the campaign, as the organizer names them.
  seq integer not null check (seq >= 1),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'interrupted')),
  started_by uuid not null references app_user (id),
  started_at timestamptz not null default app_now(),
  finished_at timestamptz,
  -- The lot's seed and the solver's limit, recorded so the run can be repeated.
  seed bigint not null check (seed >= 0),
  limits jsonb not null check (jsonb_typeof(limits) = 'object'),
  core_version integer not null check (core_version >= 1),
  contract text not null check (char_length(contract) between 1 and 40),
  solver_version text check (solver_version is null or char_length(solver_version) <= 100),
  ortools_version text check (ortools_version is null or char_length(ortools_version) <= 100),
  -- The input as compiled (school-core AllocationInput), ids only, and its hash without the seed and the limit.
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings) = 'array'),
  -- The solver's answer per pass in the database's ids (school-core PassResult[]), once the run finished.
  passes jsonb not null default '[]' check (jsonb_typeof(passes) = 'array'),
  cancelled_items uuid[] not null default '{}',
  -- Why it failed: a code and, where there is one, the solver's or the validator's word.
  failure text check (failure is null or failure in ('solver_unreachable', 'solver_answer_invalid', 'solver_infeasible', 'solver_unknown', 'model_invalid', 'validation_failed', 'internal_error')),
  detail text check (detail is null or char_length(detail) <= 4000),
  problems jsonb not null default '[]' check (jsonb_typeof(problems) = 'array'),
  published_at timestamptz,
  published_by uuid references app_user (id),
  check ((finished_at is null) = (status = 'running')),
  check ((published_at is null) = (published_by is null)),
  check (published_at is null or status = 'succeeded'),
  check ((failure is null) = (status in ('running', 'succeeded'))),
  unique (campaign_id, seq)
);
create unique index allocation_run_published on allocation_run (campaign_id) where published_at is not null;
create index allocation_run_campaign on allocation_run (campaign_id, seq desc);

create function allocation_run_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('an allocation run is the record of what was computed; it is never removed');
  end if;
  if new.campaign_id <> old.campaign_id or new.seq <> old.seq or new.started_by <> old.started_by or new.started_at <> old.started_at
     or new.seed <> old.seed or new.limits <> old.limits or new.core_version <> old.core_version or new.contract <> old.contract
     or new.snapshot <> old.snapshot or new.snapshot_sha256 <> old.snapshot_sha256 or new.warnings <> old.warnings then
    perform refuse('a run keeps its input, seed and versions');
  end if;
  if old.published_at is not null then
    perform refuse('a published run never changes');
  end if;
  if old.status <> 'running' and (new.status <> old.status or new.finished_at <> old.finished_at or new.passes <> old.passes
     or new.cancelled_items <> old.cancelled_items or new.failure is distinct from old.failure or new.detail is distinct from old.detail or new.problems <> old.problems
     or new.solver_version is distinct from old.solver_version or new.ortools_version is distinct from old.ortools_version) then
    perform refuse('a finished run changes only by being published');
  end if;
  return new;
end
$$;
create trigger allocation_run_guard before update or delete on allocation_run
  for each row execute function allocation_run_guard();
create trigger allocation_run_no_truncate before truncate on allocation_run
  for each statement execute function allocation_run_guard();

-- A change after publication (docs/domain-and-api.md §3 rule 7, §4, §8): a
-- student's own move in the swap window, a class teacher's placement of a
-- student short of minutes, an organizer's change by hand. A change
-- supersedes assignment rows and adds rows, and is itself the record the
-- pages read (its reason for the organizer and the auditor alone).
create table assignment_change (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references allocation_run (id),
  -- Änderung 1, 2, … of the published run.
  seq integer not null check (seq >= 1),
  -- swap: the student's own move in the window; place: into a gap, by the
  -- class teacher or the organizer; move and remove: the organizer's.
  kind text not null check (kind in ('swap', 'place', 'move', 'remove')),
  person_id uuid not null references person (id),
  -- The item left by a move or a remove; a swap's left items are the rows it superseded.
  from_item_id uuid references catalog_item (id),
  to_item_id uuid references catalog_item (id),
  reason text check (reason is null or char_length(reason) between 1 and 500),
  -- The organizer overrode a full item or an item's minimum, on their responsibility.
  forced boolean not null default false,
  changed_by uuid not null references app_user (id),
  changed_at timestamptz not null default app_now(),
  unique (run_id, seq),
  check ((kind = 'swap') = (reason is null)),
  check (kind <> 'swap' or not forced),
  check ((to_item_id is not null) = (kind in ('swap', 'place', 'move'))),
  check ((from_item_id is not null) = (kind in ('move', 'remove'))),
  check (from_item_id is distinct from to_item_id)
);
create index assignment_change_run on assignment_change (run_id, seq);

create function assignment_change_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  perform refuse('a change of an assignment is never changed or removed');
  return null;
end
$$;
create trigger assignment_change_guard before update or delete on assignment_change
  for each row execute function assignment_change_guard();
create trigger assignment_change_no_truncate before truncate on assignment_change
  for each statement execute function assignment_change_guard();

-- A student's place in a run: copied from the pre-assignments (fixed), given
-- by the solver for a ranked item (solver, with the wish number) or a fee-free
-- fallback (fallback), or, after publication, moved by the student in the
-- swap window (swap) or placed by hand (manual). A row has an id of its own
-- (a student may leave an item and return to it), the change that added it
-- (swap and manual rows) and the change that superseded it. The current
-- rows of a run are those not superseded; a student is in an item once
-- among them. A row changes once, by being superseded by a change of its
-- run; nothing else, ever.
create table assignment (
  run_id uuid not null references allocation_run (id),
  person_id uuid not null references person (id),
  item_id uuid not null references catalog_item (id),
  source text not null check (source in ('fixed', 'solver', 'fallback', 'swap', 'manual')),
  pass smallint check (pass in (1, 2)),
  rank smallint check (rank >= 1),
  created_at timestamptz not null default app_now(),
  id uuid not null default gen_random_uuid(),
  change_id uuid references assignment_change (id),
  superseded_by uuid references assignment_change (id),
  primary key (id),
  check (source <> 'fixed' or (pass is null and rank is null)),
  check (source <> 'solver' or (pass is not null and rank is not null)),
  check (source <> 'fallback' or (pass is not null and rank is null)),
  constraint assignment_change_source check (source not in ('swap', 'manual') or change_id is not null)
);
create index assignment_person on assignment (run_id, person_id);
create index assignment_item on assignment (run_id, item_id);
create unique index assignment_current on assignment (run_id, person_id, item_id) where superseded_by is null;
-- The change log asks which rows a change superseded.
create index assignment_superseded on assignment (superseded_by) where superseded_by is not null;

create function assignment_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('an assignment row is never removed');
    return null;
  end if;
  if old.superseded_by is not null then
    perform refuse('a superseded assignment row never changes');
  end if;
  if new.superseded_by is null or new.id <> old.id or new.run_id <> old.run_id or new.person_id <> old.person_id or new.item_id <> old.item_id
     or new.source <> old.source or new.pass is distinct from old.pass or new.rank is distinct from old.rank or new.created_at <> old.created_at
     or new.change_id is distinct from old.change_id then
    perform refuse('an assignment row changes only by being superseded');
  end if;
  if not exists (select 1 from assignment_change c where c.id = new.superseded_by and c.run_id = new.run_id) then
    perform refuse('a row is superseded by a change of its own run');
  end if;
  return new;
end
$$;
create trigger assignment_guard before update or delete on assignment
  for each row execute function assignment_guard();
create trigger assignment_no_truncate before truncate on assignment
  for each statement execute function assignment_guard();

-- Attendance (docs/domain-and-api.md §1 Attendance, §8): per session and
-- student, recorded by the class teacher of the student's class (D-16) or
-- an organizer, from publication to the archive. Separate from the
-- assignments: an absent student keeps their place. A record is corrected
-- in place (the audit event keeps who said what when); never removed.
--
-- A session is named by its item and its position, not its id, so a record
-- survives an edit that rewrites an item's sessions (delete, then insert,
-- the positions the same). The reference is checked at commit, so a
-- rewrite inside one transaction passes; a session really gone takes its
-- records' reference with it, which the check then refuses.
create table attendance (
  item_id uuid not null references catalog_item (id),
  position smallint not null,
  person_id uuid not null references person (id),
  status text not null check (status in ('present', 'absent', 'excused')),
  note text not null default '' check (char_length(note) <= 200),
  recorded_by uuid not null references app_user (id),
  recorded_at timestamptz not null default app_now(),
  primary key (item_id, position, person_id),
  foreign key (item_id, position) references item_session (item_id, position) deferrable initially deferred
);
create index attendance_person on attendance (person_id);

create function attendance_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('an attendance record is corrected, not removed');
    return null;
  end if;
  if new.item_id <> old.item_id or new.position <> old.position or new.person_id <> old.person_id then
    perform refuse('an attendance record keeps its session and person');
  end if;
  return new;
end
$$;
create trigger attendance_guard before update or delete on attendance
  for each row execute function attendance_guard();
create trigger attendance_no_truncate before truncate on attendance
  for each statement execute function attendance_guard();

-- The retention purge (docs/open-decisions.md D-15): an administrator
-- removes the records of a school year once its retention has passed (one
-- year after the school year's end): the year's campaigns with everything
-- under them, its roster batches, its class-teacher rows, then every person
-- and account nobody names any more. Nothing is deleted automatically.
--
-- The guards refuse every deletion for every role; this is the one path
-- through them. A definer function owned by the migrator (the only role
-- with DELETE), it switches the guards off for its own transaction, and is
-- run by the application on an administrator's audited request: the
-- service checks the retention date and the reason before, and writes the
-- audit event after. Its retention check keeps the database's own now(),
-- not app_now(): it guards against the application, which must not move
-- it. Returns what it removed, per relation. Listed in
-- apps/api/lib/runtime-privileges.ts (RUNTIME_FUNCTIONS).
create function purge_school_year(year text) returns table (relation text, removed bigint)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  campaigns uuid[];
  batches uuid[];
  persons uuid[];
  settled uuid[];
  users uuid[];
  rounds integer := 0;
  n bigint;
begin
  if year !~ '^\d{4}/\d{2}$' then
    raise exception 'not a school year: %', year using errcode = '22023';
  end if;
  -- The retention (D-15): a year after the school year's end, the first of September of the year after the second, in
  -- Vienna. The service checks it first and says so in words; here it is what the stored data must satisfy whoever calls.
  if now() < make_timestamptz(substring(year from 1 for 4)::integer + 2, 9, 1, 0, 0, 0, 'Europe/Vienna') then
    raise exception 'the retention of % has not ended', year using errcode = '55000';
  end if;
  select coalesce(array_agg(id), '{}') into campaigns from campaign where school_year = year;
  if exists (select 1 from campaign where id = any(campaigns) and state <> 'archived') then
    raise exception 'a campaign of % is not archived', year using errcode = '55000';
  end if;
  -- The year's roster batches, unless a campaign of another year froze one, and never the roster in force (the newest
  -- committed batch): a campaign not yet frozen, whatever its year, goes by that one.
  select coalesce(array_agg(b.id), '{}') into batches from import_batch b
   where b.school_year = year
     and not exists (select 1 from campaign c where c.roster_batch_id = b.id and c.school_year <> year)
     and b.id is distinct from (select id from import_batch where state = 'committed' order by decided_at desc limit 1);
  perform set_config('schulwahl.purge', 'on', true);

  -- The campaigns, from the leaves up.
  with d as (delete from attendance a using catalog_item i where a.item_id = i.id and i.campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'attendance'; removed := n; return next;
  with d as (delete from assignment a using allocation_run r where a.run_id = r.id and r.campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'assignment'; removed := n; return next;
  with d as (delete from assignment_change c using allocation_run r where c.run_id = r.id and r.campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'assignment_change'; removed := n; return next;
  with d as (delete from allocation_run where campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'allocation_run'; removed := n; return next;
  with d as (delete from choice_revision where campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'choice_revision'; removed := n; return next;
  with d as (delete from choice where campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'choice'; removed := n; return next;
  with d as (delete from pre_assignment where campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'pre_assignment'; removed := n; return next;
  with d as (delete from outbox_mail where campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'outbox_mail'; removed := n; return next;
  with d as (delete from item_teacher t using catalog_item i where t.item_id = i.id and i.campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'item_teacher'; removed := n; return next;
  with d as (delete from item_session s using catalog_item i where s.item_id = i.id and i.campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'item_session'; removed := n; return next;
  with d as (delete from catalog_item where campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'catalog_item'; removed := n; return next;
  with d as (delete from role_grant where campaign_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'role_grant'; removed := n; return next;
  with d as (delete from audit_event where scope_id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'audit_event'; removed := n; return next;
  with d as (delete from campaign where id = any(campaigns) returning 1) select count(*) into n from d;
  relation := 'campaign'; removed := n; return next;

  -- The roster of the year: the references into the batches first, then the entries, then the batches.
  update identity_binding set import_batch_id = null where import_batch_id = any(batches);
  update import_batch set previous_batch_id = null where previous_batch_id = any(batches);
  with d as (delete from roster_entry where batch_id = any(batches) returning 1) select count(*) into n from d;
  relation := 'roster_entry'; removed := n; return next;
  with d as (delete from import_batch where id = any(batches) returning 1) select count(*) into n from d;
  relation := 'import_batch'; removed := n; return next;
  -- The year's class teachers go with the year's last batch: while one stays as the roster in force, they lead their classes still.
  with d as (delete from class_teacher where school_year = year and not exists (select 1 from import_batch b where b.school_year = year) returning 1) select count(*) into n from d;
  relation := 'class_teacher'; removed := n; return next;

  -- The people nobody names any more: no roster entry, no item, no place, no record, no class to lead. Their bindings go,
  -- and with them their accounts, unless an account also belongs to someone who stays, holds a role grant, or did
  -- something a remaining record refers to (a teacher who left keeps the account that proposed an item).
  select coalesce(array_agg(p.id order by p.id), '{}') into persons from person p
   where not exists (select 1 from roster_entry e where e.person_id = p.id)
     and not exists (select 1 from item_teacher t where t.person_id = p.id)
     and not exists (select 1 from pre_assignment a where a.person_id = p.id)
     and not exists (select 1 from choice c where c.person_id = p.id)
     and not exists (select 1 from choice_revision c where c.person_id = p.id)
     and not exists (select 1 from assignment a where a.person_id = p.id)
     and not exists (select 1 from assignment_change c where c.person_id = p.id)
     and not exists (select 1 from attendance a where a.person_id = p.id)
     and not exists (select 1 from outbox_mail m where m.person_id = p.id)
     and not exists (select 1 from class_teacher t where t.person_id = p.id);
  -- The accounts that go with them: bound to those persons alone, holding no role grant, named by no remaining record. A
  -- person whose account stays (a remaining record names it) stays whole, binding included, so a later purge finds the
  -- account through the binding once the last reference is gone; a binding without an account (a Graph import before
  -- the first sign-in) keeps nobody. Persons and accounts are settled together, until neither set changes.
  loop
    select coalesce(array_agg(u.id), '{}') into users from app_user u
     where exists (select 1 from identity_binding b where b.tid = u.tid and b.oid = u.oid and b.person_id = any(persons))
       and not exists (select 1 from identity_binding b where b.tid = u.tid and b.oid = u.oid and not (b.person_id = any(persons)))
       and not exists (select 1 from role_grant g where g.user_id = u.id or g.granted_by = u.id or g.revoked_by = u.id)
       and not exists (select 1 from app_user o where o.blocked_by = u.id)
       and not exists (select 1 from job j where j.started_by = u.id)
       and not exists (select 1 from import_batch b where b.triggered_by = u.id or b.decided_by = u.id)
       and not exists (select 1 from roster_group g where g.updated_by = u.id)
       and not exists (select 1 from identity_binding b where (b.bound_by = u.id or b.unbound_by = u.id) and not (b.person_id = any(persons)))
       and not exists (select 1 from campaign c where c.created_by = u.id)
       and not exists (select 1 from catalog_item i where i.proposed_by = u.id or i.approved_by = u.id or i.withdrawn_by = u.id)
       and not exists (select 1 from class_teacher t where t.assigned_by = u.id or t.revoked_by = u.id)
       and not exists (select 1 from pre_assignment a where a.exempted_by = u.id)
       and not exists (select 1 from choice c where c.entered_by = u.id)
       and not exists (select 1 from choice_revision c where c.entered_by = u.id)
       and not exists (select 1 from mail_template t where t.updated_by = u.id)
       and not exists (select 1 from allocation_run r where r.started_by = u.id or r.published_by = u.id)
       and not exists (select 1 from assignment_change c where c.changed_by = u.id)
       and not exists (select 1 from attendance a where a.recorded_by = u.id);
    select coalesce(array_agg(p.person_id order by p.person_id), '{}') into settled from unnest(persons) as p(person_id)
     where not exists (select 1 from identity_binding b join app_user u on u.tid = b.tid and u.oid = b.oid
                        where b.person_id = p.person_id and not (u.id = any(users)));
    exit when settled = persons;
    -- Every pass drops at least one person, so the loop ends; the bound is a belt.
    rounds := rounds + 1;
    if rounds > 100 then
      raise exception 'the persons and accounts to purge did not settle' using errcode = '55000';
    end if;
    persons := settled;
  end loop;
  with d as (delete from identity_binding where person_id = any(persons) returning 1) select count(*) into n from d;
  relation := 'identity_binding'; removed := n; return next;
  with d as (delete from app_user where id = any(users) returning 1) select count(*) into n from d;
  relation := 'app_user'; removed := n; return next;
  with d as (delete from person where id = any(persons) returning 1) select count(*) into n from d;
  relation := 'person'; removed := n; return next;

  perform set_config('schulwahl.purge', 'off', true);
  return;
end
$$;
