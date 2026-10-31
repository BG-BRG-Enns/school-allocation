-- Planning with teachers: whether a teacher is available on a project day,
-- and how many places beyond the need a registration aims for.
--
-- Availability is a teacher's, per date, not per registration: the project
-- days of the school year's registrations. No row means available; a row
-- says unavailable, or available only if needed. No reason is stored: a
-- free day, an exemption and an entrance exam all read the same. A teacher
-- sets their own while a registration with that day takes proposals; an
-- organizer sets anyone's, recorded in the registration's audit chain. The
-- rows go with their person, and the retention purge removes a school
-- year's dates.
--
-- No grants here: the migrator applies apps/api/lib/runtime-privileges.ts.

create table teacher_availability (
  person_id uuid not null references person (id) on delete cascade,
  day date not null,
  status text not null check (status in ('unavailable', 'if_needed')),
  updated_at timestamptz not null default app_now(),
  primary key (person_id, day)
);
create index teacher_availability_day on teacher_availability (day);

-- The demand's target: the places a day offers a grade should exceed the
-- students who need one by this share, so wishes have room.
alter table campaign add column place_headroom_percent smallint not null default 20 check (place_headroom_percent between 0 and 100);
