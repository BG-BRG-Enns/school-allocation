-- Whether the teachers of the roster also see the activities others have
-- submitted (the school's feedback of 2026-11-10: the same activity was
-- submitted twice, because nobody saw the first before its approval). A
-- switch of the registration, off unless the organizer turns it on: until
-- then a teacher sees of the others the approved activities alone, as
-- before. Drafts and withdrawn activities stay their own people's either
-- way. Additive: no schema version.
alter table campaign add column teachers_see_proposed boolean not null default false;
