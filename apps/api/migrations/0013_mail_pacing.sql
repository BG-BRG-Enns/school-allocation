-- schema-version: 3
-- Mail pacing: the sender takes one mail at a time, at most MAIL_PER_HOUR
-- an hour, spaced from the last claim the database holds, so neither a
-- restart nor a second process sends a burst. A mail's priority, set when
-- it is queued, decides its turn before its age: 1 for a mail someone
-- waits for (a swap's confirmation, a change, the test mail), 2 for staff,
-- 3 for students in bulk. An organizer or administrator can pause sending;
-- queued mails stay queued. A reminder expires at the end of the window it
-- reminds of: still queued then, it becomes `expired` and is never sent,
-- and stays so like a sent or failed one.
--
-- It raises the schema version: a release before it knows no `expired`
-- mail and fails to answer for one. No grants here: the migrator applies
-- apps/api/lib/runtime-privileges.ts.

alter table outbox_mail
  add column priority smallint not null default 3 check (priority between 1 and 3),
  add column claimed_at timestamptz,
  add column expires_at timestamptz,
  drop constraint outbox_mail_state_check,
  add constraint outbox_mail_state_check check (state in ('queued', 'sending', 'sent', 'failed', 'expired'));

update outbox_mail set priority = case
  when kind in ('swap_confirmed', 'assignment_changed') or dedupe_key like 'test:%' then 1
  when kind in ('class_missing', 'class_unplaced', 'item_cancelled') then 2
  else 3
end;

-- The reminders queued before this migration expire with their window too:
-- at its end, or now when the campaign has already left it (an early
-- close leaves the planned end in the future).
update outbox_mail m set expires_at = case m.kind when 'choice_reminder' then c.closes_at else c.late_until end
  from campaign c
 where c.id = m.campaign_id and m.kind in ('choice_reminder', 'grace_reminder') and m.state in ('queued', 'sending');
update outbox_mail m set state = 'expired', updated_at = app_now()
  from campaign c
 where c.id = m.campaign_id and m.state = 'queued'
   and ((m.kind = 'choice_reminder' and c.state <> 'open') or (m.kind = 'grace_reminder' and c.state <> 'grace'));

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
  if old.state in ('sent', 'failed', 'expired') and new.state <> old.state then
    perform refuse('a sent, failed or expired mail stays so; a new one is queued instead');
  end if;
  return new;
end
$$;

-- The queue in the order claims take it; the last claim, which the spacing is measured from.
drop index outbox_mail_queue;
create index outbox_mail_queue on outbox_mail (priority, created_at) where state = 'queued';
create index outbox_mail_claimed on outbox_mail (claimed_at) where claimed_at is not null;

alter table school_setting add column mail_paused boolean not null default false;
