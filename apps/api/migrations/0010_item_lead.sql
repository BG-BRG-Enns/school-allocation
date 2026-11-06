-- Who leads an activity is stored, not derived (the project lead's decision
-- of 2026-11-06): until now the lead was read on every look as "the
-- proposer when among the teachers, else the first named", so an organizer
-- who had created an activity for a colleague and later signed up to
-- accompany it became its lead, and nobody could hand the lead over. A
-- teacher added to an activity, by anyone or by joining, now accompanies;
-- the lead changes only when the lead hands it to a companion or an
-- organizer names another.
--
-- One teacher of an activity leads: a mark on item_teacher, at most one per
-- activity. Every activity keeps the lead it had on the day of this
-- migration: the proposer's person in the roster when among its teachers,
-- else the first named. The release this migration ships in already raised
-- the schema version (0009), so it carries none of its own.
alter table item_teacher add column lead boolean not null default false;

update item_teacher t
   set lead = true
 where t.person_id = coalesce(
         (select b.person_id
            from catalog_item i
            join app_user u on u.id = i.proposed_by
            join identity_binding b on b.tid = u.tid and b.oid = u.oid and b.unbound_at is null
           where i.id = t.item_id
             and exists (select 1 from item_teacher x where x.item_id = i.id and x.person_id = b.person_id)),
         (select x.person_id from item_teacher x where x.item_id = t.item_id order by x.position limit 1));

create unique index item_teacher_lead on item_teacher (item_id) where lead;
