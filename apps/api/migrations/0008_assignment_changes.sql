-- Changes after publication (docs/domain-and-api.md §3 rule 7, §4, §8;
-- mvp-plan S5a): a student's own move in the swap window, a class teacher's
-- placement of a student short of minutes, an organizer's change by hand.
-- An assignment row is never changed or removed: a change supersedes rows
-- and adds rows, and the change itself is the record the pages read (its
-- reason for the organizer and the auditor alone). Compatible with the
-- release before it: nullable columns, a new table, two template rows; the
-- previous release reads every row as published and shows a moved student
-- in both places until the new release is back, which nothing writes on.
-- No grants here: the migrator applies apps/api/lib/runtime-privileges.ts.

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
  changed_at timestamptz not null default now(),
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
  perform refuse('a change of an assignment is never changed or removed');
  return null;
end
$$;
create trigger assignment_change_guard before update or delete on assignment_change
  for each row execute function assignment_change_guard();
create trigger assignment_change_no_truncate before truncate on assignment_change
  for each statement execute function assignment_change_guard();

-- A row gets an id of its own (a student may leave an item and return to
-- it), the change that added it (swap and manual rows) and the change that
-- superseded it. The current rows of a run are those not superseded; a
-- student is in an item once among them.
alter table assignment add column id uuid not null default gen_random_uuid();
alter table assignment add column change_id uuid references assignment_change (id);
alter table assignment add column superseded_by uuid references assignment_change (id);
alter table assignment drop constraint assignment_pkey;
alter table assignment add primary key (id);
create unique index assignment_current on assignment (run_id, person_id, item_id) where superseded_by is null;
alter table assignment add constraint assignment_change_source check (source not in ('swap', 'manual') or change_id is not null);

-- The guard: a row changes once, by being superseded by a change of its run; nothing else, ever.
create or replace function assignment_guard() returns trigger language plpgsql as $$
begin
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

-- The two notices (docs/domain-and-api.md §4): the student who moved, and the student placed or changed by hand.
insert into mail_template (kind, subject, body) values
  ('swap_confirmed', '{{wahl}}: dein Tausch',
   E'Hallo {{vorname}},\n\ndein Tausch bei {{wahl}} ist eingetragen. Das ist jetzt dein Programm:\n\n{{zuteilung}}\n\nAlle Einzelheiten siehst du hier:\n\n{{link}}'),
  ('assignment_changed', '{{wahl}}: deine Zuteilung wurde geändert',
   E'Hallo {{vorname}},\n\ndeine Zuteilung bei {{wahl}} wurde von {{wer}} geändert: {{aenderung}}\n\nDas ist jetzt dein Programm:\n\n{{zuteilung}}\n\nAlle Einzelheiten siehst du hier:\n\n{{link}}')
on conflict (kind) do nothing;
