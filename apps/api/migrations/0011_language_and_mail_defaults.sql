-- The school's language and the mail templates' defaults (mvp-plan S6d):
-- the pages, the workbooks and the notices speak the language an
-- administrator sets here, one of the message catalogue's (packages/messages
-- LOCALES), and a mail template's default text is the catalogue's in that
-- language rather than a seeded row. A row of mail_template is now what an
-- organizer saved, kept with the language it was written in; removing it
-- is the reset to the default. The placeholders take English names, as
-- code does. Nothing of S6d has been released, so this migration need not
-- carry an older release's code. No grants here: the migrator applies
-- apps/api/lib/runtime-privileges.ts.

-- One row, the school's: its language, and who set it last. The audit log
-- keeps every change with who made it, so the retention purge may remove
-- that account (D-15), which empties the column.
create table school_setting (
  id boolean primary key default true check (id),
  locale text not null default 'de' check (locale in ('de', 'de-formal', 'en')),
  updated_at timestamptz not null default now(),
  updated_by uuid references app_user (id) on delete set null
);
insert into school_setting default values;

-- A template's row is removed by the reset, one kind at a time, audited by
-- the application; truncating the table stays refused, for every role.
drop trigger mail_template_guard on mail_template;
create or replace function mail_template_guard() returns trigger language plpgsql as $$
begin
  perform refuse('a mail template is reset one kind at a time, never truncated');
  return null;
end
$$;

-- The seeded defaults go: 0005, 0007 and 0008 inserted them without an
-- author, and only a save in the app sets one. The catalogue has them now.
delete from mail_template where updated_by is null;
-- What stays was saved by an organizer, in German with du: the only
-- language there was.
alter table mail_template
  alter column updated_by set not null,
  add column locale text not null default 'de' check (locale in ('de', 'de-formal', 'en'));

-- The placeholders' English names, in every form the template syntax
-- allows a name in (apps/api/lib/mail/template-parse.ts): {{x}}, {{{x}}}
-- and {{#if x}}, with blanks inside the braces. A name is replaced only
-- where it stands whole between them; name, link and minimum keep theirs.
do $$
declare
  renamed record;
begin
  for renamed in select old, new from (values
    ('vorname', 'first_name'), ('wahl', 'campaign'), ('frist', 'deadline'), ('projekttage', 'project_days'),
    ('klasse', 'class_name'), ('fenster', 'window'), ('liste', 'list'), ('zuteilung', 'programme'),
    ('tauschfenster', 'swap_period'), ('aktivitaet', 'activity'), ('anmeldungen', 'wish_count'),
    ('wer', 'changed_by'), ('aenderung', 'change')
  ) as names (old, new) loop
    update mail_template set
      subject = regexp_replace(subject, '(\{\{\{?\s*(?:#if\s+)?)' || renamed.old || '(\s*\})', '\1' || renamed.new || '\2', 'g'),
      body = regexp_replace(body, '(\{\{\{?\s*(?:#if\s+)?)' || renamed.old || '(\s*\})', '\1' || renamed.new || '\2', 'g');
  end loop;
end
$$;
