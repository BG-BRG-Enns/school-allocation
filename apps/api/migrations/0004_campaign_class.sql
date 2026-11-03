-- schema-version: 2
-- The classes a registration is for (docs/open-decisions.md D-21, amended
-- 2026-11-03): an explicit list per registration, filled when it is created
-- (every class of the class lists, unless the organizer takes some out) and
-- changed while it is set up or takes proposals. Every reader of "the
-- registration's students" goes through it: the invitations, the
-- pre-assignments, the demand, the class pages and the notices to class
-- teachers, what a student sees. A release built before this table reads
-- every class of the roster again and would invite a class that was taken
-- out, silently; so this raises the schema version, and such a release
-- refuses to start (lib/db.ts checkSchema, scripts/migrate.ts).
create table campaign_class (
  campaign_id uuid not null references campaign (id) on delete cascade,
  class_name text not null check (char_length(class_name) between 1 and 16),
  primary key (campaign_id, class_name)
);

-- Every registration there is keeps every class of the roster it goes by: the one frozen at its close, else the one in
-- force. Nothing changes for them.
insert into campaign_class (campaign_id, class_name)
select distinct c.id, e.class_name
  from campaign c
  join roster_entry e on e.batch_id = coalesce(c.roster_batch_id, (select id from import_batch where state = 'committed' order by decided_at desc limit 1))
 where e.kind = 'student' and e.class_name is not null;
