# Contributing

Thank you for helping. This project allocates school activities to children and keeps identified records about them, so correctness, fairness and data minimization come before features. Please read this page before opening a pull request.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems are reported privately, as described in [SECURITY.md](SECURITY.md), never in a public issue.

## Before you start

- For anything beyond a small fix, open an issue first and describe what you want to change. That avoids work on something that conflicts with the design in [`docs/`](docs/).
- The invariants in [`AGENTS.md`](AGENTS.md) (Entra ID as the only assumption, the identity as the key, audited roles, reproducible and validated allocations, migrations compatible with the previous release) are not open to trade-offs for convenience.
- Code, comments and documentation are in English. The user interface is in German.

## Setup

You need Node 26 (`nvm use` reads `.nvmrc`) and Docker or Podman for PostgreSQL.

```bash
npm ci --ignore-scripts
cp apps/api/.env.example apps/api/.env

mkdir -p apps/api/.secrets
openssl rand -hex 24 > apps/api/.secrets/db-owner-password
openssl rand -hex 24 > apps/api/.secrets/db-runtime-password
openssl rand -hex 32 > apps/api/.secrets/session-key
printf 'not-a-real-secret' > apps/api/.secrets/entra-client-secret
scripts/postgres.sh school-allocation-db 5432 apps/api/.secrets/db-owner-password   # CONTAINER_ENGINE=podman for Podman
npm run migrate

npm run dev:api:fake-entra     # API on http://127.0.0.1:3000, signing in with a fake Entra ID (below)
npm run dev:web                # Vite dev server on http://localhost:5173, /api proxied to the API
```

The API refuses to start with a missing or unsafe setting and names it. `apps/api/.env.example` lists every setting; secrets are never set inline but read from files named by `*_FILE` variables, kept in the git-ignored `apps/api/.secrets/`. Open the app through the Vite dev server: the API accepts state-changing requests only from the origin of `PUBLIC_URL`.

### Signing in during development

With the dummy Entra values in `.env.example`, `npm run dev:api` runs everything but signing in: "Anmelden" goes to Microsoft, which knows no such tenant. There are two ways to sign in.

**Without a Microsoft tenant**, which suits most work: `npm run dev:api:fake-entra` starts the same API from the same `apps/api/.env`, against the same database, but sends "Anmelden" to the stand-in for Entra ID the browser journeys use. Its page, "Anmeldung (Test)", offers the test people (Anna Lehrerin, Bernd Lehrer, Carla Kollegin, Sara Schülerin and Tim Schüler) and anyone typed in by name and school e-mail address; an address is the same person at every sign-in. It replaces the Entra settings of `.env` with the stand-in's own, starts only with a loopback `HOST` and `PUBLIC_URL`, and logs at start that sign-in is the stand-in. It is a program of its own (`apps/api/test/dev-server.ts`), not a setting: the server the image runs cannot be pointed at another authority, and nothing under `test/` is in the image. To be an administrator, put a test person's address into `BOOTSTRAP_ADMINS` in `.env`.

**With Microsoft Entra ID**, for work on signing in itself: use a development app registration in the school's tenant, separate from the one production uses, so the production registration lists only the production redirect URI and its client secret never leaves the server. The development registration: single tenant, platform Web, redirect URI `http://localhost:5173/api/auth/callback`, and a client secret. Put the tenant and client ids into `apps/api/.env` and the secret into `apps/api/.secrets/entra-client-secret`, then open <http://localhost:5173/api/auth/login>. The session cookies are `Secure` with the `__Host-` prefix, which Chrome, Edge and Firefox accept from `http://localhost`.

### The solver

`apps/solver` is Python. For local work:

```bash
cd apps/solver
uv venv && uv pip sync requirements.txt
.venv/bin/python -m uvicorn app.main:app --port 8000
```

A dependency change edits `requirements.in` and recompiles: `uv pip compile --generate-hashes requirements.in -o requirements.txt`.

## Checks

Run these before pushing. CI runs the same ones on every pull request. The database tests need `TEST_DATABASE_URL`, a superuser connection to a server started with `scripts/postgres.sh`; each test creates and drops its own database there. Without it they are skipped locally, and in CI they fail.

```bash
export TEST_DATABASE_URL="postgres://postgres:$(cat apps/api/.secrets/db-owner-password)@127.0.0.1:5432/postgres"
```

```bash
npm run lint        # ESLint, markdownlint, exact dependency pins, typecheck
npm test
npm run build
```

Formatting is enforced by ESLint; there is no separate formatter. `npx eslint . --fix` fixes most style findings.

## Pull requests

- Target `main` and keep each pull request to one concern. Small pull requests get reviewed faster.
- Write commit messages and pull request titles in the [Conventional Commits](https://www.conventionalcommits.org/) style, for example `feat(roster): import class groups from Graph` or `fix(api): refuse a ranking outside the window`.
- Add or update tests for behaviour changes. Changes to completeness, the allocation model or its validator need tests that cover the boundary cases.
- Explain in the description why the change is needed, not only what it does.
- A migration works with the previous release's code. Deployments update themselves nightly and roll back automatically; the schema has to carry both.

## Dependencies

- Add a dependency only when it clearly earns its place.
- Pin exact versions (`npm install --save-exact`, which `.npmrc` already sets). `npm run lint:deps` rejects ranges. The solver's packages are pinned with hashes.
- Dependencies must use a license compatible with MIT.
- Dependabot proposes updates; do not bump versions in unrelated pull requests.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE) of this project.
