# SchulWahl — MVP plan (Phase B.8)

Status: proposal for review · 2026-10-27

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

- Teachers propose activities with sessions, credited minutes per date, fee, and either eligibility
  (choosable) or target classes (fixed); capacity and minimum for choosable ones.
- Organizer review and approval.
- Printable catalogue; xlsx export.

**S3 · Choice window + notifications.**

- Pre-assignments materialized from fixed items at opening; organizer exemptions (audited).
- Ranking UI with fixed items shown, overlapping items hidden, and the live completeness check.
- Server-side window; on-behalf entry.
- Outbox + SMTP transport (test-send from the admin UI), reminder, missed-deadline notice, send
  state.
- Non-submitter list and export.

**S4 · Allocation.**

- Model compiler in school-core; solver service with CP-SAT and lexicographic levels.
- Independent validator.
- Run review screen: levels, rank distribution, deficits, cancelled items, run comparison.
- Publish; student result with explanation; participant lists; exports.
- A reproducibility test in CI.

**S5 · After publication.**

- Manual changes and the second round (D-06), validated and audited.
- Class-teacher assignment; KV attendance per session for own class.
- Attendance export.

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
  - exhaustive and property tests for overlap, credit per date (including over midnight) and
    completeness;
  - completeness with fixed items (the Vienna example: Tuesday–Wednesday fixed for the class, Monday
    chosen; a student fully covered by fixed items; an exempted student);
  - a validator test that rejects tampered results (capacity +1, an overlap, an unranked item, a
    dropped or altered pre-assignment);
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
  - student of a class with a fixed trip sees it as given and ranks Monday only; completeness
    updates live;
  - window closes → missed-deadline mail queued;
  - run → review → publish;
  - student sees result;
  - KV records attendance.
- **Upgrade safety:** the previous release's test suite runs against the new schema in CI (the
  auto-update rollback guarantee).

## Rollout and rollback

- **Release:** tag → image is signed → hosts update overnight (D-14).
- **Rollback:**
  - automatic via the health-gated `podman auto-update`;
  - manually by pinning the previous tag.

  Schema compatibility makes both safe.
- **Campaign-level fallback:** if allocation fails or is not accepted, the organizer exports all
  rankings (xlsx) and allocates manually as before. Results can be entered as manual assignments, so
  the record stays complete.
- **The first real campaign** runs with the organizer reviewing every run before publication. Nothing
  is published automatically.
