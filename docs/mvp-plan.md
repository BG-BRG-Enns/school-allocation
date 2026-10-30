# SchulWahl — MVP plan (Phase B.8)

Status: proposal for review · 2026-10-27 · revised 2026-10-29 for the decisions of that day
(`open-decisions.md`); S0 to S2 are shipped

The order is project week first and WPF second. Each slice ends deployable, behind the campaign
lifecycle, and is tested with synthetic data only.

## Slices

| # | Slice | Contents | Depends on | Size |
| - | ----- | -------- | ---------- | ---- |
| S0 | Foundation | See below | — | S |
| S1 | Identity + roster | See below | S0; an Entra app registration on a test tenant with class groups | M |
| S2 | Catalogue | See below | S1 | M |
| S3 | Choice window + notifications | See below | S2; SMTP credentials of a test mailbox | M |
| S4 | Allocation | See below | S3 | L |
| S5 | After publication | See below | S4 | M |
| S6 | Release and deploy readiness | See below | S0 (can run in parallel) | S |
| P | Pilot | See below | S0–S6 | — |
| W1 | WPF catalogue + rules | See below | S2 | M |
| W2 | WPF campaign | See below | W1, S3 | M |
| W3 | WPF groups (optional) | Allocation model `wpf/v1` on the solver service | W2, S4 | M |
| W4 | WPF participation | Admin records participation and attendance | W2 | S |

**S0 · Foundation.**

- A repo built from school-election's skeleton: workspaces, Node 26, lint, `lint:deps`, typecheck,
  `node:test`, the migration runner with runtime privileges, TypeBox, hardening, sealed sessions, and
  the audit chain.
- A fake Entra for dev and e2e.
- Quadlet units: app, Postgres, solver stub.
- Health with `busy`.
- CI: lint, test against real Postgres, Playwright, image smoke test, cosign signing.

**S1 · Identity + roster.**

- Group labelling (students/teachers, class, grade); Graph import with delegated permission into
  `ImportBatch` with a diff view; CSV import with a downloadable template.
- Pre-provisioning by `oid` (Graph); exact e-mail/UPN binding at first sign-in (CSV); the
  unmatched-login queue; audited merge and rebind.
- Bootstrap admins from config; role grants.

**S2 · Catalogue.**

- Teachers propose activities with sessions, credited minutes per date, fee, the classes they are
  fixed for (if any), the places other students may rank and who is eligible for them, minimum and
  cancellability.
- Organizer review and approval.
- Printable catalogue; xlsx export.

**S3 · Choice window + notifications**, in two steps, each its own pull request.

**S3a · Teacher and organizer side.**

- The period grid (D-25): settings with the Austrian default; the proposal form takes a session as
  "from period *x*, *y* periods" (default from the 2nd) or as clock times; the catalogue shows period
  labels where a session sits on the grid.
- The campaign's window settings (D-05, D-06, D-13): open, close, grace week, swap window, wishes per
  time group, daily minimum per grade, whether the catalogue names the teachers; changeable until the
  window opens.
- Demand per project day and grade for teachers and the organizer while proposals come in (D-13).
- Class-teacher assignment (moved up from S5), from the app and from the CSV roster's address column,
  with the class teacher's page of their class.
- The group picker for the roster (D-23).

**S3b · Student window and mail.**

- Pre-assignments materialized from fixed items at opening; organizer exemptions (audited).
- Ranking UI per project day and time group with the campaign's cap (D-05), fixed items shown,
  overlapping items hidden, and the live completeness check.
- Server-side window with the grace week (`late_until`, lists marked `late`); on-behalf entry.
- Outbox + SMTP transport (test-send from the admin UI), reminders, class-teacher lists at both
  closes, missed-deadline notice, send state; the templates editable by the organizer with
  placeholders.
- Non-submitter list and export.

**S4 · Allocation**, in three steps, each its own pull request.

**S4a · The engine.**

- Model compiler in school-core: the requirement left after fixed items, time groups and wish
  numbers, fee-free fallback options (D-06), two passes with the first window fixed (D-20), the lot
  from the seed; the independent validator and the explanation and summary of a result.
- The solver service's `/v1/solve`: CP-SAT with the lexicographic levels, one worker, the seed, a
  deterministic limit; its own tests (golden instances, reproducibility, the refusals) in CI.
- The solver contract as shared schemas, pinned to school-core's types.

**S4b · Runs and review.**

- `allocation_run` and `assignment`; `SOLVER_URL`; the run as a job: snapshot → two passes → validate
  → store; a failed run is stored with its reason.
- Run API with the review's numbers and an xlsx export; the Zuteilung page: start a run (seed, limit),
  the list, the review of a run (levels, rank distribution, deficits, fallbacks, cancelled items,
  items, per class), the comparison of two runs, "Lauf wiederholen".
- A reproducibility test against the real solver image in CI.

**S4c · Publication.**

- Publish with the confirmation of the cancelled items; the mails of the publication (students,
  class teachers with unplaced students, teachers of cancelled items).
- Student result with explanation; participant lists for teachers; the class teacher's list of
  unplaced students; the assignments workbook with the fee per student.

**S5 · After publication**, in three steps, each its own pull request.

**S5a · Changes after publication.**

- The swap window (D-06): the free places per item, the student's move under the campaign lock
  leaving what overlaps, the minimum protected, the coverage protected, confirmation mail.
- Placement of students short of minutes by the class teacher (into a gap, with a reason); changes by
  the organizer (into, out of, or both; a full item and a minimum overridable, recorded); the same
  rules for all, audited, the student notified; no second round. A change supersedes rows and adds
  rows; the organizer's log and the workbook carry every change with its reason.
- The swap window's dates settable until the window begins.

**S5b · Attendance and the archive.**

- KV attendance per session for own class (students currently assigned to the session's item; a
  correction replaces; audited); the class's and the campaign's attendance workbooks.
- `results → archived` by the organizer: nothing changes afterwards, everything stays readable for
  everyone who could read it before.

**S5c · The retention purge (D-15).**

- The school years with their records and when each may go; the administrator's purge of a year past
  its retention with every campaign archived, with a reason, audited in the school scope with the
  counts; the people nobody names any more go with their accounts. A definer function behind a guard
  switch; the runtime role deletes nothing itself.

**S6 · Release and deploy readiness.**

- Quadlet units, signed images, auto-update with the `busy` gate.
- A previous-release-vs-new-schema compatibility job in CI.
- Deploy README: both exposure modes (own host, sub-path), nginx example, secret files, Entra setup,
  Graph permission choice, SMTP settings.

**P · Pilot.**

1. Synthetic campaign with realistic size (D-20 simulation).
2. Organizer dry run using last year's catalogue structure.
3. Then the first real campaign.

**W1 · WPF catalogue + rules.**

- Subjects with years and periods.
- Curriculum profiles (SFKZ mapping).
- Rule versions with an approval step; rule fixtures (positive and negative).
- Printable WPF catalogue.

**W2 · WPF campaign.**

- Campaign eligibility by class prefix (`5` for the 9th grade).
- Multi-year plan choice, validation and explanations; Matura information. Exceptions are outside the
  software (D-19).
- Exports; missed-deadline notices.

Sizes are relative and not calendar estimates:

- **S** is about a third of an M.
- **L** is about twice an M.
- Reference: school-election is about 9k lines of API code and 12k of web code for a comparable rigor
  level. SchulWahl's project-week MVP (S0–S6) is expected to be of similar total size.

A credible calendar estimate needs the target project-week date. **Open.**

## Testing strategy

- **school-core:**
  - exhaustive and property tests for overlap, credit per date (including over midnight), the
    period grid (periods to instants and back, trips off the grid) and time groups (overlapping
    blocks of a Sporttag);
  - completeness with fixed items (the Vienna example: Tuesday–Wednesday fixed for the class, Monday
    chosen; a student fully covered by fixed items; an exempted student) and with the per-group cap;
  - a validator test that rejects tampered results (capacity +1, an overlap, an unranked item that is
    no fallback, a paid fallback, a first-pass assignment changed by the second, a dropped or altered
    pre-assignment);
  - WPF rule fixtures keyed to a rules table in `docs/`, as school-election ties fixtures to the design
    doc.
- **Solver:**
  - golden synthetic instances with known optimal level values;
  - reproducibility (same input → byte-identical output);
  - `INFEASIBLE` and `UNKNOWN` surfaced.
- **API:**
  - real Postgres;
  - window enforcement by server time;
  - eligibility via manipulated requests, including ranking a fixed item or an item that overlaps the
    student's fixed item;
  - IDOR on every read;
  - outbox dedupe and retry with an SMTP double;
  - Graph import with a Graph double (paging, missing `mail`, member in two groups);
  - roster diff and batch rejection.
- **e2e (Playwright, fake Entra):**
  - teacher proposes → organizer publishes;
  - student of a class with a fixed trip sees it as given and ranks Monday only, three per time
    group; completeness updates live;
  - window closes → the class teacher's list; grace week ends → missed-deadline mail queued;
  - run → review (a cancelled item confirmed) → publish;
  - student sees result; in the swap window moves into a free place, is refused a full one;
  - class teacher places an unplaced student;
  - KV records attendance.
- **Upgrade safety:** a release refuses a schema version above the one it was built for, in its
  migrator and at the server's start (`apps/api/test/db/migrate.test.ts`).

## Rollout and rollback

- **Release:** tag → image is signed → hosts update overnight (D-14).
- **A failed update** stays down: `podman auto-update` runs without its rollback, so someone notices,
  and the next release fixes it. An operator may pin the previous tag instead, as long as the failed
  release did not raise the schema version; if it did, the previous release refuses the database, and a
  restore from the backup before the update is the way back.
- **Campaign-level fallback:** if allocation fails or is not accepted, the organizer exports all
  rankings (xlsx) and allocates manually as before. Results can be entered as manual assignments, so
  the record stays complete.
- **The first real campaign** runs with the organizer reviewing every run before publication. Nothing
  is published automatically.
