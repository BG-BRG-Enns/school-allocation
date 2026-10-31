-- schema-version: 2
-- One clock: every time the application writes or compares comes from
-- app_now(), which is the database's own now() unless the transaction set
-- app.now. Only a test sets it, through a clock of its own
-- (apps/api/lib/db.ts); the server never does, so a school's database reads
-- now() as before. The columns' defaults follow it, so a row a test inserts
-- carries the test's time, as everything else the application writes does.
-- The retention guard in purge_school_year (0010) keeps the database's own
-- now(): it guards against the application, which must not move it.
--
-- It raises the schema version: the defaults need EXECUTE on app_now(),
-- which the migrator of a release before it would revoke from the runtime
-- role, failing every insert that takes a default. No grants here: the
-- migrator applies apps/api/lib/runtime-privileges.ts.

create function app_now() returns timestamptz language sql stable parallel safe
  return coalesce(nullif(current_setting('app.now', true), '')::timestamptz, now());

alter table allocation_run alter column started_at set default app_now();
alter table app_user alter column first_sign_in_at set default app_now(), alter column last_sign_in_at set default app_now();
alter table assignment alter column created_at set default app_now();
alter table assignment_change alter column changed_at set default app_now();
alter table attendance alter column recorded_at set default app_now();
alter table campaign alter column created_at set default app_now(), alter column updated_at set default app_now();
alter table catalog_item alter column created_at set default app_now(), alter column updated_at set default app_now();
alter table choice alter column updated_at set default app_now();
alter table choice_revision alter column saved_at set default app_now();
alter table class_teacher alter column assigned_at set default app_now();
alter table identity_binding alter column bound_at set default app_now();
alter table import_batch alter column fetched_at set default app_now();
alter table job alter column started_at set default app_now();
alter table mail_template alter column updated_at set default app_now();
alter table outbox_mail alter column next_attempt_at set default app_now(), alter column created_at set default app_now(), alter column updated_at set default app_now();
alter table person alter column created_at set default app_now();
alter table pre_assignment alter column created_at set default app_now();
alter table role_grant alter column granted_at set default app_now();
alter table roster_group alter column updated_at set default app_now();
alter table school_setting alter column updated_at set default app_now();
