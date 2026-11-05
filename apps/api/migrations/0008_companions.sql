-- How many teachers an activity's lead wants beside them (the school's
-- wish 6, decided 2026-11-04): "Begleitungen: 0 bis 8". The companions
-- themselves stay the activity's teachers (item_teacher) but the lead; what
-- is still sought is the number wanted less the companions named. A teacher
-- of the registration joins an activity that still seeks one, and leaves it
-- again until the registration opens. Additive: no schema version.
alter table catalog_item add column companions_wanted smallint not null default 0 check (companions_wanted between 0 and 8);
