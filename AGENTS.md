# Agent instructions

Self-hosted allocation of project-week activities and elective subjects for Austrian schools: students rank, the school allocates, every record is identified. Read the invariants below before changing behaviour, and the design in [`docs/`](docs/) for the reasoning: [`architecture-decision.md`](docs/architecture-decision.md), [`domain-and-api.md`](docs/domain-and-api.md), [`identity-and-roles.md`](docs/identity-and-roles.md), [`data-sources.md`](docs/data-sources.md), [`mvp-plan.md`](docs/mvp-plan.md), [`risks-and-acceptance.md`](docs/risks-and-acceptance.md), [`open-decisions.md`](docs/open-decisions.md).

## Layout

```text
packages/school-core/     pure domain: lifecycle, eligibility, time arithmetic, completeness, the allocation model and its validation (no I/O, no clock, no randomness)
apps/api/                 Fastify on Node 26, raw TypeScript; serves apps/web/dist
apps/api/migrations/      the v1 baseline and forward-only migrations on top of it, applied by apps/api/scripts/migrate.ts
apps/web/                 Vue 3 + Vite SPA, German UI
apps/solver/              Python, FastAPI, OR-Tools CP-SAT; stateless, internal network only, speaks the contract in docs/domain-and-api.md §6
e2e/                      Playwright journeys against the real server: harness, support, specs (playwright.config.ts at the root)
scripts/lint-deps.mjs     exact-pin check across all workspaces
scripts/postgres.sh       PostgreSQL for development and CI, the image the deployment follows
deploy/                   the deployment: Quadlet units for the three containers, the PostgreSQL image, the nightly-update guard, the .env example, the proxy example (nginx) and the operator guide; generic, example.org placeholders only
docs/                     the design: decisions, domain, API, plan, risks; update them with the behaviour they describe
```

npm workspaces share one root `package-lock.json`. Shared tooling (ESLint, TypeScript, markdownlint) lives in the root `package.json`; runtime dependencies live in the workspace that uses them. The solver pins its packages with hashes in `apps/solver/requirements.txt`, compiled from `requirements.in`.

## Commands

```bash
npm ci --ignore-scripts
npm run lint        # ESLint + markdownlint + lint:deps + typecheck
npm test            # node:test in every workspace; database tests need TEST_DATABASE_URL
npm run migrate     # apply pending migrations as the PostgreSQL superuser
npm run build       # web app → apps/web/dist
npm run dev:api     # API on :3000
npm run dev:api:fake-entra  # the same API, signing in with a stand-in for Entra ID
npm run dev:web     # Vite dev server, proxies /api to :3000
npm run e2e         # Playwright journeys in Chromium; needs TEST_DATABASE_URL and `npm run e2e:install` once
```

## Invariants

These take precedence over convenience:

- **The only assumption about a school is Entra ID**: every student and teacher has an account in the school's tenant, and classes are groups there. No school administration system, school database or school-specific interface is a dependency or is named. A roster comes from Entra groups (Microsoft Graph) or a CSV upload, into frozen batches. No school ID number is stored.
- **A person is `(tid, oid)`**, never an e-mail address, a display name or `oid` alone. A CSV roster entry is bound to a login once, by exact address, at the first sign-in; after that the key is the identity. Nothing is matched by name.
- **Kind and eligibility come from the roster; privileged roles are granted in the app and audited**; Entra app roles are not read. The cookie says who signed in and when; the database says what they may do, on every request.
- **Every privileged action writes an audit event in the same transaction**, chained per scope (`lib/audit.ts`, `lib/audit-chain.ts`). The audit log is append-only, for the owner too.
- **An allocation is reproducible**: a run stores its input snapshot, rule version, seed and solver version; the solver runs single-threaded with the seed and a deterministic limit; `school-core` validates every result before it can be published, and a result the validator refuses is never published. The solver never sees a name, an address or a class, and has no credentials and no way out.
- **A class activity pre-assigns whole classes, and its pre-assigned students never rank it**; its credit counts toward the daily minimum, and overlapping items are not offered to them. Its `places` are what other eligible students may rank (the spare seats on the bus), zero when there are none (D-24 revised). Fees are shown, not consented to; whoever is assigned pays.
- **Migrations are compatible with the previous release** (expand first, contract later): deployments update themselves nightly, also while a choice window is open, and the automatic rollback runs old code on the new schema. Every change to a ranking is saved at once. `busy` in the health check means a job is executing, never that a window is open.
- Authorization and security headers live in the application, never in the proxy. Every route, cookie path, redirect and link derives from `PUBLIC_URL`, which may carry a path: nothing names `/` as the app's root. In the web app the base comes from `apps/web/src/lib/base.ts`.

## Conventions

- Dependencies are pinned exactly; Dependabot lands bumps, and the automerge workflow holds them for a one-day quarantine.
- GitHub Actions are pinned by commit SHA with the version in a comment. Base images are pinned by tag and digest.
- CI runs on pull requests to `main`; a push to `main` warms the image caches. Images are published to GHCR only on `v*` tags.
- `apps/api/migrations/0001_baseline.sql` is the schema of version 1. A change after it is a new migration on top, never an edit of an applied one.
- The lifecycle's windows (what may change in which state, which state follows which) live in `school-core`'s guards, asked by the route and again under the campaign's lock. Triggers keep only what the stored data must satisfy whoever writes it. A trigger that restates a guard is not added.
- What the runtime role may do with tables and functions is listed in `apps/api/lib/runtime-privileges.ts`. No migration grants anything; the migrator applies the list on every run. A new table gets no access until it is listed.
- The repository pins everything and chooses every version; a host chooses nothing. The publish workflow tags the three images with the release and with the line tag `v<major>`, which the Quadlet units follow and `podman auto-update` pulls nightly unless a job is executing (`deploy/not-busy.sh`). A release is a `v<major>.<minor>.<patch>` tag on `main`, pushed by hand; the workflow signs the images with the repository's cosign key (the secrets `COSIGN_PRIVATE_KEY` and `COSIGN_PASSWORD`, the public key `deploy/cosign.pub`), and a host's policy (`deploy/policy.json`) refuses an unsigned one.
- `deploy/README.md` is the operator guide; update it with any change to configuration, secrets, the units or the update mechanism.
- Work that must happen in order (audit events chaining to the one before, rows written in one transaction) is a plain loop with `await` in it.
- Code, comments and documentation are in English. The user interface is in German.
