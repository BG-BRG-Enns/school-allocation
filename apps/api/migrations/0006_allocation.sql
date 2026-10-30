-- Allocation runs (docs/domain-and-api.md §1 AllocationRun and Assignment,
-- §5): a run is the frozen input of a campaign (its snapshot), the seed and
-- the versions it was computed with, the solver's answer pass by pass and
-- what became of it; its assignment rows are the result. Many runs per
-- campaign, at most one published. Compatible with the release before it:
-- two new tables, nothing existing changes shape. No grants here: the
-- migrator applies apps/api/lib/runtime-privileges.ts.

create table allocation_run (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaign (id),
  -- Lauf 1, 2, … of the campaign, as the organizer names them.
  seq integer not null check (seq >= 1),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'interrupted')),
  started_by uuid not null references app_user (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- The lot's seed and the solver's limit, recorded so the run can be repeated.
  seed bigint not null check (seed >= 0),
  limits jsonb not null check (jsonb_typeof(limits) = 'object'),
  core_version integer not null check (core_version >= 1),
  contract text not null check (char_length(contract) between 1 and 40),
  solver_version text check (solver_version is null or char_length(solver_version) <= 100),
  ortools_version text check (ortools_version is null or char_length(ortools_version) <= 100),
  -- The input as compiled (school-core AllocationInput), ids only, and its hash without the seed and the limit.
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings) = 'array'),
  -- The solver's answer per pass in the database's ids (school-core PassResult[]), once the run finished.
  passes jsonb not null default '[]' check (jsonb_typeof(passes) = 'array'),
  cancelled_items uuid[] not null default '{}',
  -- Why it failed: a code and, where there is one, the solver's or the validator's word.
  failure text check (failure is null or failure in ('solver_unreachable', 'solver_answer_invalid', 'solver_infeasible', 'solver_unknown', 'model_invalid', 'validation_failed', 'internal_error')),
  detail text check (detail is null or char_length(detail) <= 4000),
  problems jsonb not null default '[]' check (jsonb_typeof(problems) = 'array'),
  published_at timestamptz,
  published_by uuid references app_user (id),
  check ((finished_at is null) = (status = 'running')),
  check ((published_at is null) = (published_by is null)),
  check (published_at is null or status = 'succeeded'),
  check ((failure is null) = (status in ('running', 'succeeded'))),
  unique (campaign_id, seq)
);
create unique index allocation_run_published on allocation_run (campaign_id) where published_at is not null;
create index allocation_run_campaign on allocation_run (campaign_id, seq desc);

create function allocation_run_guard() returns trigger language plpgsql as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    perform refuse('an allocation run is the record of what was computed; it is never removed');
  end if;
  if new.campaign_id <> old.campaign_id or new.seq <> old.seq or new.started_by <> old.started_by or new.started_at <> old.started_at
     or new.seed <> old.seed or new.limits <> old.limits or new.core_version <> old.core_version or new.contract <> old.contract
     or new.snapshot <> old.snapshot or new.snapshot_sha256 <> old.snapshot_sha256 or new.warnings <> old.warnings then
    perform refuse('a run keeps its input, seed and versions');
  end if;
  if old.published_at is not null then
    perform refuse('a published run never changes');
  end if;
  if old.status <> 'running' and (new.status <> old.status or new.finished_at <> old.finished_at or new.passes <> old.passes
     or new.cancelled_items <> old.cancelled_items or new.failure is distinct from old.failure or new.detail is distinct from old.detail or new.problems <> old.problems
     or new.solver_version is distinct from old.solver_version or new.ortools_version is distinct from old.ortools_version) then
    perform refuse('a finished run changes only by being published');
  end if;
  return new;
end
$$;
create trigger allocation_run_guard before update or delete on allocation_run
  for each row execute function allocation_run_guard();
create trigger allocation_run_no_truncate before truncate on allocation_run
  for each statement execute function allocation_run_guard();

-- A student's place in a run: copied from the pre-assignments (fixed), given
-- by the solver for a ranked item (solver, with the wish number) or a fee-free
-- fallback (fallback), or, after publication, moved by the student in the
-- swap window (swap) or placed by hand (manual). Rows are never changed or
-- removed; a later change adds rows.
create table assignment (
  run_id uuid not null references allocation_run (id),
  person_id uuid not null references person (id),
  item_id uuid not null references catalog_item (id),
  source text not null check (source in ('fixed', 'solver', 'fallback', 'swap', 'manual')),
  pass smallint check (pass in (1, 2)),
  rank smallint check (rank >= 1),
  created_at timestamptz not null default now(),
  primary key (run_id, person_id, item_id),
  check (source <> 'fixed' or (pass is null and rank is null)),
  check (source <> 'solver' or (pass is not null and rank is not null)),
  check (source <> 'fallback' or (pass is not null and rank is null))
);
create index assignment_person on assignment (run_id, person_id);
create index assignment_item on assignment (run_id, item_id);

create function assignment_guard() returns trigger language plpgsql as $$
begin
  perform refuse('an assignment row is never changed or removed');
  return null;
end
$$;
create trigger assignment_guard before update or delete on assignment
  for each row execute function assignment_guard();
create trigger assignment_no_truncate before truncate on assignment
  for each statement execute function assignment_guard();
