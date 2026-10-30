-- Attendance (docs/domain-and-api.md §1 Attendance, §8; mvp-plan S5b): per
-- session and student, recorded by the class teacher of the student's class
-- (D-16) or an organizer, from publication to the archive. Separate from the
-- assignments: an absent student keeps their place. A record is corrected
-- in place (the audit event keeps who said what when); never removed.
-- Compatible with the release before it: one new table. No grants here.

create table attendance (
  session_id uuid not null references item_session (id),
  person_id uuid not null references person (id),
  status text not null check (status in ('present', 'absent', 'excused')),
  note text not null default '' check (char_length(note) <= 200),
  recorded_by uuid not null references app_user (id),
  recorded_at timestamptz not null default now(),
  primary key (session_id, person_id)
);
create index attendance_person on attendance (person_id);

create function attendance_guard() returns trigger language plpgsql as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('an attendance record is corrected, not removed');
    return null;
  end if;
  if new.session_id <> old.session_id or new.person_id <> old.person_id then
    perform refuse('an attendance record keeps its session and person');
  end if;
  return new;
end
$$;
create trigger attendance_guard before update or delete on attendance
  for each row execute function attendance_guard();
create trigger attendance_no_truncate before truncate on attendance
  for each statement execute function attendance_guard();
