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
5. **Nightly auto-update always**, also during open windows (D-14); a failed update stays down until the
   next release fixes it (revised 2026-10-31).
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
| D-14 (revised 2026-10-31) | **Quadlet stack like school-election, nightly auto-update always, no automatic rollback.** Own host or sub-path, both supported | A release runs only on the schema it was built for (schema version); a failed update stays down until fixed; choices saved per change; `busy` only during jobs |
| D-16 | Attendance: project week by the **class teacher (KV)**, WPF by an **admin**. Non-submitters are **notified automatically by e-mail** at the close | KV assignment per class (D-17); mail transport (D-18) |
| D-17 (revised) | **KV assigned per class in the app** by an organizer or admin, or from an optional CSV column | No external lookup |
| D-18 (revised) | **SMTP submission** (STARTTLS or implicit TLS, authenticated) as the built-in transport, behind a transactional outbox with a unique dedupe key per notice. The transport is an interface; a school may plug in its own without it being part of the product | Sender address and DKIM/SPF are the school's SMTP setup |
| D-05 (revised 2026-10-29) | **Up to three ranked wishes per time group and project day**, the cap configurable per campaign; fewer when fewer eligible items remain. A time group is the set of items whose sessions occupy the same span of the day (the same periods, or the same clock span), derived from the sessions, never defined up front. A day with full-morning courses only has one group, so the rule reads "three wishes per day" there; the Sporttag with its blocks has several | The student ranks within small groups and never a weekly list; completeness = every shown group has its wishes; the allocation composes across groups by real session times, so overlapping blocks (2.–3., 3.–5., single periods) need no partition and no "combination wish" |
| D-07 | **Fees need no acceptance step.** The fee is shown on the item; whoever is assigned pays, for chosen and fixed activities alike | No acceptance entity; a fee export per student for the school's accounting |
| D-19 | **Exceptions to the WPF plan are handled outside the software** (repeaters, late joiners, later changes, cancelled subjects) | The product handles the standard campaign only |
| D-21 (revised 2026-11-03) | **An explicit list of classes per registration**, every class of the class lists preselected when it is created; a project week takes some out (the 12th grade in its last weeks), a WPF names the 9th grade's. Stored by class name (`campaign_class`), changed while the registration is set up or takes proposals, never without a class an activity or a rule names | Replaces the never-built eligibility rules `all` and `class prefix`; every reader of "the registration's students" goes by the list (schema version 2) |
| D-22 | **Least privilege by default:** the roster refresh runs with the administrator's own delegated Graph token; the app holds no standing directory permission. Application permission (`GroupMember.Read.All`) is an opt-in for schools that want automatic refresh at window opening | Verified 2026-10-29: `GroupMember.Read.All` alone lists ids only; `User.ReadBasic.All` joins the default for names and addresses |
| D-24 (revised) | **Fixed class activities.** A teacher organizes an activity for one or more classes; e.g. teachers A and B take classes C and D to Vienna, Tuesday 08:00 to Wednesday 13:00. Those students are assigned automatically and choose only for the remaining time (Monday). When the teacher has room to spare (seats on the bus), those **extra places** are open to other students who meet the activity's eligibility; they rank it like any other. Confirmed 2026-10-29 against the school's 2025/26 overview, where mixed items are the norm ("1A + 98 SuS", "6BG + 10 SuS", "7B + 11 SuS") | One item type: `fixed_classes[]` (may be empty), `places` (the capacity of a choosable activity, the extra places of a class activity; pre-assigned students count against nothing), eligibility for those places. Pre-assignments materialized when the window opens; overlapping choosable items pruned per student; fixed credit counts toward the daily minimum; the compiler resolves pre-assignments before the solver and sends the item with `max = places` when `places > 0` |
| D-08 | **c — a per-item flag**, default: the activity may be cancelled below its minimum and its students fall back to their next ranks. An activity fixed for classes is never cancelled | `cancellable_below_min` on the item; the solver's `y[o]` is free only for cancellable items |
| D-06 (2026-10-29) | **b, plus a swap window; no second round by e-mail.** A student the run cannot place within their wishes, and a student who did not submit, is placed into an item with free places for their grade **and no fee**; that counts as a disadvantage in the run. Whoever cannot be placed that way stays unplaced and is placed manually by the class teacher (KV) or the organizer. After publication a **swap window** (one week, configurable) lets every student move into an item with free places for their grade, first come first served; leaving an item is refused when it would drop below its minimum; class activities are excluded | Free-place booking per item under the campaign lock (the one place where first-come-first-served returns, bounded to free places); the KV page lists the class's unplaced students; mails on placement, swap and manual change |
| D-15 (2026-10-29) | **Retention as proposed:** project-week records until one year after the school year ends; WPF plans until one year after the cohort's Matura; fee records per accounting rules; the audit log as long as the records it explains | An admin-triggered, audited purge per school year; nothing is deleted automatically |
| D-13 (2026-10-29) | **Visibility.** While the window is open, students see no demand indicators. In the swap window (D-06) they see the free places per item, which is what the window is about. Teachers see the demand per day and grade while proposing, and after publication the participant list of their own items, never anyone's rankings. Whether the catalogue names the teachers is the school's call; the project lead's school answers it on 2026-11-04 | The catalogue and the proposal view carry a per-campaign switch for teacher names; the demand view is part of the catalogue phase; the choice view shows places only in the swap window |
| D-20 (2026-10-29) | **Fairness levels as in `domain-and-api.md` §5, in two passes:** the first pass allocates the students who submitted in the first window; the second pass allocates the grace week's submitters and the non-submitters with the first pass fixed. That is "Fenster 1 vor Fenster 2" without a new objective. "Disadvantage on another day" needs no level of its own: L3 already protects the worst-off. The simulation on synthetic data is a pilot task (P.1), not an open decision | The compiler marks each student's submission window and runs the solver twice; the contract takes fixed assignments; the explanation per student names the rule |
| D-23 (2026-10-29) | **Searchable group picker.** Entering group IDs by hand is the CSV path with extra steps; the picker searches the tenant's groups by name with the administrator's own token | `Group.Read.All` joins the delegated scopes of the roster refresh (D-22); the admin consents once; the labelled groups are stored as before |
| D-25 (2026-10-29) | **Sessions in the school's period grid.** A school defines its periods once (1. EH 7:35–8:25, 2. EH 8:30–9:20, …, with the long break). A teacher enters a session as "from period *x*, *y* periods long" (default: from the 2nd period) or, for trips, as a clock time and a duration | Stored as instants, as today; the grid is a settings table with a default, not a per-campaign slot list; the catalogue and the ranking view show period labels where a session matches the grid and clock times where it does not; D-05's time groups derive from these spans |

## Revised by the project lead (2026-10-31)

D-14's first consequence was that every migration works with the previous release's code, so that
`podman auto-update` could roll a failed update back onto the new schema. It is withdrawn. Nobody would
track which later release owes the contraction an earlier one deferred, and a rollback that quietly runs
the previous release fails nobody's attention until the next update fails the same way. A failed update
now stays down where someone notices, and the next release fixes it; a few hours down in a two-week
choice window are acceptable. A release knows the schema version it was built for and refuses any
other; only a migration that older code cannot run on raises it. An operator who would rather choose
when to update leaves the timer off and pins a release (`deploy/README.md`, Updates); which is safer
depends on whether someone at the school watches the releases.

## Sharpened by the allocation slice (S4, 2026-10-29)

Points the model left to the implementation, settled with the engine (`docs/domain-and-api.md` §5–§6):

- **A run needs a daily minimum for every grade of the roster** (D-05, D-20); without one it is
  refused before the solver, since the requirement and the cost normalize by it. "No minimum" would
  silently switch the coverage levels off.
- **A cancelled item is a fact of the run, not a catalogue change** (D-08): the item stays approved,
  the published run's list says it does not take place, and the organizer confirms exactly that list
  at publication.
- **The second pass never revives an item the first pass cancelled** (D-20), so a course does not run
  with late submitters alone.
- **Fallback options go on every day a student still has to cover** (D-06), fee-free items only, at
  rank cap + 1; the levels make them the last resort.
- **The lot (L5) travels as its own field**, so the total cost (L4) stays exact; L3's thresholds derive
  from the cap (t = cap … 2).
- **A finished run moves the campaign to `review`, succeeded or failed**; a run interrupted by a
  restart is marked so and re-run by hand.

## Sharpened by the changes after publication (S5a, 2026-10-30)

Points D-06 and D-13 left to the implementation, settled with the swap window and the changes by hand
(`docs/domain-and-api.md` §3 rule 7):

- **A change supersedes rows and adds rows; nothing is updated or removed.** The published run's
  current rows are those no change superseded; the change itself (kind, items, reason, who, when) is
  the record the organizer and the auditor read. The reason never reaches a teacher or the student.
- **A swap leaves what overlaps the target**, class activities excepted, which are never left; a
  class activity's spare places may be entered like any other item's (D-24 revised). No project day
  may end up with more minutes missing than before.
- **The class teacher places into a gap only**: a student of their class short of minutes, into an
  item with a free place that overlaps nothing of theirs, with a reason, from publication to the
  archive.
- **The organizer's change may override a full item and a minimum, with a flag that is recorded**;
  a class activity, eligibility, an overlap and a coverage loss are never overridden (a removal may
  cost coverage, which the class's list then shows). The override exists because from publication on
  an approved item's times, places, minimum, fee and eligibility are what the run was computed with and
  no longer change (only its words may), so places cannot be raised after publication.
- **The swap window's dates stay editable until the window has begun**, also in `results`, so the
  organizer sets them when publishing.

## Sharpened by the retention purge (S5c, 2026-10-30)

Points D-15 left to the implementation:

- **A school year's records** are its campaigns with everything under them, its roster batches
  (unless a campaign of another year still goes by one) and its class-teacher rows; then every person
  no remaining record names, with their identity bindings and their accounts, unless the account holds
  a role grant or did something the remaining records refer to. The school scope's audit chain stays:
  it is the chain, it explains grants and imports still in force, and it records the purge itself with
  the reason and the counts. The campaign scopes' chains go with their campaigns.
- **The retention date** is one year after the school year's end: the first of September of the year
  after the second (`2026/27` → 2028-09-01). Refused before, and while a campaign of the year is not
  archived.
- **The purge is the one path through the guards**: a definer function owned by the migrator, the only
  role with `DELETE`, switching the guards off for its own transaction with a transaction-local setting
  the guards read first. The runtime role could set the switch and still delete nothing.

## Sharpened by the languages (S6c, S6d, 2026-10-30)

Before the first release, while nothing is frozen:

- **Every word is in one typed catalogue** (`packages/messages`), not an i18n library: `de.ts` is the
  source, `en.ts` is held to the same keys by the typecheck, and `de-formal.ts` overrides only the
  words that address staff. Nothing is compiled at runtime, so the CSP needs no `unsafe-eval`. The
  pages, the workbooks, the notices' values and the mail templates' defaults all read it.
- **Three languages from v1:** German with du for everyone, as colleagues at an Austrian AHS speak;
  German with Sie to staff and du to students; English. Both German variants keep the Austrian school
  words. A Germany-German vocabulary and a per-user language can follow; the keys allow both.
- **One language per school**, set by an administrator and audited. The server names it in every page
  it sends (`<meta name="locale">`), so the sign-in page has it too, and reads it for each workbook and
  each transaction that queues notices.
- **The mail templates' defaults live in the catalogue**; a row of `mail_template` is only what an
  organizer saved, kept with the language it was written in, and the reset removes it. Placeholders
  have English names, as code does.
- **The words themselves** follow `docs/glossary.md`, approved by the project lead: Anmeldung for a
  campaign, Einteilung for what students and teachers see and Zuteilung for the organizer's
  computation, the asterisk for persons, Lehrkraft, Einheit, Kosten, Klassenlisten, and einloggen for
  signing in.

## Sharpened by the project days' wishes (2026-11-04)

The school's wishlist for its project days, with the outcomes of the meetings of 2026-11-03 and 2026-11-04, settled points 1, 2, 3, 5, 6 and 11 (the rest stay wishes). Decided with the owner on 2026-11-04, built in this order:

- **An attendance frame per project day** (`campaign_day`): the periods of the grid everyone is at school in, or none (the default for a new day). With a frame the demand counts the day per period: an activity counts in every period a session of it touches, a part of one included, and a class activity takes its classes out of the periods it touches only. Without a frame the day is one cell, as before. Stored as period numbers, as the school says it ("2.–6. EH"); a later change of the grid moves the frame's times, as it moves nothing else. Set until the window opens.
- **The gate on new offers** (`lock_new_offers`, off unless the organizer turns it on; the target is the headroom's, no second number): a teacher's submission is refused when every cell the activity serves (every cell it touches × every grade it is open to, on each of its days) has reached its target; allowed as soon as one is short; not judged when it serves none; never an organizer's, who sees the hint and may go ahead; never a class activity, extra places or not. A resubmission after a return is judged by the cells that get more places than the last submission gave them (the shape stored at each submission), so a correction locks nobody out. The organizer's change that adds to a proposed or approved activity shows the hint, nothing blocks.
- **A class is in one class activity at a time**: refused for everyone at the submission, at the approval and at an organizer's change of classes or times of a proposed or approved class activity, naming the other activity, its lead and the span shared; the form shows it on a draft; the publication warns of conflicts among approved activities that predate the rule. The run's own check (`fixed_items_overlap`) stays as the backstop.
- **"Eingereicht am" is the first submission** (`first_proposed_at`), kept through a return and a resubmission; activities submitted before this release carry their approval's time, else their last change's.
- **The review page** ("Eingereichte durchgehen"): the submitted activities one after the other, by the first submission, with the demand without and with each (the check endpoint), approve, return, withdraw, skip; a page of its own, not a mode of the registration page.
- **A duty to lead per teacher** (`teacher_detail.lead_duty`, true unless said otherwise): a mark for the overview of who has done their part, nothing a teacher may do changes. Read from the availability sheet's `Leitung` column only (empty: the duty, `N`: none; the teacher list CSV stays as it is) or set by an organizer beside the Kürzel; the next import replaces it. "Leitet an keinem Tag etwas" names those with the duty alone; "Ohne Leitungspflicht" names the others. Returning or withdrawing the lead's only activity shows the note "… leitet dann in dieser Anmeldung nichts" for a lead with the duty; no bar.
- **Companions sought** (`catalog_item.companions_wanted`, 0–8, none unless the lead says so): the companions stay the activity's teachers beside the lead; sought = wanted − named. A teacher of the roster joins from the list per project day ("Begleitung gesucht": the submitted and approved activities that may still take place and still seek one, a submitted one marked as not approved yet) as long as the registration is not archived, not over one they lead or accompany, not on a day they are unavailable ("nur wenn nötig" passes), under the campaign's lock so the last place goes once; they leave on their own until the registration opens. The lead of a submitted or approved activity, and an organizer, set the companions and the number wanted alone, the activity's state untouched. No mail.

## Sharpened by the feedback on activities (2026-11-06)

The first weeks of teachers entering activities, with the project lead's decisions of 2026-11-06:

- **An activity of its teachers alone**: no class and no places (a supervision, a duty). Nobody ranks it, it serves no cell of the demand, the gate does not judge it, and students see it in no list and no catalogue; lead, companions and the planning count it like any other.
- **The list of activities stands under the day an activity starts on**, by start and title; the review queue may too, the order by first submission staying its default.
- **Credited minutes are derived, never entered** (amends D-03's "credit counted per local date", which stays): per local date the minutes a session shares with the periods of the school's grid. Clock minutes would not do: two activities over two and three periods credit fewer clock minutes than one over the five, by the break between them, so a day's minimum would mean different things for different cuts of the day. On the grid a period is a period, and "Mindestminuten je Tag" counts lesson time. A session that shares nothing with the grid on any of its dates (an evening, a school without a grid) credits its clock minutes, so every session credits something. Sessions entered before were brought to the rule once, for the registrations not yet open (migration `0009`), and follow a change of the grid until they open. The column's meaning changed, so the migration raises the schema version to 3: a release that still lets a teacher type credits does not start on such a database.
- **The lead of an activity is stored and changes only by an act** (`item_teacher.lead`). It was derived on every read as "the proposer when among the teachers, else the first named", so an organizer who created an activity for a colleague and later signed up to accompany it became its lead, and nobody could hand the lead over. Now: a new activity is led by its creator when among its teachers (else the first named, or whom the body names); whoever is added or joins accompanies; the lead hands the activity to one of its companions and stays as a companion, without a step of consent and without a new approval, so every teacher is reached by adding them first; an organizer names another lead in any state; taking the lead out without naming another is refused. Every activity kept the lead it had (migration `0010`).
- **Direct placement, and leaving a class activity** (amends D-24). The teachers of an activity (lead and companions) and organizers place single students into it, from its first save and in every state of it, until the window closes. A placement takes one of the activity's places and is not capped by them, so an activity of placed students alone has none. An activity with a student placed into it takes place, as a class activity does: the run neither cancels it nor holds it to its minimum, since its placed students are in it before anyone is assigned. **A direct placement beats a class placement**: with its box on (the default: "nimmt an Klassenaktivitäten, die sich damit überschneiden, gar nicht teil"; first worded "in dieser Zeit", which read as the unticked state, reworded on 2026-11-06) the student is out of every class activity that overlaps it in time, out of the whole of it, so a student who does not go on the class trip is free for all its days; with the box off the student stays in the class activity and is away for that time. No confirmation: the page says what the box means, with the class activities and their leads. The teachers of a class activity see who of its classes is taken, in its form already, and **reclaim** a student, which removes the other placement; the page says whom to tell, nothing keeps the other teacher from placing the student again, and the two then talk. A later direct placement moves a student out of an earlier one it overlaps, the same way. The teachers of a class activity, the class teacher and organizers also keep its **list of who does not take part**, from the moment the activity exists and without reasons (nobody gives one for not staying overnight), and take students off it again; this is the exemption, which had been an organizer's, with a reason, while the window was open, and for good. **Overnight** is an activity with a session over more than one local date: it is marked, the form of such a class activity asks its teachers to enter who does not come, and the allocation never gives it as a fallback. Students declare nothing. After publication (project lead: every teacher of the activity) the same acts are changes to the published result: the student leaves whatever overlaps, is told, and the change says what it was in place of a reason. The assumption under all of it: teachers act responsibly; the app records and tells, it does not arbitrate.

## The minimum length of an activity per day (2026-11-07)

The project lead's decisions of 2026-11-07: the organizer sets, per project day, the least an activity must credit on that day — **in minutes alone**, since the grid allows periods of unequal length and "2 Einheiten" would mean one thing or another. Summed over the activity's sessions on the day; **class activities are held to it**, an activity of its teachers alone is not, and a session over a night meets it on every day it touches. **Checked on every save** (`checkItem`), the form says the shortfall live; a minimum raised later re-checks nothing accepted, the next change of an activity's times is held to it.

## Still open

Nothing from the decision list of 2026-10-27 is open any more. Open from the school's concept
documents, owned by the school: whether the catalogue names the teachers (D-13, 2026-11-04).

## Still open from the original handoff §11

- the AHS curriculum and the school's own provisions per cohort;
- the approval authority for WPF rules.

Settled 2026-10-29: the exact project days and the daily minimum per grade are campaign configuration
(the days since S2, the minimum per grade with the choice window); clock hours vs lesson periods is
D-25, which takes both.
