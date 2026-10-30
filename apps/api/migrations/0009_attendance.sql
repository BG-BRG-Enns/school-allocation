-- Attendance (docs/domain-and-api.md §1 Attendance, §8; mvp-plan S5b): per
-- session and student, recorded by the class teacher of the student's class
-- (D-16) or an organizer, from publication to the archive. Separate from the
-- assignments: an absent student keeps their place. A record is corrected
-- in place (the audit event keeps who said what when); never removed.
--
-- A session is named by its item and its position, not its id: the release
-- before this one rewrites an item's sessions on every edit (delete, then
-- insert, the positions the same), and a record must survive that. The
-- reference is checked at commit, so a rewrite inside one transaction
-- passes; a session really gone takes its records' reference with it, which
-- the check then refuses. Compatible with the release before it: one new
-- table. No grants here.

create table attendance (
  item_id uuid not null references catalog_item (id),
  position smallint not null,
  person_id uuid not null references person (id),
  status text not null check (status in ('present', 'absent', 'excused')),
  note text not null default '' check (char_length(note) <= 200),
  recorded_by uuid not null references app_user (id),
  recorded_at timestamptz not null default now(),
  primary key (item_id, position, person_id),
  foreign key (item_id, position) references item_session (item_id, position) deferrable initially deferred
);
create index attendance_person on attendance (person_id);

create function attendance_guard() returns trigger language plpgsql as $$
begin
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
