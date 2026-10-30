-- The retention purge (docs/open-decisions.md D-15; mvp-plan S5c): an
-- administrator removes the records of a school year once its retention
-- has passed (one year after the school year's end): the year's campaigns
-- with everything under them, its roster batches, its class-teacher rows,
-- then every person and account nobody names any more. Nothing is deleted
-- automatically.
--
-- The guards refuse every deletion for every role, as they should; the
-- purge is the one path through them. It is a definer function owned by
-- the migrator, which switches the guards off for its own transaction with
-- a transaction-local setting that the guards read first. The guards honour
-- the setting only while a definer function runs (current_user differs
-- from session_user then), so the runtime role, which may set any setting
-- and may delete a draft or a pre-assignment by class, cannot switch a
-- guard off from outside. The function is listed in
-- apps/api/lib/runtime-privileges.ts (RUNTIME_FUNCTIONS).

-- Every guard that refuses a deletion learns the switch, inline: a trigger
-- runs as whoever writes, and the runtime role may execute no function the
-- grant list does not name. The rule stays as it was for everyone else,
-- the owner at a prompt included (current_user is session_user there).

create or replace function audit_event_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  perform refuse('the audit log is append-only');
  return null;
end
$$;

create or replace function role_grant_guard() returns trigger language plpgsql as $$
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

create or replace function import_batch_guard() returns trigger language plpgsql as $$
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

create or replace function roster_entry_guard() returns trigger language plpgsql as $$
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

create or replace function identity_binding_guard() returns trigger language plpgsql as $$
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

create or replace function catalog_item_guard() returns trigger language plpgsql as $$
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

create or replace function class_teacher_guard() returns trigger language plpgsql as $$
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

create or replace function pre_assignment_guard() returns trigger language plpgsql as $$
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

create or replace function choice_revision_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  perform refuse('a choice revision is never changed or removed');
  return null;
end
$$;

create or replace function outbox_mail_guard() returns trigger language plpgsql as $$
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
  if old.state in ('sent', 'failed') and new.state <> old.state then
    perform refuse('a sent or failed mail stays so; a new one is queued instead');
  end if;
  return new;
end
$$;

create or replace function allocation_run_guard() returns trigger language plpgsql as $$
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

create or replace function assignment_guard() returns trigger language plpgsql as $$
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

create or replace function assignment_change_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('schulwahl.purge', true), '') = 'on' and current_user <> session_user then return old; end if;
  perform refuse('a change of an assignment is never changed or removed');
  return null;
end
$$;

create or replace function attendance_guard() returns trigger language plpgsql as $$
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

-- The purge itself. Owned by the migrator (the only role with DELETE), run
-- by the application on an administrator's audited request; the service
-- checks the retention date and the reason before, and writes the audit
-- event after. Returns what it removed, per relation.
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
