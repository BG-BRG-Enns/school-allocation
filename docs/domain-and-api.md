# SchulWahl — Domain and API (Phase B.7)

Status: proposal for review · 2026-10-27 · revised 2026-10-29 for the decisions of that day
(`open-decisions.md`: D-05, D-06, D-13, D-15, D-20, D-23, D-25)

## 1. Entities

| Entity | Key fields | Notes |
| ------ | ---------- | ----- |
| `Person` | `id` (uuid), `kind` (student/teacher), `display_name` | No school ID number, no birth date |
| `IdentityBinding` | `person_id`, `tid`, `oid`, `bound_at`, `method` (`graph` / `email_match` / `admin`), `import_batch_id`, `unbound_at` | Unique `(tid, oid)` while active; rebinding is audited |
| `ImportBatch` | `id`, `source` (`graph:groups` / `csv`), `fetched_at`, `payload_sha256`, `row_count`, `triggered_by`, `school_year` | Append-only |
| `RosterGroup` | `group_id` (Entra), `label`, `kind` (students / teachers), `class?`, `grade?` | Admin-maintained mapping used by the Graph import; groups are found with a searchable picker over the tenant's groups (D-23), not by typing IDs |
| `PeriodGrid` | per school: `period` (1…), `starts`, `ends` (local times) | The school's lesson periods (D-25), with a default (1. EH 7:35–8:25, 2. EH 8:30–9:20, …). Settings, not campaign data |
| `SchoolSetting` | one row per school: `locale` (`de` / `de-formal` / `en`), `updated_by` | The language the pages, the workbooks, the notices' values and the mail templates' defaults speak: German with du, German with Sie to staff, English. Set by an administrator, audited; German until then. The server names it in the page (`<meta name="locale">`, `<html lang>`) on every page request, so a change applies at the next load |
| `RosterEntry` | `batch_id`, `oid?`, `upn?`, `mail?`, `display_name`, `kind`, `class?`, `grade?`, `person_id?` | One per person per batch |
| `ClassTeacher` | `school_year`, `class`, `person_id`, `assigned_by` | Assigned in the app or from a CSV column |
| `SchoolYear` | `id` (e.g. `2026/27`), `starts_on`, `ends_on` | Explicit rollover |
| `Campaign` | `id`, `kind` (`project_week` / `wpf`), `mechanism` (`ranked`), `school_year`, `project_days[]`, `eligibility` (rule), `opens_at`, `closes_at`, `late_until` (end of the grace week), `swap_from`, `swap_until`, `config` (wishes per time group, default 3; daily minimum in minutes per grade; reminders; whether the catalogue names teachers; `place_headroom_percent`, the places above the need the demand's target asks for, default 20), `rules[]` (`CampaignRule`), `status`, `roster_batch_id?` (frozen at close) | Lifecycle in §2; the days and the per-grade minimum are configuration, not code |
| `Category` | `id`, `name` (unique in any case, at most 60 characters) | The school's, outside any school year, like the period grid: at most 50, sorted by name. Kept by organizers and administrators, audited in the school scope (`category.created` / `changed` / `removed`); renamed freely, removed only while no item and no rule names it (409 `category_in_use`) |
| `CampaignRule` | `campaign_id`, `position`, `category_id`, `grades[]` (at least one), `classes[]` (empty: every class of the grades), `unit` (`items` / `minutes`), `minimum` (1–20 items or 1–10000 minutes) | At least so many items, or credited minutes, of the category per student (school-core `rules.ts`); class activities count. At most 20 per campaign, replaced as a whole until the window opens, audited as `campaign.rules-changed` when they change. Never a hard constraint (§5) |
| `TeacherAvailability` | `person_id`, `day`, `status` (`unavailable` / `if_needed`), `updated_at` | No row means available; no reason is stored. Per date, not per campaign. Set by the teacher on the days of a campaign taking proposals, by an organizer on a campaign's days until it is archived (audited in its chain as `availability.changed`); purged with the school year its date falls in |
| `CatalogItem` | `id`, `campaign_id`, `number` (from publication), `title`, `description`, `location`, `teachers[]`, `fixed_classes[]`, `eligible_grades[]`, `eligible_classes[]`, `places`, `min_participants`, `cancellable_below_min`, `fee_cents`, `fee_note`, `category_ids[]`, `state` (draft/proposed/approved/withdrawn), `review_note` | Project-week activity or WPF subject. The students of `fixed_classes` are pre-assigned; `places` are what others may rank: the capacity of a choosable activity, the extra places of a class activity (D-24 revised). An item is numbered when the catalogue is published. Its lead is the proposer when among its teachers, else the first named; the others accompany (school-core `leadOf`); rights do not depend on it |
| `Session` | `item_id`, `starts_at`, `ends_at` (timestamptz), `credited` per local date (`[{date, minutes}]`), `location` | Entered as "from period *x*, *y* periods" (default: from the 2nd period) or as a clock time and a duration, stored as instants (D-25); shown with period labels where it matches the grid. Immutable once the window opens, except by audited organizer change |
| `PreAssignment` | `campaign_id`, `item_id`, `person_id`, `source` (`class` / `manual`), `exempted_at?`, `exempted_by?`, `reason?` | Materialized from `fixed_classes` against the frozen roster when the window opens; an organizer may exempt a student, audited, who then chooses for that time |
| `WpfSubjectRule` | `item_id`, `rule_version_id`, years offered, periods per year, prerequisites, exclusions, continuation | WPF only |
| `RuleSetVersion` | `id`, `kind`, `curriculum_profile`, `effective_cohort`, `body` (declarative), `approved_by`, `approved_at` | Immutable once approved |
| `CurriculumProfile` | `id`, `sfkz[]`, `name` | SFKZ → profile mapping |
| `Choice` | `campaign_id`, `person_id`, `ranked` (per time group: item ids in order, at most the campaign's cap), `window` (`first` / `late`, from the time of the last save), `version`, `updated_at`, `entered_by` (self / organizer) | Whole-list replace; history kept in `ChoiceRevision` |
| `WpfPlan` | `campaign_id`, `person_id`, `items_by_year`, `alternatives?`, `rule_version_id`, `validation` | Multi-year plan, chosen at once |
| `AllocationRun` | `id`, `campaign_id`, `seq` (Lauf 1, 2, …), `status` (`running` / `succeeded` / `failed` / `interrupted`), `seed`, `limits`, `core_version`, `contract`, `solver_version`, `ortools_version`, `snapshot` (the compiled input, ids only, the rules and the items' categories included) and `snapshot_sha256` (without seed and limit, so a changed campaign shows as stale; empty rules and categories are left out of it, so a run from before them stays current), `warnings`, `passes[]` (per pass the solver's status, level values with `proven`, pairs, cancelled), `cancelled_items`, `failure` and `detail` (why it failed), `problems` (the validator's), `started_by`, `published_at?` | Many per campaign, at most one published; a finished run changes only by being published |
| `Assignment` | `id`, `run_id`, `person_id`, `item_id`, `source` (`fixed` / `solver` / `fallback` / `swap` / `manual`), `change_id?`, `superseded_by?` | Fixed rows are copied from the pre-assignments; `fallback` is a placement into a fee-free item outside the student's wishes (D-06); `swap` a student's own move in the swap window, `manual` a placement by hand, each added by a change. A row is never changed or removed: a change supersedes it (`superseded_by`, set once); the run's current rows are those not superseded, and a student is in an item once among them |
| `AssignmentChange` | `run_id`, `seq`, `kind` (`swap` / `place` / `move` / `remove`), `person_id`, `from_item_id?`, `to_item_id?`, `reason?`, `forced`, `changed_by`, `changed_at` | A change of the published run: the student's own swap (no reason), a class teacher's placement into a gap, the organizer's move or removal (a reason each). `forced` says the organizer overrode a full item, a minimum or a rule falling short. The rows it superseded point at it; append-only. The reason is the organizer's and the auditor's; the student is told what changed and by whom (class teacher or organization), never why |
| `Attendance` | `session_id`, `person_id`, `status` (`present` / `absent` / `excused`), `note`, `recorded_by`, `recorded_at` | Separate from assignments: an absent student keeps their place. Recorded by the class teacher of the student's class (D-16) or an organizer, for students currently assigned to the session's item, from publication to the archive; corrected in place, never removed; every recording audited with its counts |
| `OutboxMail` | `id`, `kind`, `campaign_id?`, `person_id?`, `to_address`, `subject`, `body`, `dedupe_key` (unique), `state` (`queued` / `sending` / `sent` / `failed`), `attempts`, `next_attempt_at`, `detail`, `message_id`, `sent_at` | Written in the triggering transaction; the unique `dedupe_key` (e.g. `choice_reminder:<campaign>:<person>:reminder:<close>`) prevents double notices; rows stay as the record of what was sent |
| `MailTemplate` | `kind` (one of `choice_invitation`, `choice_reminder`, `grace_invitation`, `grace_reminder`, `missed_deadline`, `class_missing`, `result_published`, `class_unplaced`, `item_cancelled`, `swap_confirmed`, `assignment_changed`), `subject`, `body`, `locale`, `updated_by` | An override of the message catalogue's default text (`packages/messages`, group `mail`), in the school's language: a row exists only for a kind an organizer saved, kept with the language it was written in, and the reset removes it. A notice renders the saved text or the default. Placeholders in `{{…}}` have English names (`first_name`, `name`, `campaign`, `link`, `deadline`, `project_days`, `class_name`, `window`, `list`, `programme`, `swap_period`, `activity`, `wish_count`, `minimum`, `changed_by`, `change`) and are checked against the kind's list at save; the catalogue says what each means and gives the test mail's sample value |
| `PreAssignment` | `campaign_id`, `item_id`, `person_id`, `source` (`class` / `manual`), `exempted_at?`, `exempted_by?`, `exempt_reason?` | Materialized from `fixed_classes` when the window opens and reconciled when an organizer changes an item's fixed classes afterwards (a placement by class goes with its class); exempted by an organizer, audited, and an exemption is never removed |
| `Choice` | `campaign_id`, `person_id`, `ranking` (group key → item ids in order), `saved_in` (`first` / `late`), `version`, `entered_by` | Whole-list replace; every save appends a `ChoiceRevision` (with `reason` when entered on behalf) |
| `RoleGrant` | `person_id`, `role`, `scope` (school / campaign), `granted_by`, `revoked_at` | Privileged roles |
| `AuditEvent` | hash-chained per campaign, allow-listed actions with typed metadata | Pattern from school-election |

## 2. Campaign lifecycle

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> catalogue: organizer opens proposals
  catalogue --> published: catalogue approved (print view available)
  published --> open: opens_at reached (roster refreshed, pre-assignments materialized)
  open --> grace: closes_at reached (class teachers get their class's missing submissions)
  grace --> closed: late_until reached (missed-deadline mails queued, roster batch frozen)
  closed --> allocating: organizer starts run
  allocating --> review: run stored, succeeded or failed
  review --> allocating: another run (other seed / settings)
  review --> results: organizer publishes one run (swap window opens at swap_from)
  results --> results: swap by the student / manual change (validated, audited)
  results --> archived: the organizer, after the event and the attendance; nothing changes afterwards, everything stays readable
```

A run is a job (`busy` in the health check while it executes); the campaign is `allocating` meanwhile and
`review` once the run is stored, whatever came of it: a failed run is stored with its reason and the
organizer starts another. A run left running by a restart is marked interrupted at the next start.

The grace week (`grace`) is the second window of D-06: a student may still submit or change, and the
saved list is marked `late`. The swap window (`swap_from` to `swap_until`, inside `results`) is the one
place where first come first served returns, bounded to free places (§3, rule 7).

The guards live in school-core and are re-checked under a per-campaign advisory lock, as in
school-election's `changeElection`. Time-based transitions are evaluated by server time; a
transition that was missed during a restart is applied on start.

## 3. Choice rules (project week)

1. **Fixed items first.** When the window opens, every student of a class named in an item's
   `fixed_classes` receives a `PreAssignment`. Such items appear in the student's plan as given;
   the pre-assigned students do not rank them, and choosable items that overlap a student's fixed
   items are not offered to that student. Example: classes C and D are in Vienna from Tuesday 08:00
   to Wednesday 13:00, so their students see only Monday's items. A student whose fixed items already
   cover every day has nothing to choose and counts as complete. An item with `places > 0` is, for
   every other eligible student, a choosable item with that capacity (D-24 revised).
2. Only **choosable** items eligible for the student's grade/class in the frozen catalogue can be
   ranked. Fixed items, ineligible items and items overlapping the student's fixed items are rejected
   server-side, so manipulated requests fail.
3. A paid item shows its fee before it can be ranked. Ranking it, or being pre-assigned to it, is
   the acceptance (D-07). There is no separate consent step.
4. **Ranking is per time group** (D-05). The offered items of a project day fall into time groups by
   the span their sessions occupy: the same periods of the grid, or the same clock span. A day of
   full-morning courses has one group; a Sporttag with blocks (2.–3. EH, 4.–5. EH, 3.–5. EH, single
   periods) has several, and they may overlap in time. The student ranks **up to the campaign's cap
   (default 3) per group**, fewer when fewer are eligible. Groups covered by the student's fixed items
   are not shown. A list is **complete** when every shown group has its wishes and, for every rule
   of the campaign applying to the student, the class activities and the best ranked item per group
   reach the minimum, or everything the offer could bring when it cannot, or as far as the cap leaves room next to the
   other rules: no wish added to a group or put in place of another brings the rule closer without taking another rule
   further from its own (school-core `ruleReaches`); school-core computes it and the page shows it live. Nobody ranks a weekly list, and nobody names combinations: the
   allocation composes across groups by real session times (§5).
5. Editing is allowed until `late_until` by server time. A list last saved after `closes_at` is
   marked `late` and allocated in the second pass (§5). Every save replaces the whole list
   (idempotent) and writes a revision.
6. An organizer may enter or alter a list on a student's behalf, or exempt a student from a fixed
   item (the student then chooses for that time), each with a required reason; both are audited.
7. **Swap window** (D-06). Between `swap_from` and `swap_until` every student may move into an item
   they may enter (approved, not cancelled by the run, eligible for their grade and class, not a class
   activity of theirs and overlapping none; a class activity's spare places count, D-24) that has a
   free place, leaving every item of theirs that overlaps it; the move is immediate and first come
   first served, under the campaign lock (`item_full` when someone was faster). Refused when an item
   left would drop under its minimum (`below_minimum`), when a class activity would have to be left
   (`leaves_fixed`), when the target overlaps an item the student keeps (`overlap`), and when any
   project day would end up with more minutes missing than before (`coverage_lost`), and when a rule
   would end up unmet with less toward it than before (`rule_lost`). Each move
   supersedes the rows left, adds a `swap` row, records the change and sends a confirmation. The
   same rules apply to the changes by hand: a class teacher places a student of their class who is
   short of minutes or of a rule into an item that fits the gap or brings the rule closer, with a
   reason, from publication to the archive; the organizer moves or removes with a reason, and may
   override a full item, a minimum or a rule falling short (recorded as `forced`), never the other
   rules. A removal alone may cost minutes and rules without an override: the student leaves the
   item either way, and the gap shows on the review and the class page. The swap window's dates may be set until the window has
   begun, so the organizer can set them when publishing.

**Credited minutes** are given by the teacher per session and local date (`Europe/Vienna`). They are
not derived from `end − start`, because breaks and travel do not count. A session over midnight, such
as the Vienna trip, credits each date separately.

**Overlap:** two items conflict if any of their sessions overlap. Touching end points (11:00–11:00)
do not overlap.

## 4. Notifications

| Trigger | Recipients | Required? |
| ------- | ---------- | --------- |
| *X* days before `closes_at`, and again before `late_until` | Students whose list is not complete | Configurable, default on |
| `closes_at` and `late_until` reached | Each class teacher: the class's students without a complete list | **Yes** (D-06) |
| `late_until` reached | Students whose list is not complete ("did not choose on time") | **Yes** (D-16) |
| Results published | All participants, with their items and the swap window's dates; class teachers with their class's unplaced students; teachers whose item was cancelled below its minimum | **Yes** |
| Swap (`swap_confirmed`) or a change by hand (`assignment_changed`: by whom, what changed; the reason stays with the organizer) | The student concerned | Yes |
| Activity changed after the window opened | Students who ranked it or are pre-assigned to it | Yes |

Each notice is an outbox row written in the same transaction as its trigger, with a unique
`dedupe_key`. A worker submits queued rows over authenticated SMTP (STARTTLS or implicit TLS) and
marks a row `sent` on the server's `250` reply, storing the generated `Message-ID`. Temporary
failures retry with backoff; permanent ones become `failed` with the reason. The transport is an
interface with the SMTP implementation built in, so a school can substitute its own. The state
(`sent` / `failed`) is shown on the organizer's non-submitter list; bounces are not tracked.

The worker sends one mail at a time, at most `MAIL_PER_HOUR` an hour (default and ceiling 200), spaced from the last claim the database holds, so a restart sends no burst. A row's `priority`, set when it is queued, decides its turn before its age: 1 for a mail someone waits for (`swap_confirmed`, `assignment_changed`, the test mail), 2 for staff (`class_missing`, `class_unplaced`, `item_cancelled`), 3 for students in bulk. An organizer or administrator can pause sending (`school_setting.mail_paused`, audited as `mail.paused` / `mail.resumed`); queued rows stay queued. A reminder carries `expires_at`, the end of the window it reminds of: still queued then, or when the window ends early, it becomes `expired` and is never sent.

## 5. Allocation model (project week)

**Inputs** (frozen snapshot):

- eligible students from the roster batch;
- their pre-assignments (fixed items, minus exemptions);
- their complete or incomplete ranked lists per time group, each marked `first` or `late`;
- the approved catalogue with sessions and credits;
- capacities, minimums, cancellability, fees;
- daily minimum per grade;
- the campaign's rules and the items' categories;
- the seed.

**Two passes** (D-20): the first pass allocates the students whose list was saved in the first
window; the second pass allocates the late submitters and the non-submitters with every assignment
of the first pass fixed. Late students therefore take what the first window left, which is the
school's rule "Fenster 1 vor Fenster 2", and nothing else in the model changes. In the second pass a
first-window student has exactly the options the first pass assigned them, all fixed; an item the
first pass cancelled is not offered in the second (a course the first window could not fill is not
revived by late lists). The second pass's level values are over every student, the first pass's
constants included, so they describe the whole school.

**Fallback placement** (D-06): for each day a student still has to cover, and for each rule they
still have to meet, the compiler adds every eligible **fee-free** item with places the student did
not rank (for a rule, of its category) as a fallback option, at rank `cap + 1`, which costs more than
any wish. Wish numbers are counted over the list as the student
saved it, so when the first pass cancels a student's first wish, their second stays the second in the
second pass. A non-submitter has fallback options only. L1 then fills the day if it can; a day that
stays uncovered is a deficit, and the student is listed as unplaced for the class teacher and the
organizer. A paid item is never assigned outside a student's wishes. Two class activities that take
the same student at the same time are the catalogue's mistake: the run is refused before the solver
(`fixed_items_overlap`), and the validator refuses such a result too.

**Pre-assignments are resolved by the compiler, not the solver.** For each student, the credit of
their fixed items is subtracted from each day's requirement (floored at zero), what they bring to a
rule from its minimum (`need`), and items that overlap
a fixed item are dropped from that student's options. An item reaches the solver with `max = places`,
which for a class activity are its extra places; the pre-assigned students are not variables of it,
and its minimum is its classes' business, so it reaches the solver with `min = 0`. A student with no
remaining requirement and no rule left to meet gets no variables.

**A run needs a daily minimum for every grade of the roster.** The requirement per day and the cost's
normalization come from it; without one the run is refused before the solver (`daily_minimum_missing`
names the grades). Before solving, the compiler also names every non-cancellable item fewer students
can take than its minimum asks (`minimum_out_of_reach`): the usual cause when a run comes back
infeasible, with the remedies at hand (make it cancellable, lower the minimum, withdraw it). It
names every rule and grade whose category cannot reach every student even if all its places went to
them (`rule_out_of_reach`, an upper bound): such a rule is met as far as it goes.

**Variables:**

- `x[s,o]` ∈ {0,1}, only for choosable items `o` on student `s`'s ranked list, or among the
  student's fallback options, that are eligible and do not overlap the student's fixed items. Other
  items are never assigned.
- `y[o]` ∈ {0,1}: the item runs. Fixed to 1 unless it may be cancelled below its minimum (D-08): the
  item says so, it is nobody's class activity, and it has a minimum to fall below. An item with no
  minimum runs with its takers or with none, so a course nobody ranked in the first window is still
  there for the late lists.

**Hard constraints:**

- **Capacity:** `Σ_s x[s,o] ≤ max_o · y[o]`; minimum `Σ_s x[s,o] ≥ min_o · y[o]`.
- **No overlap:** for each student and each conflicting pair `(o1, o2)` among the student's options,
  `x[s,o1] + x[s,o2] ≤ 1`. In practice these are clique constraints per time point.
- **Indivisibility:** an item with several sessions is one variable, so it is all or nothing by
  construction.

**Soft constraint (reported, never hidden):**

- **Daily coverage:** `Σ_o credit[o,d] · x[s,o] + u[s,d] ≥ R[s,d]`, with deficit `u[s,d] ≥ 0`.
- **Rules:** `Σ_o amount[o,r] · x[s,o] + v[s,r] ≥ need[s,r]`, with `v[s,r] ≥ 0` what the student
  misses of rule `r` (items or minutes) and `w[s]` ∈ {0,1} whether they miss any (`v[s,r] ≤ need[s,r]
  · w[s]`). `amount[o,r]` is 1 for an item of the category (unit `items`) or its credited minutes
  (unit `minutes`).

**Objective, lexicographic** (D-04 b, "protect the worst-off first"). Each level is solved, then fixed
as a bound for the next:

1. **L1:** minimize the number of students with any uncovered day.
2. **L2:** minimize the total uncovered minutes.
   **Rule levels**, only when the campaign has rules: minimize the number of students missing any
   rule (`students_missing_rule`, Σ `w[s]`), then the items missing for rules
   (`rule_missing_items`), then the minutes missing for rules (`rule_missing_minutes`). They come
   after the days and before the wishes, and do not exist for a campaign without rules, whose levels
   stay as before.
3. **L3:** for thresholds *t* = cap, cap − 1, …, 2, minimize the number of students whose
   minutes-weighted average rank exceeds *t*, one sub-level per threshold, the worst first. A
   student's cost is `Σ_o x[s,o] · rank(s,o) · minutes(o) / required_minutes(s)`, scaled to integers
   (× 1000, rounded per option), where `required_minutes(s)` is the requirement left after fixed items
   and `rank` counts within the item's time group; a fallback option ranks one past the cap. The
   threshold is compared exactly, `Σ rank · minutes · 1000 > t · 1000 · required_minutes(s)`, so the
   rounding of the costs never puts a student over a threshold they are on. A student whose fixed
   items cover the days but who has a rule left is not counted in L3 (`norm` 0); their options are
   costed against the grade's whole weekly minimum instead, so L4 still takes their wishes in order and
   a fallback last.
4. **L4:** minimize the total cost over all students.
5. **L5:** tie-break: minimize `Σ x[s,o] · ε(seed, s, o)`, with small deterministic pseudo-random
   weights (an FNV-1a hash of the seed, the student and the item, in `[0, 1000)`), sent as their own
   field so L4 stays exact. Equal alternatives are therefore decided by the recorded seed, not by
   input order.

**Reproducibility:**

- CP-SAT runs with `num_workers = 1`, `random_seed = seed`, and a **deterministic** time limit
  (`max_deterministic_time`), never a wall-clock limit.
- The OR-Tools version is pinned and stored with the run.
- Same snapshot + seed + versions → same assignment. This is tested in CI.

**Status per level:** `OPTIMAL` or `FEASIBLE` (not proven); each level is held at the value found while
the next is solved, and the solution found starts the next search. `INFEASIBLE` or `UNKNOWN` stops the
run, and the run cannot be published; `MODEL_INVALID` says the request was no sound model (the API
stores the reason). The run's status is `OPTIMAL` when every level was proven, else `FEASIBLE`. The
review screen shows each level's value and whether it was proven. A deterministic second is not a
wall-clock second (several of them, depending on the machine); the default limit per level is small
and the organizer may raise it for another run.

**Independent validation in school-core**, before a run is stored as reviewable:

- capacity and minimum;
- overlaps;
- eligibility;
- only ranked items, or fee-free fallback items where the student's wishes left a day uncovered;
- the first pass's assignments unchanged by the second;
- every pre-assignment present and unchanged, and no assigned item overlapping a fixed one;
- an item cancelled only if it may be, and nobody assigned to a cancelled item;
- the recomputed coverage, deficits, rule shortfalls and costs must equal the solver's reported
  level values, level by level, for each pass.

Any mismatch rejects the run.

**Explanation per student:** the assigned items with their ranks, minutes per day, deficits if any,
each rule applying to them with what their items bring and whether it is met, and a plain sentence on the rule ("first nobody without a full week, then as few students as possible
with mostly low-ranked choices, then the best overall result; ties by lot, seed …"), with the window
named for a late submitter ("your list came in the grace week and was placed after the others").

**Fairness caveat:** an optimizing allocation is not strategy-proof. A student could in theory gain by
mis-ranking, which is easier when demand is visible. Mitigation: no demand indicators (D-13), and
communicate "rank honestly — it is the best strategy for nearly everyone". The simulation (D-20)
should quantify this.

## 6. Solver contract (versioned, `contracts/allocation/v2`)

`POST /v1/solve` (internal network only):

```json
{
  "contract": "allocation/v2",
  "runId": "…",
  "seed": 123456789,
  "limits": { "deterministicTimePerLevel": 30 },
  "students": [{ "s": 17, "required": [{ "d": 0, "min": 300 }], "norm": 300,
                 "options": [{ "o": 4, "cost": 1200, "weight": 360, "tie": 613, "credit": [{ "d": 0, "min": 120 }] }],
                 "rules": [{ "r": 0, "unit": "items", "need": 1, "amounts": [{ "o": 4, "n": 1 }] }] }],
  "items": [{ "o": 4, "max": 20, "min": 8, "cancellable": true }],
  "conflicts": [[4, 9]],
  "fixed": [[23, 4]],
  "levels": ["students_with_deficit", "deficit_minutes", "students_missing_rule", "rule_missing_items",
             "rule_missing_minutes", "over:3000", "over:2000", "total_cost", "tiebreak"]
}
```

Response:

```json
{ "status": "OPTIMAL|FEASIBLE|INFEASIBLE|UNKNOWN|MODEL_INVALID",
  "levels": [{ "name": "…", "value": 0, "proven": true }],
  "assign": [[17, 4]], "cancelled": [9],
  "versions": { "solver": "…", "ortools": "…" },
  "detail": "only when the run stopped: which level, or what made the model unsound" }
```

- **IDs are small integers per run.** The mapping to persons and items stays in the api. An option's
  `cost` is the rounded normalized rank the total (L4) sums; its `weight` is the exact `rank · minutes`
  a threshold (L3) is compared against, over the student's `norm`.
- **No names, e-mails or classes.** The solver has no database credentials and no egress.
- **Rules are per student** (v2): each one still open after the fixed items, with its index `r` in
  the campaign's order, its unit, what is left of the minimum (`need`) and what each of the student's
  options brings to it (`amounts`, options bringing nothing left out). A student without rules sends
  `"rules": []`, and a campaign without rules sends no rule levels. The categories never reach the
  solver. v1 had no `rules`; the API and the solver speak one version, checked through `/health`.
- **The tie-break weights are computed in the TypeScript core from the seed** and sent as `tie` per
  option, minimized as the last level. This keeps the Python side free of domain randomness and L4
  exact.
- **A well-shaped request that is no sound model** (an option on an item the request does not list, a
  fixed pair that is not an option, an unknown level) is answered `200` with `MODEL_INVALID` and the
  reason; a malformed body is `422`; a body over 16 MB is `413`.
- **Pre-assignments never appear in the request.** Their effect is already in `required` and in the
  pruned `options`; a class activity with extra places appears like any other item, with those places
  as `max`, so the contract stays the same whether or not a campaign has fixed classes.
- **`fixed` carries the first pass into the second** (D-20): assignments the solver must keep, which
  consume capacity and count toward minimums. The first pass sends an empty list; in the second a
  first-window student's options are exactly the fixed pairs, and an item the first pass cancelled is
  not in the request. Fallback options (D-06) are ordinary `options` with a high `cost`; the solver
  does not know the difference.

## 7. WPF

- **Plan:** the student picks subjects for each of the three years in one go (D-09). Alternatives are
  ranked if the school wants a fallback for subjects that do not run.
- **Rules:** a declarative, versioned `RuleSetVersion` per curriculum profile and cohort, evaluated in
  school-core:
  - allowed subjects per year;
  - periods per year;
  - required total periods over the years;
  - duration and continuation (e.g. a two-year subject in consecutive years);
  - prerequisites;
  - exclusions.

  No hours are hard-coded. Every rule has positive and negative fixture cases.
- **Matura information:** computed separately from validity. It is shown as information and never
  blocks an otherwise valid plan.
- **Groups:** if subjects need group capacities, a WPF allocation model uses the same solver service
  with its own contract version. This is optional (W3).
- **Exceptions** (repeaters, late joiners, later changes): D-19.

## 8. API surface (sketch)

Executable request and JSON response contracts live in `packages/api-contracts/src`, with
shared endpoint descriptors binding methods and URLs to their input and output types. Domain
vocabulary belongs to `school-core`; unchanged domain schemas are checked against its types. Route adapters are split
by campaign administration, catalogue, item review, roster imports, choices and reports.
The refactoring into services and DAOs preserves the URLs, HTTP statuses and payload fields
listed here. `apps/api/test/fixtures/routes.json` records the request-schema inventory; regenerate
it deliberately with `npm run contracts:update:routes` and review the diff.

| Method and path | Role | Purpose |
| --------------- | ---- | ------- |
| `GET /api/auth/login`, `GET /api/auth/callback`, `POST /api/auth/logout` | — | Entra sign-in |
| `GET /api/auth/me` | any | Account, roles, and the bound person with kind, class and grade (null until bound) |
| `GET /api/campaigns` · `GET /api/campaigns/:id` · `GET …/:id/items` | any | Campaigns visible to me (organizers all, teachers also those taking proposals, everyone else from publication on); the items as far as the role allows |
| `GET /api/campaigns/:id/catalogue` | any | Published catalogue: approved items, numbered, in print order (eligibility flags for students come with the choice window) |
| `GET /api/campaigns/:id/classes` · `GET …/:id/teachers?q=` | teacher, organizer | The roster's classes and teachers, for the proposal form |
| `GET /api/campaigns/:id/my-choice` · `PUT …/my-choice` | student | Fixed items, the offered items by project day and time group, the ranked wishes per group, completeness (whole-list replace); until `late_until` |
| `GET /api/campaigns/:id/my-result` | student | The published places with the explanation (the items per day with the wish number, the minutes against the requirement, what is missing, the window the list came in, the seed), the fee, the swap window's dates and, while it is open, every item the student could move into with its free places, what the move would leave and why it would be refused (D-13); the student's own changes since publication; 409 `not_published` before publication |
| `POST /api/campaigns/:id/swap` | student | Move into an item with free places during the swap window (§3 rule 7); answers with the result as it is afterwards; 409 `swap_closed`, `item_full`, `already_placed`, 422 with the rule's code otherwise |
| `GET /api/campaigns/:id/demand` | teacher, organizer | Places needed per project day and grade: students of the grade minus those in fixed items, against the places offered (D-13); the page adds the target, the need plus the campaign's headroom (school-core `placeTarget`). Per rule and grade (`rules`): what the students still need after their class activities, against the most the category's places could bring (school-core `ruleDemand`, an upper bound) |
| `GET /api/my-availability` · `PUT /api/my-availability/:date` | teacher | The teacher's own status on the project days of every campaign taking proposals, with those campaigns; set one of them (`{ status }`; 409 `campaign_state` on any other day) |
| `GET /api/campaigns/:id/availability` | teacher, organizer | Who is not plainly available on which of the campaign's days, for the proposal form's warnings |
| `GET /api/admin/campaigns/:id/planning` · `PUT …/availability/:personId/:date` · `GET …/export/planning.xlsx` | organizer (set), auditor (read) | Per teacher (the roster's and every one a counted activity names, by the campaign's roster, else the current one) and project day: the status and the activities they lead and accompany, those that may still take place (school-core `mayTakePlace`: approved and not cancelled by the published run, proposed until the window opens, a draft while proposals are taken); set anyone's status on a project day until the archive (audited; the same status again records nothing; 422 `teacher_unknown`); the overview as a workbook |
| `GET /api/campaigns/:id/classes/:class/status` · `POST …/classes/:class/place` | class teacher (own class), organizer | The class's students with the state of their list, and after publication each one's places, the minutes and rules they miss and, for one short of either, the items with free places that fit the gap or bring the rule closer; place such a student into one of them (reason required, audited, the student notified); 409 `fully_placed` for a student with every day covered and every rule met |
| `POST /api/campaigns/:id/items` · `PATCH /api/items/:id` · `DELETE /api/items/:id` · `POST …/propose` · `POST …/unpropose` | teacher (own), organizer | Draft, edit, remove, propose and take back an activity with its teachers, sessions, places, fixed classes, eligibility and categories (`categories` left out keeps the ones it has; 422 `category_unknown`); a 422 names the rules broken. From publication on, an approved item's times, places, minimum, fee, eligibility and categories are fixed (409 `campaign_state`); its words may still change |
| `GET /api/categories` | any | The school's categories by name |
| `GET /api/admin/categories` · `POST …` · `PATCH …/:id` · `DELETE …/:id` | organizer, admin | The categories with how many items and rules name each; add (`{ name }`, trimmed; 409 `category_exists`, `too_many_categories`), rename (the same name records nothing) and remove (409 `category_in_use`); each answers with the list, audited in the school scope |
| `POST /api/admin/items/:id/approve` · `POST …/return` · `POST …/withdraw` | organizer | Review, audited: approve, return to draft with a note, withdraw with a reason |
| `POST /api/admin/campaigns` · `PATCH …/:id` · `POST …/:id/transition` | organizer | Campaign set-up (name, school year, project days, the window's settings and the rules, `rules` replacing the list as a whole until the window opens; 422 `rules_invalid` with `problems: [{ code, rule? }]`) and lifecycle; this release moves to `catalogue` and `published`, which numbers the approved items |
| `GET /api/admin/campaigns/:id/export/catalogue.xlsx` | organizer, auditor | The catalogue as a workbook: activities and sessions |
| `GET /api/admin/roster` · `PUT /api/admin/roster/groups` | admin | The roster in force, recent batches; label Entra groups (students/teachers, class, grade) |
| `GET /api/admin/roster/graph/start` · `GET …/graph/callback` | admin | Refresh from the labelled groups with the administrator's own Graph token (authorization-code flow, second redirect URI) |
| `GET /api/admin/roster/graph/groups?q=` | admin | The tenant's groups by name, for the picker (D-23; `Group.Read.All` delegated, same token flow); `?classes=true` every group whose name is a class ("5A"), the whole school in one search |
| `GET /api/admin/settings/periods` · `PUT …/periods` | admin | The school's period grid (D-25) |
| `GET /api/settings/language` · `PUT /api/admin/settings/language` | any (read), admin (set) | The school's language, `{ locale }`; a change is audited as `settings.language-changed` with `{ from, to }`, setting the language it has records nothing |
| `GET /api/admin/mail-templates` · `PUT …/:kind` · `DELETE …/:kind` · `POST …/:kind/test` · `GET /api/admin/mail/status` · `PUT /api/admin/mail/paused` | organizer | The notices' texts, every kind with `custom` (saved by the school or the default) and the `locale` a saved text was written in; a save is checked against the kind's placeholders and stored in the school's language (audited as `mail.template-changed`); the reset removes the school's text so the default applies again (audited as `mail.template-reset`; a kind without one is left as it is); a test mail with the sample values of the school's language to the caller's own address through the real outbox; whether mail is set up, the pace, whether sending is paused, what waits by priority and when the last goes out; pausing or resuming sending (audited as `mail.paused` / `mail.resumed`) |
| `GET /api/admin/campaigns/:id/missing` · `GET …/export/missing.xlsx` · `GET …/mail` | organizer, auditor | Every student with the state of their list and the notices sent to them; the campaign's outbox as a protocol (subjects and texts left out) |
| `GET /api/admin/retention` · `POST /api/admin/purge` | admin (auditor reads) | The school years with their campaigns, roster batches and class-teacher rows, when each year's retention ends and whether it has; the purge of one (`{ schoolYear, reason }`): a year after its end (409 `retention_not_reached`), every campaign of it archived (409 `campaign_state`), nothing automatic. Removes the year's campaigns with everything under them (items, placements, choices, runs, assignments and changes, attendance, notices, the campaigns' audit chains), its roster batches (unless a campaign of another year goes by one) and class-teacher rows, the teachers' availability on its dates (September to August), then every person and account nobody names any more; the school's audit chain stays and records the purge with the counts |
| `POST /api/admin/roster/csv` · `GET /api/admin/roster/csv/template` | admin | CSV upload (JSON body with the file's text), the template |
| `GET /api/admin/roster/batches/:id` · `POST …/commit` · `POST …/discard` | admin | A batch with its diff, problems and warnings; the decision |
| `GET /api/admin/roster/persons?q=` | admin | Persons of the roster in force, with their bound account |
| `GET /api/admin/classes` · `PUT /api/admin/classes/:class/teachers` | admin, organizer | The roster's classes with their class teachers (assigned here, or named by the CSV roster's address column); set the ones assigned here, audited (D-17) |
| `GET /api/admin/users?q=&unbound=` · `POST /api/admin/users/:id/block` · `POST …/unblock` | admin | Accounts with person, roles and block state; the administrator's queue is `unbound=true`; block and unblock with a reason |
| `POST /api/admin/bindings` | admin | Bind an account to a person (reason required); closes the previous bindings of both |
| `GET /api/admin/roles` · `POST /api/admin/roles` · `POST /api/admin/roles/:id/revoke` | admin | School-wide grants (reason required); an administrator cannot revoke their own |
| `PUT /api/admin/campaigns/:id/choices/:personId` | organizer | On-behalf entry (reason required) |
| `POST /api/admin/campaigns/:id/preassignments/:personId/:itemId/exempt` | organizer | Exempt a student from a fixed class activity (reason required) |
| `GET /api/admin/solver` | organizer, auditor | Whether a solver is configured and answers, and which OR-Tools it runs |
| `POST /api/admin/campaigns/:id/runs` · `GET …/runs` · `GET …/runs/:runId` · `GET …/runs/:runId/export.xlsx` | organizer (start), auditor (read) | Start a run on a closed campaign (seed and limit optional; 202, the job finishes it), the runs with their status and levels, the review of one (levels per pass, every student's places and missing minutes, the items' counts, the cancelled items, whether the campaign changed since), and the review as a workbook |
| `POST …/runs/:runId/publish` | organizer | Publish a succeeded run of a campaign in review that is not stale, the cancelled items named as the review showed them (a different list is refused); the campaign to `results`, the notices queued once per run: every student their programme, every class teacher their students short of minutes, every teacher of a cancelled item the cancellation |
| `GET /api/admin/campaigns/:id/export/assignments.xlsx` | organizer, auditor | The published run as a workbook: the students with their places per day and the fee, the participants per item, the items, the missing minutes |
| `POST /api/admin/campaigns/:id/assignments` · `GET …/assignments` | organizer (change), auditor (read) | A change by hand: into an item (`itemId`), out of one (`removeItemId`) or both, reason required, `force` overriding a full item, a minimum or a rule falling short (recorded); the same rules as a swap otherwise, audited, the student notified. The log of every change since publication with names and reasons |
| `GET /api/campaigns/:id/items/:itemId/participants` | teacher (own, after results), organizer, auditor | The participants of an item in the published run, with class and how they got there; whether the item was cancelled |
| `GET /api/campaigns/:id/classes/:class/attendance` · `GET …/attendance.xlsx` | class teacher (own class), organizer, auditor | The class's attendance per project day and session, with what was recorded, and whether the caller may record now; the same as a workbook |
| `PUT /api/sessions/:id/attendance` | class teacher (own class's students), organizer; admin for WPF | Record or correct the session's attendance for the students named (`{ entries: [{ personId, status, note? }] }`); 422 `not_assigned` for a student the session's item does not have, 409 `campaign_state` outside `results` |
| `GET /api/admin/campaigns/:id/export/{choices,assignments,participants,missing,attendance}.xlsx` | organizer, auditor | Exports |
| `/wahlen/:id/katalog` (page) | any | Printable catalogue: the web app's page with print styles → PDF via the browser; filterable by project day; names the teachers only when the campaign says so (D-13) |
| `GET /api/admin/audit` | admin, auditor | The school scope's audit log (campaign scopes and export later) |
| `GET /api/health` | — | Includes `busy` for the update gate |

Reads are authorized per request: IDOR on reads is in scope. Status codes follow school-election: 401
for no session, 403 for the wrong role, 404 for out of scope, and 409 for a lifecycle refusal with its
code.
