-- The gate on new offers and the first submission (the school's wishes 1
-- and 2, decided 2026-11-04). A registration may lock new offers once every
-- cell an activity would serve has reached its target (off unless the
-- organizer turns it on). An activity remembers when it was first
-- submitted (the order the organization reviews in; a return and a
-- resubmission do not move it) and the shape it was last submitted with
-- (places, grades, classes, sessions), by which a resubmission is judged:
-- the gate asks only about the cells that get more places than before.
-- Additive: no schema version.
alter table campaign add column lock_new_offers boolean not null default false;

alter table catalog_item add column first_proposed_at timestamptz;
alter table catalog_item add column proposed_shape jsonb check (proposed_shape is null or jsonb_typeof(proposed_shape) = 'object');

-- An activity submitted before this release: the approval came after its submission, else the last change was it.
update catalog_item set first_proposed_at = coalesce(approved_at, updated_at) where state in ('proposed', 'approved') and first_proposed_at is null;
