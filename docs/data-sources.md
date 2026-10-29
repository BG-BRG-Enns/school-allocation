# SchulWahl — Data sources

Status: proposal · 2026-10-27 · Repo-ready: names no school-specific system.

## 1. Source of truth per attribute

| Attribute | Source | Notes |
| --------- | ------ | ----- |
| Login identity | Entra ID `(tid, oid)` | See `identity-and-roles.md` |
| Who takes part, class, grade (Schulstufe), kind | **Roster import**: Entra class groups via Microsoft Graph, or a CSV upload | Frozen in append-only batches; the campaign uses one batch |
| Display name | Roster (Graph `displayName`, or CSV columns) | — |
| Notification address | Roster (Graph `mail`, falling back to `userPrincipalName` if it is routable; or the CSV e-mail column) | A missing address is reported to the organizer |
| School year | Set by the administrator in the app | Explicit rollover; groups are re-imported per school year |
| Class teacher (KV) per class | Assigned in the app, or a CSV column | Needed for project-week attendance |
| Project-week catalogue: activities (choosable, or fixed for whole classes), sessions, credited minutes, capacity, fees | **SchulWahl** (teachers propose, organizer approves) | The printable catalogue is generated from it |
| WPF catalogue: subjects, years, weekly periods, rules | **SchulWahl** (admin; rule versions approved by school leadership) | Printable catalogue generated |
| WPF plan per student (all years at once) | **SchulWahl** | No history import; recorded from the first campaign onward |
| Participation and attendance | **SchulWahl** (KV for project week, admin for WPF) | Separate from assignments |
| Fees | **SchulWahl** (per item) | Informational; whoever is assigned pays (D-07); exported per student for accounting |
| Curriculum profile | Admin maps classes or groups to a profile | SchulWahl does not read school-type codes from anywhere |
| Timezone | `Europe/Vienna` | Fixed |

The school's administration system is **not** a source. SchulWahl stores no school ID number, birth
date, address, insurance number or any other field from it.

## 2. Minimal roster record

| Field | Why |
| ----- | --- |
| `oid` (Graph source only) | Pre-provisioned identity |
| `upn` and/or `mail` | CSV binding at first sign-in; notifications |
| `display_name` (or given + family name) | Lists for organizers and teachers |
| `class` | Eligibility, class-teacher scope, lists |
| `grade` (Schulstufe) | Eligibility, daily minimum per grade |
| `kind` (student / teacher) | From which group set or CSV the row came |
| `school_year` | Batch consistency |

Nothing else is imported, even if Graph returns more.

## 3. Roster import

### A. Entra groups via Microsoft Graph

1. The administrator picks the groups from a search over the tenant's groups by name (D-23;
   `Group.Read.All`, delegated: the administrator authorizes a token for it at Microsoft, which the
   server keeps in memory for the token's lifetime and never stores or logs), or enters their IDs by
   hand, and labels each group: **students** or **teachers**, and for student groups the class name
   and grade. The list is replaced as a whole and audited.
2. "Refresh roster" sends the administrator to Microsoft to consent to the Graph permissions for this
   one refresh; the callback reads the members of each labelled group with that token, writes one
   `ImportBatch` with a diff against the roster in force, and forgets the token. The members are
   read transitively, so a class group made of nested groups (3A of 3AR and 3AG) yields their
   students; only users count (the nested groups themselves and devices are skipped), and only `id`,
   `displayName`, `mail` and `userPrincipalName` are read. A member without an address is a warning
   on the batch.
3. Two permission models (D-22, least privilege by default):
   - **Delegated** (default, implemented): the refresh runs with the administrator's own Graph token,
     obtained during the refresh action, which the ID token of that authorization must attribute to
     the signed-in administrator. Attributable, and the app holds no standing directory permission.
     Automatic refresh at window opening is not possible; the organizer refreshes before opening. The
     permissions asked for are the deployment's `GRAPH_DELEGATED_SCOPES`, `GroupMember.Read.All`,
     `User.ReadBasic.All` and `Group.Read.All` (the picker) unless set.
   - **Application** (`GroupMember.Read.All`), opt-in, not implemented yet: the app may refresh on its
     own, e.g. when a window opens. Needs admin consent.

   Verified on a tenant (2026-10-29): with `GroupMember.Read.All` alone the member listing carries
   ids only, no names and no addresses, so `User.ReadBasic.All` is part of the default.
4. The `groups` claim in the ID token is **not** used: it only describes the signing-in user, so it
   cannot answer who has *not* chosen yet, and it overflows for users in many groups.

### B. CSV upload

Columns: `email` (or `upn`), `given_name`, `family_name`, `class`, `grade`, `kind`, optionally
`class_teacher_email`; `kind` is `student` or `teacher`, in English or German. Comma or semicolon
separated, as a spreadsheet saves it, with a downloadable template. The upload is parsed in the
browser-independent core (so the same files are refused everywhere), stored as a pending
`ImportBatch` with its diff, and committed by the administrator. Binding to the login happens at the
first sign-in (`identity-and-roles.md` §4). The `class_teacher_email` column is kept on the entry;
class-teacher assignment itself comes with attendance (S5).

### Common rules

- Batches are **append-only** and carry: source, time, payload hash, row count, who triggered it,
  school year, diff summary, problems, warnings. A batch is **pending** until an administrator
  **commits** it (it is the roster in force from then on) or **discards** it; a batch whose rows do
  not form a roster is stored as **rejected**, with the problems, and can be neither.
- A pending batch's diff was taken against the roster in force at that moment; once another batch
  is committed, the pending one is stale and its commit is refused.
- **Allocation always runs against one frozen batch.** Eligibility must not change under a running
  allocation.
- A batch with the same `oid`/e-mail twice, a person in both the student and teacher set, one
  address on two entries, or nobody in it at all is **rejected whole**.
- Across batches, the same key is the same person; when the source changes and the key with it
  (CSV to Graph, or back), an address only one previous entry carries identifies the person. When a
  batch is committed, each entry is resolved to a person: the one bound to the member's object id,
  the previous batch's entry with the same key or address, or a new one. A new person from Graph is
  bound to their identity at once.

## 4. Conflicts and outages

| Situation | Rule |
| --------- | ---- |
| Roster entry without a sign-in yet | Shown as "not signed in"; receives the automatic e-mails; an organizer may enter choices on their behalf (audited) |
| Sign-in without a roster match | No campaign access; listed for admin review; never matched by name |
| Member in two class groups | Rejected batch, or the admin resolves the group labels first |
| Person disappears between batches | Marked as left; choices and assignments kept and flagged |
| Class changes between batches | Eligibility re-evaluated; affected choices flagged |
| Graph unreachable | The last batch stays in force; its age is shown; no widening of eligibility |
| Wrong import | A new batch supersedes it; history kept |

## 5. WPF: no history needed

Students choose their electives for all three years at once (D-09). Validation checks the submitted
plan against the cohort's curriculum profile and rule version. SchulWahl records each plan and the
participation from the first campaign onward. Exceptions (repeaters, late joiners, later changes,
cancelled subjects) are D-19.
