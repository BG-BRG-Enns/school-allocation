-- What the school knows about a teacher beyond the roster: the abbreviation
-- everyone goes by (the Kürzel) and a note the organizer reads when
-- planning ("reserve only"). Outside the roster batches, like a teacher's
-- availability: it lives with the person and is replaced by the next
-- import. Additive: no schema version.
create table teacher_detail (
  person_id uuid primary key references person (id) on delete cascade,
  short_name text check (short_name is null or char_length(short_name) between 1 and 8),
  note text check (note is null or char_length(note) <= 200),
  updated_at timestamptz not null default app_now()
);
-- One abbreviation names one teacher, in any case of the letters.
create unique index teacher_detail_short_name on teacher_detail (lower(short_name)) where short_name is not null;
