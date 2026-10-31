# SchulWahl — Risks and acceptance criteria (Phase B.9)

Status: proposal for review · 2026-10-27

## 1. Risk register

Likelihood and impact: H / M / L.

| ID | Risk | L | I | Mitigation | Owner |
| -- | ---- | - | - | ---------- | ----- |
| R01 | The allocation outcome is not accepted by students, parents or staff ("why did I get my 4th choice?") | M | H | Lexicographic rule in plain words; per-student explanation; review before publish; manual changes possible; D-20 simulation shown to school leadership beforehand | Organizer |
| R02 | Runs are not reproducible, so the school cannot explain a result | L | H | Single worker, seed, deterministic time limit, pinned OR-Tools, stored snapshot hash; CI reproducibility test | Developer |
| R03 | Solver gives `INFEASIBLE`/`UNKNOWN`, or poor results within the limit | M | M | Coverage is soft and reported; level values carry `proven`; organizer can re-run with a larger limit; xlsx fallback to manual allocation | Developer / organizer |
| R04 | A nightly auto-update breaks the app during an open window | M | H | Expand-only migrations; previous-release-on-new-schema CI job; health-gated rollback; choices saved per change; busy gate during jobs | Developer |
| R05 | The class groups in Entra are stale or mislabelled (new school year, late transfers) | M | H | Batch age and diff shown; refresh before close; organizer sign-off of the batch; CSV as a correction path | School admin |
| R06 | A CSV-based binding fails or is wrong (renamed account before first sign-in, typo) | L | M | Exact match only; unmatched queue; audited merge; on-behalf entry; Graph import avoids the problem entirely | School admin |
| R07 | Notices are not delivered (SMTP not configured, SPF/DKIM of the school's domain, spam filters) | M | M | Test-send in the admin UI; send state visible; non-submitter export for class teachers as the fallback | School admin |
| R08 | Graph permission is not granted by the school's tenant admin | M | L | CSV path is first-class; delegated permission as the low-friction default | School admin |
| R09 | Single maintainer (bus factor) | H | M | OSS repo, school-election conventions, tests as documentation, deploy README, AGENTS.md | Project lead |
| R11 | Personal data of minors is overexposed (rankings, fees, classes) | L | H | Minimal roster fields; role matrix; per-request read authorization; no demand indicators; retention (D-15); a data-protection check of whether a DPIA is needed | Data protection |
| R12 | Catalogue data errors (wrong credited minutes, overlapping sessions entered by mistake) | M | M | School-core validation on entry; organizer approval; printable preview; changes after opening notify affected students | Organizer |
| R13 | Entra outage during the window | L | L | Windows span days; organizer can extend `closes_at` (audited); on-behalf entry | Organizer |
| R14 | Strategic ranking (the optimization is not strategy-proof) | L | L | No demand indicators; communicate "rank honestly"; quantify in the D-20 simulation | Organizer |
| R15 | A fixed class activity is entered late or changed after students have ranked (their Monday-only plans become wrong) | M | M | Fixed items are frozen with the catalogue; a later change is organizer-only, re-materializes pre-assignments, re-checks completeness and notifies the affected students | Organizer |

## 2. Acceptance criteria

The evidence column states what has to be shown for sign-off.

### Project week

| # | Criterion | Evidence |
| - | --------- | -------- |
| PW1 | No published allocation exceeds an item's capacity, assigns overlapping items, assigns an unranked or ineligible item, or drops or alters a pre-assignment | Validator unit tests with tampered results; e2e run on a synthetic campaign |
| PW2 | A multi-session item (e.g. Tue 08:00 – Wed 13:00) is assigned as a whole or not at all, and credits each date separately | Unit tests; synthetic instance |
| PW3 | Every student either meets every day's minimum or appears in the deficit report with the missing minutes per day | Run review screen + export on a synthetic instance with forced shortage |
| PW4 | Same snapshot + seed + versions produce an identical assignment | CI reproducibility test |
| PW5 | Solver level values are recomputed by school-core and match; a mismatch blocks publication | Unit test with a falsified level value |
| PW6 | `INFEASIBLE` / `UNKNOWN` is shown and cannot be published | API test |
| PW7 | Choices are accepted until `closes_at` by server time and rejected afterwards, including for crafted requests | API tests |
| PW8 | A student cannot rank ineligible items, fixed items, or items overlapping their fixed items, via manipulated requests | API tests |
| PW9 | The completeness indicator is correct for the example week of the decision record (2 × Monday, 1 × Tue–Wed), both as chosen items and with the Tue–Wed trip fixed for the class, and for edge cases (touching sessions, over-midnight, min(*N*, remaining) alternatives) | Unit tests |
| PW10 | At window close, each student with an incomplete list receives exactly one missed-deadline e-mail, even across restarts and retries; the send state is visible | API test with an SMTP double; staging run against a test mailbox |
| PW11 | Every manual change, on-behalf entry, run, publication and binding correction appears in the audit log with actor and reason | API tests; audit export |
| PW12 | A KV can record attendance only for their own class's students, and attendance is separate from assignments | API + e2e tests |
| PW13 | The printable catalogue matches the published catalogue version | e2e snapshot |
| PW14 | Every overview has an xlsx export | e2e download checks |
| PW15 | When the window opens, every student of a class named in a fixed item is pre-assigned; the item is offered to nobody else; an organizer exemption turns the student into a chooser for that time, audited | API + e2e tests |
| PW16 | The fee of every assigned item, fixed or chosen, appears per student in the export; no acceptance step exists or is required | Export test |

### WPF

| # | Criterion | Evidence |
| - | --------- | -------- |
| W1 | A three-year plan is validated against the cohort's approved rule version, with an understandable explanation for each violation | Rule fixtures (positive/negative) keyed to the docs table |
| W2 | Matura information is reported separately and never rejects an otherwise valid plan | Unit tests |
| W3 | An approved rule version cannot be changed; a new version does not affect cohorts bound to the old one | API tests |
| W4 | (If W3 is built) group allocation respects capacities and rules, and the result is independently validated | Same pattern as PW1/PW5 |

### Infrastructure and governance

| # | Criterion | Evidence |
| - | --------- | -------- |
| G1 | A student is recognized by `(tid, oid)` after an e-mail or name change post-binding | API test |
| G2 | A student missing from the newest roster batch loses choice rights on the next request; their records are kept and flagged | API test |
| G3 | A Graph, Entra or SMTP outage never widens permissions; the age of the last roster batch is visible | API tests with failing doubles |
| G4 | The previous release runs on the new schema (auto-update rollback) | CI job |
| G5 | The app works under its own host and under a sub-path | The browser journeys run under `/wahl` and at the root in CI |
| G6 | The roster stores only the minimal fields even when Graph returns more; no school ID number, birth date or address exists anywhere in the schema | Schema review + importer test with an over-full Graph double |
| G7 | Retention rules (D-15) are implemented as an admin-triggered, audited purge per school year | API test |
