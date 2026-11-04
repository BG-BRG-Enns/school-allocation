-- Whether a teacher must lead an activity (the school's wish 5, decided
-- 2026-11-04): a mark for the overview of who has done their part, read by
-- Lehrkräfte je Tag alone; what the teacher may do does not change. Like
-- the abbreviation and the note it belongs to the person, set by the
-- availability import's "Leitung" column (empty: a duty, N: none) or by an
-- organizer beside the abbreviation, and replaced by the next import. A
-- teacher without a row has the duty. Additive: no schema version.
alter table teacher_detail add column lead_duty boolean not null default true;
