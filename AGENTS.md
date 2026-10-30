# Agent instructions

Self-hosted allocation of project-week activities and elective subjects for Austrian schools: students rank, the school allocates, every record is identified. Read the invariants below before changing behaviour, and the design in [`docs/`](docs/) for the reasoning: [`architecture-decision.md`](docs/architecture-decision.md), [`domain-and-api.md`](docs/domain-and-api.md), [`identity-and-roles.md`](docs/identity-and-roles.md), [`data-sources.md`](docs/data-sources.md), [`mvp-plan.md`](docs/mvp-plan.md), [`risks-and-acceptance.md`](docs/risks-and-acceptance.md), [`open-decisions.md`](docs/open-decisions.md).

## Layout

```text
packages/api-contracts/   shared endpoint descriptors and TypeBox wire schemas
apps/api/routes/          HTTP adapters: endpoint registration, session guards, status codes and headers
apps/api/services/        application operations: permissions, transactions, locks, audit and outbox orchestration
apps/api/lib/dao/         SQL and row mapping, using the caller's query/transaction client
apps/api/lib/models/      internal models; public shapes come from api-contracts
packages/school-core/     pure domain: lifecycle, eligibility, time arithmetic, completeness, the allocation model and its validation (no I/O, no clock, no randomness)
packages/messages/        the words of the interface, the workbooks and the notices' values: one typed catalogue per language (src/de.ts first), pure as school-core is
apps/api/                 Fastify on Node 26, raw TypeScript; serves apps/web/dist
apps/api/migrations/      the v1 baseline and forward-only migrations on top of it, applied by apps/api/scripts/migrate.ts
apps/web/                 Vue 3 + Vite SPA; its words come from packages/messages
apps/solver/              Python, FastAPI, OR-Tools CP-SAT; stateless, internal network only, speaks the contract in docs/domain-and-api.md §6; its tests in apps/solver/tests (pytest)
e2e/                      Playwright journeys against the real server: harness, support, specs (playwright.config.ts at the root)
scripts/lint-deps.mjs     pin check: exact versions in every workspace, digests for the Dockerfiles' frontend and the workflows' BuildKit
scripts/postgres.sh       PostgreSQL for development and CI, the image the deployment follows
deploy/                   the deployment: Quadlet units for the three containers, the PostgreSQL image, the nightly-update guard, the .env example, the proxy example (nginx) and the operator guide; generic, example.org placeholders only
third-party-notices/      the app image's notices for what it carries beyond its packages' own licence files; apps/solver/third-party-notices/ the solver image's; kept true by scripts/third-party-notices.test.mjs
docs/                     the design: decisions, domain, API, plan, risks; update them with the behaviour they describe
```

npm workspaces share one root `package-lock.json`. Shared tooling (ESLint, TypeScript, markdownlint) lives in the root `package.json`; runtime dependencies live in the workspace that uses them. The solver pins its packages exactly in `apps/solver/pyproject.toml` and locks them with hashes in `uv.lock`; the image installs from that lock alone.

## Commands

```bash
npm ci --ignore-scripts
npm run lint        # ESLint + markdownlint + lint:deps + typecheck
npm test            # node:test in every workspace; database tests need TEST_DATABASE_URL
npm run contracts:update:routes # regenerate the route/input fixture; review its diff
npm run test:coverage  # the same tests from the root, with one lcov file in coverage/ for SonarQube
npm run migrate     # apply pending migrations as the PostgreSQL superuser
npm run build       # web app → apps/web/dist
npm run dev:api     # API on :3000
npm run dev:api:fake-entra  # the same API, signing in with a stand-in for Entra ID
npm run dev:web     # Vite dev server, proxies /api to :3000
npm run e2e         # Playwright journeys in Chromium; needs TEST_DATABASE_URL and `npm run e2e:install` once
(cd apps/solver && uv run --frozen pytest -q)   # the solver's tests, from uv.lock (CONTRIBUTING.md)
```

## Invariants

These take precedence over convenience:

- **The only assumption about a school is Entra ID**: every student and teacher has an account in the school's tenant, and classes are groups there. No school administration system, school database or school-specific interface is a dependency or is named. A roster comes from Entra groups (Microsoft Graph) or a CSV upload, into frozen batches. No school ID number is stored.
- **A person is `(tid, oid)`**, never an e-mail address, a display name or `oid` alone. A CSV roster entry is bound to a login once, by exact address, at the first sign-in; after that the key is the identity. Nothing is matched by name.
- **Kind and eligibility come from the roster; privileged roles are granted in the app and audited**; Entra app roles are not read. The cookie says who signed in and when; the database says what they may do, on every request.
- **Every privileged action writes an audit event in the same transaction**, chained per scope (`lib/audit.ts`, `lib/audit-chain.ts`). The audit log is append-only, for the owner too.
- **An allocation is reproducible**: a run stores its input snapshot, rule version, seed and solver version; the solver runs single-threaded with the seed and a deterministic limit; `school-core` validates every result before it can be published, and a result the validator refuses is never published. The solver never sees a name, an address or a class, and has no credentials and no way out. A published run's rows are never changed or removed: a change after publication (a student's swap, a class teacher's placement, the organizer's hand) supersedes rows and adds rows under the same rules, with its reason recorded.
- **A class activity pre-assigns whole classes, and its pre-assigned students never rank it**; its credit counts toward the daily minimum, and overlapping items are not offered to them. Its `places` are what other eligible students may rank (the spare seats on the bus), zero when there are none (D-24 revised). Fees are shown, not consented to; whoever is assigned pays.
- **A release runs only on the schema it was built for.** A migration that code built before it cannot run on (a column dropped or renamed, a constraint the old code would break, a meaning changed) starts with `-- schema-version: N`, one more than the newest; an additive one (a table, a column with a default, an index) carries none. A release is built for the highest version among its migrations; its migrator and its server refuse a database at a higher one. Deployments update themselves nightly, also while a choice window is open, without an automatic rollback: a release that fails to start leaves the app down, visibly, until the next release fixes it. There is no obligation to keep the previous release running on a new schema. Every change to a ranking is saved at once. `busy` in the health check means a job is executing, never that a window is open.
- Authorization and security headers live in the application, never in the proxy. Every route, cookie path, redirect and link derives from `PUBLIC_URL`, which may carry a path: nothing names `/` as the app's root. In the web app the base comes from `apps/web/src/lib/base.ts`.

## API boundaries

- `school-core` owns domain vocabulary, state/code lists and rule-result shapes. It returns codes and numbers, never words; what a page or a workbook says for them is in `packages/messages`. Contracts import that vocabulary. Unchanged domain values keep runtime schemas, pinned to core types by compile-time checks in `domain-checks.ts`; browser code imports their types from core.
- `api-contracts` imports only TypeBox, `school-core` and its own modules. Endpoint descriptors bind method, path, request and response schemas. Routes register them through `registerEndpoint`; browser wrappers use `apiRequest` and `endpointPath`. The browser loads only `endpoint-metadata.ts` (method, path, transport) and `client-endpoint.ts`; the latter resolves request/response types from full descriptors through type-only imports. Server descriptors spread the same metadata and add schemas. Endpoint modules import schemas from their feature modules, never the barrel. The Vite build rejects server schema modules and TypeBox in emitted browser chunks. Downloads, redirects and empty responses retain their own HTTP semantics. Wire projections select fields explicitly; internal additions must not leak into responses.
- Routes call services and never import sibling routes, DAOs, audit/outbox readers or Graph read operations. `app.ts` registers them explicitly under `PUBLIC_URL`'s base path. Shared actor conversion is in `lib/actor.ts`; application errors are in `lib/errors.ts`, with an exhaustive status map in `lib/http-errors.ts`. Route-facing operations throw `not_found` consistently; routes do not duplicate the global mapper.
- Services receive plain callers and dependencies, and own transactions. They expose application operations, never re-export DAO functions, models or SQL fragments. They call DAOs with the same client for the entire operation, including audit and outbox writes. School locks precede campaign locks; reads and checks under a lock stay under it. Wake the mail sender only after the queuing operation commits.
- DAOs contain SQL and row mapping. They return mapped records, arrays, counts or void, never PostgreSQL result objects. Raw row types stay in the DAO directory; shared roster selection is in `dao/roster-selection.ts`. Locking reads are named explicitly. DAOs never start transactions or depend on services, routes or Fastify. Existing infrastructure such as audit, outbox and session loading keeps its focused adapters.
- The scheduler in `lib/` only drives the timer; the scheduling service owns the workflow and calls its DAO. Graph routes own OAuth/cookies, the picker-token adapter owns token storage, and services own Graph reads and import decisions. Mail-history privacy belongs in the service.
- ESLint enforces these boundaries, with regression examples in `scripts/api-boundaries.test.mjs`. API tests compare JSON success payloads before and after serialization so a response schema cannot silently lose fields. `test/contracts.test.ts` verifies endpoint registration and the route/input inventory using the same collector as `npm run contracts:update:routes`. Tests never update the fixture; run that command deliberately and review the diff when changing the API.

## Conventions

- Dependencies are pinned exactly; Dependabot lands bumps, and the automerge workflow holds them for a one-day quarantine.
- GitHub Actions are pinned by commit SHA with the version in a comment. Base images are pinned by tag and digest, and so is BuildKit, which runs the image builds (`driver-opts` of the buildx setup in both workflows); the Dockerfiles name no frontend of their own (`# syntax=`), so BuildKit's built-in one reads them. Dependabot does not see the BuildKit pin: it is bumped by hand. `lint:deps` refuses either without a digest.
- CI runs on pull requests to `main`; a push to `main` runs the tests again for the SonarQube analysis of the default branch and warms the image caches. SonarQube's properties are in `sonar-project.properties`, its coverage the lcov file of `npm run test:coverage`. Images are published to GHCR only on `v*` tags.
- `apps/api/migrations/0001_baseline.sql` is the schema of version 1. A change after it is a new migration on top, never an edit of an applied one.
- The lifecycle's windows (what may change in which state, which state follows which) live in `school-core`'s guards, asked by the route and again under the campaign's lock. Triggers keep only what the stored data must satisfy whoever writes it. A trigger that restates a guard is not added.
- What the runtime role may do with tables and functions is listed in `apps/api/lib/runtime-privileges.ts`. No migration grants anything; the migrator applies the list on every run. A new table gets no access until it is listed.
- The repository pins everything and chooses every version; a host chooses nothing. The publish workflow tags the three images with the release and with the line tag `v<major>`, which the Quadlet units follow and `podman auto-update` pulls nightly unless a job is executing (`deploy/not-busy.sh`). A release is a `v<major>.<minor>.<patch>` tag on `main`, pushed by hand; the workflow signs the images with the repository's cosign key (the secrets `COSIGN_PRIVATE_KEY` and `COSIGN_PASSWORD`, the public key `deploy/cosign.pub`), and a host's policy (`deploy/policy.json`) refuses an unsigned one. A signature does not say which release is the newest, so a release that fixes a vulnerability in the app image (in the code, its base image or a dependency) raises the schema version, with a migration that may hold the `-- schema-version: N` line alone: no earlier release then starts on a database it migrated, even when the registry serves an earlier signed `v1`. The PostgreSQL and solver images have no schema version (`SECURITY.md`).
- `deploy/README.md` is the operator guide; update it with any change to configuration, secrets, the units or the update mechanism.
- Work that must happen in order (audit events chaining to the one before, rows written in one transaction) is a plain loop with `await` in it. SonarCloud's rule against `await` in a loop (typescript:S9382) is ignored in `sonar-project.properties` for that reason; no helper exists to hide such a loop.
- Code, comments and documentation are in English. The interface's words live in `packages/messages/src/de.ts`, German first, with formal German and English beside it, the mail templates' defaults included: the pages (`apps/web/src/lib/i18n.ts`), the workbooks and the values the server fills into notices (`apps/api/lib/i18n.ts`) read them in the school's language, and the browser journeys find elements by them (`e2e/support/messages.ts`). The words follow `docs/glossary.md`. No word is written into a template or a page's script; ESLint refuses bare text in templates.
