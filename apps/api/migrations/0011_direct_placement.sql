-- Direct placement, and leaving a class activity (the project lead's
-- decisions of 2026-11-06, amending D-24). A teacher of an activity places
-- single students into it: a row of source 'direct', saying whether the
-- placement takes the student out of the class activities it overlaps
-- (leaves_class, the default) or stands beside them. Who placed whom is in
-- the audit log, as for every act. A direct
-- placement beats a class placement; nothing is written to the class row
-- for that, the readers work it out (school-core placements.ts).
--
-- A teacher of a class activity also takes a student of its classes out by
-- hand, without a reason, from the moment the activity exists, and puts
-- them back: the exemption, which until now was an organizer's, with a
-- reason, while the window was open, and for good. So an exempted row may
-- be written before the window opens, its reason may be missing, and an
-- exemption may be lifted (never altered). A direct placement is removed
-- like it was made.
--
-- 'manual' stays in the list of sources, unused as before. The release this
-- migration ships in already raised the schema version (0009).
alter table pre_assignment
  drop constraint pre_assignment_source_check,
  add constraint pre_assignment_source_check check (source in ('class', 'manual', 'direct')),
  drop constraint pre_assignment_check,
  add constraint pre_assignment_check check ((exempted_at is null) = (exempted_by is null) and (exempt_reason is null or exempted_at is not null)),
  add column leaves_class boolean not null default true,
  add constraint pre_assignment_direct_exempt_check check (source <> 'direct' or exempted_at is null);

create or replace function pre_assignment_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  -- A placement by class that holds goes with its class; a direct placement goes when its teachers take it back.
  if tg_op = 'DELETE' and old.source in ('class', 'direct') and old.exempted_at is null then
    return old;
  end if;
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('an exempted or manual pre-assignment is never removed');
  end if;
  if new.source <> old.source or new.created_at <> old.created_at then
    perform refuse('a pre-assignment keeps its source');
  end if;
  -- An exemption is given once and may be lifted whole; what it says never changes.
  if old.exempted_at is not null and new.exempted_at is not null
     and (new.exempted_at is distinct from old.exempted_at or new.exempted_by is distinct from old.exempted_by or new.exempt_reason is distinct from old.exempt_reason) then
    perform refuse('an exemption stays as it was given');
  end if;
  return new;
end
$$;
