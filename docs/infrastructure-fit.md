# SchulWahl — Deployment model

Status: proposal · 2026-10-27 · Repo-ready. What the repository ships and what it requires of the
code. How a school operates its host (backups, monitoring, placement, networking) is the operator's
business and is not specified here.

## 1. What the repository ships

Same shape as school-election:

- **Quadlet units** for a rootless user: `schulwahl.container`, `schulwahl-postgres.container`,
  `schulwahl-solver.container`, an internal network (database and solver, no egress), an egress
  network (app only), a database volume.
- **Images** on GHCR, cosign-signed, with a floating line tag (`:v1`) and immutable version tags.
  The base images are digest-pinned.
- **Secrets as files** (`*_FILE`): session key, database owner and runtime passwords, Entra client
  secret, SMTP password. The app refuses inline secrets.
- **Migrations** run as `ExecStartPre` before every start, forward-only SQL, with a runtime-privilege
  allow-list re-applied on each run.
- **`/api/health`** with `db`, `busy`, `version`, `gitSha`.
- `podman auto-update` support with an `ExecCondition` that skips the night while `busy` is true.
- An **nginx example** for both forms of exposure.

## 2. Exposure: own host or sub-path, both supported

Everything derives from `PUBLIC_URL`, which may carry a path (`https://school.example/wahl`). Nothing
hard-codes `/`. The SPA is built with a relative base and the server rewrites `index.html` for the
configured base path, as school-election does.

Documented limitation under a sub-path: the CSRF defence (`Sec-Fetch-Site: same-origin`, falling back
to `Origin`) trusts the whole origin, i.e. whatever else runs on that host. The deploy README states
this; it is not a blocker.

## 3. Updates: nightly, always

Decision D-14: a school updates nothing by hand. A tag is released; the host picks it up overnight,
also while a choice window is open. Security updates do not wait for weeks-long windows. This binds
the code to three rules:

1. **Every migration works with the previous release's code** (expand first, contract in a later release). The health-gated automatic rollback can then run old code on the new schema safely. CI runs the previous release's test suite against the new schema. The exception is a release that fixes a vulnerability: it sets a release floor, which the migrator of every earlier release refuses, so no host goes back behind the fix.
2. **No state lives only in the browser or in process memory.** Every change to a ranking is saved
   at once; a restart loses at most one in-flight request.
3. **`busy` means "a job is executing"**: an allocation run, a roster import, an outbox flush. Minutes,
   not weeks. An interrupted job is re-run from its frozen input and never resumes half-written.

## 4. Outbound connections of the app container

| Target | Purpose |
| ------ | ------- |
| `login.microsoftonline.com` | Sign-in, signing keys |
| `graph.microsoft.com` | Roster import from groups (not needed for CSV-only schools) |
| The school's SMTP submission host | Notifications |

The solver container has no outbound connection at all.

## 5. Solver container

Required, because project-week choices are free combinations (D-03 c).

- Python, FastAPI, OR-Tools CP-SAT; stateless; internal network only; no database credentials, no
  student data beyond small integer IDs.
- Pinned OR-Tools version, recorded with every run, because results must be reproducible.
- Runs on demand; idle otherwise.

## 6. Load

With ranked choices there is no spike at opening; submissions are spread over days and nobody gains
by being first. The one heavy step is the allocation run after the close: a batch job of seconds to
minutes, started and reviewed by an organizer.
