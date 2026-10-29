# SchulWahl — Decisions

Status: decisions of 2026-10-27 recorded; revised the same day after the scope correction below, and
on 2026-10-29 after the school's concept documents for the project week (D-05, D-06, D-15, D-24, D-25).

Priority: **P1** blocks the architecture, **P2** blocks the MVP, **P3** before production.

## Scope correction (2026-10-27, project lead)

SchulWahl is an **open-source product for Austrian schools**, not an integration for one school.

- The only assumption about a school's environment: **Entra ID exists for every student and teacher,
  and classes are maintained as Entra groups.**
- No private system, repository or interface of any school is a dependency or is named in the
  product. The roster view over a school database proposed earlier is withdrawn; the private mail
  API proposed earlier is withdrawn as a dependency.
- Operations (backups, monitoring, host placement, ports, hostname vs sub-path) are the operator's
  business. The product documents what it ships and runs under its own host **or** a sub-path.
- The handoff's instruction to inventory on-premises systems was therefore largely beside the point.
  What it did establish: Entra is the common denominator, and nothing else is.

## Amendments to the handoff

1. **Ranked choices, not FCFS** (D-01), "for now, might change after evaluation". The race-safe
   booking transaction, the opening spike and FIFO fairness drop out; a choice window, an allocation
   run, review, publication and a fairness rule come in. Unchanged: identified records, fixed
   sessions, indivisible multi-session activities, no overlaps, daily credited minimum, fees visible
   before ranking.
2. **Free combinations** (D-03 c) make the solver a **core component** for project week.
3. **WPF needs no history** (D-09): electives are chosen for all three years at once; validation
   runs over the submitted plan. The handoff's "validation considers previous choices" does not apply
   to the normal case.
4. **Both catalogues are maintained in the app**; the printable catalogue is generated from them.
5. **Nightly auto-update always**, also during open windows (D-14).
6. **No school administration system is integrated** (scope correction above).
7. **Fixed class activities** (D-24): not every activity is chosen. A teacher may organize one for
   whole classes; those students are assigned automatically and choose only for the remaining time.
   Revised the same day: such an activity may offer extra places (spare seats on the bus) that other
   eligible students rank like any choosable activity.
8. **Fees need no acceptance step** (D-07); the handoff's consent mechanism is dropped.
9. **WPF exceptions are handled outside the software** (D-19).

## Decided

| ID | Decision | Consequence |
| -- | -------- | ----------- |
| D-01 | **Ranked choices + allocation run** for project week; re-evaluated after the first use | `mechanism` is a campaign property; FCFS or a hybrid can be added later |
| D-02 | **Separate open-source repository** | Conventions from school-election; own app registration, database, release cycle |
| D-03 | **c — free combinations.** One activity may already cover a day; e.g. two activities on Monday (09:00–11:00, 11:00–13:00) plus one from Tuesday 08:00 to Wednesday 13:00 | CP-SAT required; multi-day items indivisible; credit counted per local date |
| D-04 | **b — protect the worst-off first** (lexicographic), ties by recorded seed | Exact levels in `domain-and-api.md` §5; to be checked by simulation (D-20) |
| D-09 | **WPF recorded in SchulWahl from the first campaign; no import** | No external dependency for WPF |
| D-10 (revised) | **Roster from Entra: class groups via Microsoft Graph, or a CSV upload.** No school ID number is stored. Graph-imported persons are pre-provisioned by `oid`; CSV persons are bound once by exact e-mail/UPN at first sign-in | No app roles needed; kind comes from the roster |
| D-11 | Every student and teacher has an Entra account; the project lead owns the app registration and secret rotation | — |
| D-12 (revised) | **Both import paths are first-class**: Graph groups and CSV | The earlier "no CSV" decision assumed a school database; withdrawn |
| D-14 | **Quadlet stack like school-election, nightly auto-update always.** Own host or sub-path, both supported | Migrations compatible with the previous release; choices saved per change; `busy` only during jobs |
| D-16 | Attendance: project week by the **class teacher (KV)**, WPF by an **admin**. Non-submitters are **notified automatically by e-mail** at the close | KV assignment per class (D-17); mail transport (D-18) |
| D-17 (revised) | **KV assigned per class in the app** by an organizer or admin, or from an optional CSV column | No external lookup |
| D-18 (revised) | **SMTP submission** (STARTTLS or implicit TLS, authenticated) as the built-in transport, behind a transactional outbox with a unique dedupe key per notice. The transport is an interface; a school may plug in its own without it being part of the product | Sender address and DKIM/SPF are the school's SMTP setup |
| D-05 (revised 2026-10-29) | **Up to three ranked wishes per time group and project day**, the cap configurable per campaign; fewer when fewer eligible items remain. A time group is the set of items whose sessions occupy the same span of the day (the same periods, or the same clock span), derived from the sessions, never defined up front. A day with full-morning courses only has one group, so the rule reads "three wishes per day" there; the Sporttag with its blocks has several | The student ranks within small groups and never a weekly list; completeness = every shown group has its wishes; the allocation composes across groups by real session times, so overlapping blocks (2.–3., 3.–5., single periods) need no partition and no "combination wish" |
| D-07 | **Fees need no acceptance step.** The fee is shown on the item; whoever is assigned pays, for chosen and fixed activities alike | No acceptance entity; a fee export per student for the school's accounting |
| D-19 | **Exceptions to the WPF plan are handled outside the software** (repeaters, late joiners, later changes, cancelled subjects) | The product handles the standard campaign only |
| D-21 | **Project week: all students. WPF: 9th grade, i.e. the classes whose name starts with `5`** | Eligibility rules `all` and `class prefix` |
| D-22 | **Least privilege by default:** the roster refresh runs with the administrator's own delegated Graph token; the app holds no standing directory permission. Application permission (`GroupMember.Read.All`) is an opt-in for schools that want automatic refresh at window opening | Verify on a test tenant which member properties the delegated call returns (`mail` in particular) |
| D-24 (revised) | **Fixed class activities.** A teacher organizes an activity for one or more classes; e.g. teachers A and B take classes C and D to Vienna, Tuesday 08:00 to Wednesday 13:00. Those students are assigned automatically and choose only for the remaining time (Monday). When the teacher has room to spare (seats on the bus), those **extra places** are open to other students who meet the activity's eligibility; they rank it like any other. Confirmed 2026-10-29 against the school's 2025/26 overview, where mixed items are the norm ("1A + 98 SuS", "6BG + 10 SuS", "7B + 11 SuS") | One item type: `fixed_classes[]` (may be empty), `places` (the capacity of a choosable activity, the extra places of a class activity; pre-assigned students count against nothing), eligibility for those places. Pre-assignments materialized when the window opens; overlapping choosable items pruned per student; fixed credit counts toward the daily minimum; the compiler resolves pre-assignments before the solver and sends the item with `max = places` when `places > 0` |
| D-08 | **c — a per-item flag**, default: the activity may be cancelled below its minimum and its students fall back to their next ranks. An activity fixed for classes is never cancelled | `cancellable_below_min` on the item; the solver's `y[o]` is free only for cancellable items |
| D-06 (2026-10-29) | **b, plus a swap window; no second round by e-mail.** A student the run cannot place within their wishes, and a student who did not submit, is placed into an item with free places for their grade **and no fee**; that counts as a disadvantage in the run. Whoever cannot be placed that way stays unplaced and is placed manually by the class teacher (KV) or the organizer. After publication a **swap window** (one week, configurable) lets every student move into an item with free places for their grade, first come first served; leaving an item is refused when it would drop below its minimum; class activities are excluded | Free-place booking per item under the campaign lock (the one place where first-come-first-served returns, bounded to free places); the KV page lists the class's unplaced students; mails on placement, swap and manual change |
| D-15 (2026-10-29) | **Retention as proposed:** project-week records until one year after the school year ends; WPF plans until one year after the cohort's Matura; fee records per accounting rules; the audit log as long as the records it explains | An admin-triggered, audited purge per school year; nothing is deleted automatically |
| D-13 (2026-10-29) | **Visibility.** While the window is open, students see no demand indicators. In the swap window (D-06) they see the free places per item, which is what the window is about. Teachers see the demand per day and grade while proposing, and after publication the participant list of their own items, never anyone's rankings. Whether the catalogue names the teachers is the school's call; the project lead's school answers it on 2026-11-04 | The catalogue and the proposal view carry a per-campaign switch for teacher names; the demand view is part of the catalogue phase; the choice view shows places only in the swap window |
| D-20 (2026-10-29) | **Fairness levels as in `domain-and-api.md` §5, in two passes:** the first pass allocates the students who submitted in the first window; the second pass allocates the grace week's submitters and the non-submitters with the first pass fixed. That is "Fenster 1 vor Fenster 2" without a new objective. "Disadvantage on another day" needs no level of its own: L3 already protects the worst-off. The simulation on synthetic data is a pilot task (P.1), not an open decision | The compiler marks each student's submission window and runs the solver twice; the contract takes fixed assignments; the explanation per student names the rule |
| D-23 (2026-10-29) | **Searchable group picker.** Entering group IDs by hand is the CSV path with extra steps; the picker searches the tenant's groups by name with the administrator's own token | `Group.Read.All` joins the delegated scopes of the roster refresh (D-22); the admin consents once; the labelled groups are stored as before |
| D-25 (2026-10-29) | **Sessions in the school's period grid.** A school defines its periods once (1. EH 7:35–8:25, 2. EH 8:30–9:20, …, with the long break). A teacher enters a session as "from period *x*, *y* periods long" (default: from the 2nd period) or, for trips, as a clock time and a duration | Stored as instants, as today; the grid is a settings table with a default, not a per-campaign slot list; the catalogue and the ranking view show period labels where a session matches the grid and clock times where it does not; D-05's time groups derive from these spans |

## Still open

Nothing from the decision list of 2026-10-27 is open any more. Open from the school's concept
documents, owned by the school: whether the catalogue names the teachers (D-13, 2026-11-04).

## Still open from the original handoff §11

- the AHS curriculum and the school's own provisions per cohort;
- the approval authority for WPF rules.

Settled 2026-10-29: the exact project days and the daily minimum per grade are campaign configuration
(the days since S2, the minimum per grade with the choice window); clock hours vs lesson periods is
D-25, which takes both.
