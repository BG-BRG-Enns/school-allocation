# SchulWahl — Decisions

Status: decisions of 2026-10-27 recorded; revised the same day after the scope correction below.

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
| D-05 | ***N* further alternatives, configurable per campaign, default 3**; fewer when fewer eligible items remain | Completeness = one valid plan + min(*N*, remaining eligible items) |
| D-07 | **Fees need no acceptance step.** The fee is shown on the item; whoever is assigned pays, for chosen and fixed activities alike | No acceptance entity; a fee export per student for the school's accounting |
| D-19 | **Exceptions to the WPF plan are handled outside the software** (repeaters, late joiners, later changes, cancelled subjects) | The product handles the standard campaign only |
| D-21 | **Project week: all students. WPF: 9th grade, i.e. the classes whose name starts with `5`** | Eligibility rules `all` and `class prefix` |
| D-22 | **Least privilege by default:** the roster refresh runs with the administrator's own delegated Graph token; the app holds no standing directory permission. Application permission (`GroupMember.Read.All`) is an opt-in for schools that want automatic refresh at window opening | Verify on a test tenant which member properties the delegated call returns (`mail` in particular) |
| D-24 | **Fixed class activities.** A teacher organizes an activity for one or more classes; e.g. teachers A and B take classes C and D to Vienna, Tuesday 08:00 to Wednesday 13:00. Those students are assigned automatically, nobody else can choose it, and the students choose only for the remaining time (Monday) | Item `mode: fixed` with target classes; pre-assignments materialized when the window opens; overlapping choosable items pruned per student; fixed credit counts toward the daily minimum; the model compiler resolves fixed items before the solver |

## Still open

### D-06 · P2 · Students the allocation cannot fully place

a. second round (e-mail asks for more choices, re-run with everyone else fixed); b. organizer places
them manually into free capacity; c. both, b after a deadline. Owner: organizer.

### D-08 · P2 · Minimum group size

a. the solver may cancel an item below its minimum and students fall back to their next ranks;
b. every published item runs; c. a per-item flag. Recommendation **c**, default **a**. Owner: organizer.

### D-13 · P2 · Visibility

Teachers see the participant list, not the rankings (proposed). No demand indicators for students
(proposed; they distort rankings). Owner: school leadership.

### D-15 · P3 · Retention

Proposed: project-week records until one year after the school year ends; WPF plans until one year
after the cohort's Matura; fee records per accounting rules; audit log as long as the records it
explains.
Implemented as an admin-triggered, audited purge. Owner: data protection.

### D-20 · P2 · Fairness levels

Confirm the lexicographic levels of `domain-and-api.md` §5 after a simulation on synthetic data shaped
like a real project week (activities, durations, capacities, students per grade). Owner: organizer +
developer.

### D-23 · P3 · Group picker

Admin enters group IDs (no extra permission) vs a searchable picker (`Group.Read.All`). Owner: project
lead.

## Still open from the original handoff §11

- exact project days and the daily minimum per grade;
- clock hours vs lesson periods;
- the AHS curriculum and the school's own provisions per cohort;
- the approval authority for WPF rules.
