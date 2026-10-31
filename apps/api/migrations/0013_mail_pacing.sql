-- schema-version: 3
-- Mail pacing: the sender takes one mail at a time, at most MAIL_PER_HOUR
-- an hour, spaced from the last claim the database holds, so neither a
-- restart nor a second process sends a burst. A mail's priority, set when
-- it is queued, decides its turn before its age: 1 for a mail someone
-- waits for (a swap's confirmation, a change, the test mail), 2 for staff,
-- 3 for students in bulk. An organizer or administrator can pause sending;
-- queued mails stay queued. A reminder expires at the end of the window it
-- reminds of: still queued then, it becomes `expired` and is never sent.
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

-- The queue in the order claims take it; the last claim, which the spacing is measured from.
drop index outbox_mail_queue;
create index outbox_mail_queue on outbox_mail (priority, created_at) where state = 'queued';
create index outbox_mail_claimed on outbox_mail (claimed_at) where claimed_at is not null;

alter table school_setting add column mail_paused boolean not null default false;
