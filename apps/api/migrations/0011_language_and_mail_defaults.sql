-- The school's language (mvp-plan S6d): the pages, the workbooks and the
-- notices speak the language an administrator sets here, one of the
-- message catalogue's (packages/messages LOCALES). Nothing of S6d has been
-- released, so this migration need not carry an older release's code.
-- No grants here: the migrator applies apps/api/lib/runtime-privileges.ts.

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
