-- The schema of version 1, as far as the foundation goes: who signed in, who
-- holds which role, what happened, and whether a job is executing. Later
-- migrations add the roster, the campaigns and everything a campaign holds;
-- this file is never edited once applied (scripts/migrate.ts records its
-- hash). No grants here: the migrator applies apps/api/lib/runtime-privileges.ts
-- on every run.

-- How a trigger refuses a change: SQLSTATE 55000, which the application maps
-- by code (lib/pg-errors.ts). The message names the rule, never a value.
create function refuse(rule text) returns void language plpgsql as $$
begin
  raise exception using message = rule, errcode = '55000';
end
$$;

-- Everyone who has signed in: the stable Entra identity (tenant and object
-- id) and what the token said about them last. Nobody is matched by e-mail
-- address or by oid alone; nobody is deleted. The roster, which says who
-- takes part in which class, comes with a later migration and binds to this
-- identity.
create table app_user (
  id uuid primary key default gen_random_uuid(),
  tid uuid not null,
  oid uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 256),
  email text check (email is null or char_length(email) between 3 and 254),
  first_sign_in_at timestamptz not null default now(),
  last_sign_in_at timestamptz not null default now(),
  -- An administrator's block: no sign-in, and the running session ends at
  -- the next request.
  blocked_at timestamptz,
  blocked_by uuid references app_user (id),
  check ((blocked_at is null) = (blocked_by is null)),
  constraint app_user_identity unique (tid, oid)
);

-- The privileged roles, granted in the application and audited: for the
-- school (campaign_id null), or for one campaign once campaigns exist (a
-- later migration adds the reference). A grant is revoked, never changed
-- or removed, so the history of who could do what stays readable.
create table role_grant (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user (id),
  role text not null check (role in ('school_admin', 'campaign_organizer', 'read_only_auditor')),
  campaign_id uuid,
  granted_by uuid not null references app_user (id),
  granted_at timestamptz not null default now(),
  reason text not null check (char_length(reason) between 1 and 500),
  revoked_at timestamptz,
  revoked_by uuid references app_user (id),
  check ((revoked_at is null) = (revoked_by is null)),
  check (revoked_at is null or revoked_at >= granted_at)
);
-- One active grant per person, role and scope; the school scope is null.
create unique index role_grant_active on role_grant (user_id, role, campaign_id) nulls not distinct where revoked_at is null;
create index role_grant_user on role_grant (user_id) where revoked_at is null;

create function role_grant_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform refuse('a role grant is revoked, not removed');
  end if;
  if old.revoked_at is not null then
    perform refuse('a revoked role grant does not change');
  end if;
  if new.user_id <> old.user_id or new.role <> old.role or new.campaign_id is distinct from old.campaign_id
     or new.granted_by <> old.granted_by or new.granted_at <> old.granted_at or new.reason <> old.reason then
    perform refuse('only the revocation of a role grant changes');
  end if;
  return new;
end
$$;
create trigger role_grant_guard before update or delete on role_grant
  for each row execute function role_grant_guard();

-- The administrative audit log, a hash chain per scope (lib/audit-chain.ts):
-- a campaign's id, or the fixed school scope for what is not a campaign's.
-- Append-only, and the chain is linear: one first event per scope, every
-- event the predecessor of at most one other.
create table audit_event (
  seq bigint generated always as identity primary key,
  scope_id uuid not null,
  -- A finite time in whole milliseconds, which the hashed ISO 8601 text and
  -- a JavaScript Date hold exactly.
  at timestamptz not null check (isfinite(at) and at = date_trunc('milliseconds', at)),
  -- The stable Entra identity of the actor, and the name shown for it.
  actor_tid uuid not null,
  actor_oid uuid not null,
  actor_name text not null check (char_length(actor_name) between 1 and 256),
  action text not null check (action ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$' and char_length(action) <= 64),
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object'),
  prev_seq bigint,
  prev_hash text check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  check ((prev_seq is null) = (prev_hash is null)),
  check (prev_seq < seq),
  unique (scope_id, hash),
  unique (scope_id, seq, hash),
  unique nulls not distinct (scope_id, prev_hash),
  foreign key (scope_id, prev_seq, prev_hash) references audit_event (scope_id, seq, hash)
);
create index audit_event_scope_seq on audit_event (scope_id, seq);

create function audit_event_guard() returns trigger language plpgsql as $$
begin
  perform refuse('the audit log is append-only');
  return null;
end
$$;
create trigger audit_event_guard before update or delete on audit_event
  for each row execute function audit_event_guard();
-- A row-level trigger does not see TRUNCATE; a statement-level one does.
create trigger audit_event_no_truncate before truncate on audit_event
  for each statement execute function audit_event_guard();

create function role_grant_no_truncate() returns trigger language plpgsql as $$
begin
  perform refuse('a role grant is revoked, not removed');
  return null;
end
$$;
create trigger role_grant_no_truncate before truncate on role_grant
  for each statement execute function role_grant_no_truncate();

-- A job that runs for a while and must not be interrupted by an update or
-- a restart: an allocation run, a roster import, an outbox flush. The
-- health check reports "busy" while one is unfinished (deploy/not-busy.sh
-- asks it). A job the process died on is marked interrupted at the next
-- start; its work is re-run from its frozen input, never resumed.
create table job (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind ~ '^[a-z][a-z0-9_]*$' and char_length(kind) <= 64),
  started_by uuid references app_user (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text check (outcome in ('succeeded', 'failed', 'interrupted')),
  check ((finished_at is null) = (outcome is null)),
  check (finished_at is null or finished_at >= started_at)
);
create index job_unfinished on job (started_at) where finished_at is null;
