-- The school's period grid (D-25), the campaign's windows and choice
-- settings (D-05, D-06, D-13), and the class teachers (D-17): what S3a
-- stores. Compatible with the release before it: every new column has a
-- default or allows null, and nothing existing changes shape. No grants
-- here: the migrator applies apps/api/lib/runtime-privileges.ts.

-- The lesson periods, one row each, numbered from 1; replaced as a whole
-- by an administrator. Seeded with the grid most Austrian schools run on.
create table period_grid (
  period smallint primary key check (period between 1 and 20),
  starts time not null,
  ends time not null,
  check (ends > starts)
);
insert into period_grid (period, starts, ends) values
  (1, '07:35', '08:25'), (2, '08:30', '09:20'), (3, '09:25', '10:15'), (4, '10:30', '11:20'), (5, '11:25', '12:15'),
  (6, '12:20', '13:10'), (7, '13:15', '14:05'), (8, '14:10', '15:00'), (9, '15:05', '15:55'), (10, '16:00', '16:50');

-- The choice window with its grace week, the swap window after
-- publication, and what the window asks of a student: the wishes per time
-- group and the daily minimum per grade ({"9": 240, ...}, minutes).
-- Whether the catalogue names the teachers is the school's call (D-13).
alter table campaign
  add column opens_at timestamptz,
  add column closes_at timestamptz,
  add column late_until timestamptz,
  add column swap_from timestamptz,
  add column swap_until timestamptz,
  add column wishes_per_group smallint not null default 3 check (wishes_per_group between 1 and 10),
  add column daily_minimum jsonb not null default '{}' check (jsonb_typeof(daily_minimum) = 'object'),
  add column show_teachers boolean not null default true,
  add constraint campaign_window_order check (opens_at is null or closes_at is null or opens_at < closes_at),
  add constraint campaign_grace_order check (closes_at is null or late_until is null or closes_at <= late_until),
  add constraint campaign_swap_order check (swap_from is null or swap_until is null or swap_from <= swap_until);

-- Who is class teacher of which class in a school year, as assigned in the
-- app (the CSV roster may also name one by address; both count). An
-- assignment is made and revoked, never changed or removed.
create table class_teacher (
  id uuid primary key default gen_random_uuid(),
  school_year text not null check (school_year ~ '^\d{4}/\d{2}$'),
  class_name text not null check (char_length(class_name) between 1 and 16),
  person_id uuid not null references person (id),
  assigned_by uuid not null references app_user (id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references app_user (id),
  check ((revoked_at is null) = (revoked_by is null))
);
create unique index class_teacher_active on class_teacher (school_year, class_name, person_id) where revoked_at is null;
create index class_teacher_person on class_teacher (person_id) where revoked_at is null;

create function class_teacher_guard() returns trigger language plpgsql as $$
begin
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
