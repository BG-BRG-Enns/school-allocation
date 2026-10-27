# SchulWahl — Identity and roles

Status: proposal · 2026-10-27 · Repo-ready: names no school-specific system.

## 1. The one assumption

Every student and every teacher has a **Microsoft Entra ID account in the school's tenant**, and the
school maintains **Entra groups for its classes**. SchulWahl relies on nothing else. There is no local
password, no other identity provider, and no connection to a school administration system.

## 2. Sign-in

- OIDC authorization-code flow, single tenant, confidential client.
- `state` and `nonce` are checked; the ID token's `tid` must equal the configured tenant; `oid` must
  be a GUID. Scopes: `openid profile email`. The access token is not used or kept.
- The session is a sealed cookie with an 8-hour absolute lifetime. The person's status (roster
  membership, roles, blocked) is re-read from the database on every request, so a disabled or
  removed person loses access at once, even though Entra is not asked again until the next sign-in.
- No app roles are required in Entra. Optionally the school sets "assignment required" on the app
  registration and assigns the student and teacher groups, as a second line of defence.

## 3. Person key

The durable key is **`(tid, oid)`**. Never `sub` (pairwise per app), never the e-mail address, never
the display name. A person's e-mail, UPN and name may change; the key does not.

## 4. From roster to person

The roster (who may take part, in which class) is imported into frozen batches; see
`data-sources.md`. Two sources, same result:

| Source | How the login is linked | Notes |
| ------ | ----------------------- | ----- |
| **Entra groups** (Microsoft Graph) | The import already carries each member's `id`, which is the `oid`. The person is **pre-provisioned**; the first sign-in finds them by `(tid, oid)` | No matching step at all |
| **CSV upload** | The CSV carries the school e-mail or UPN. At the first verified sign-in, an exact, case-insensitive match on the token's `preferred_username` or `email` binds `(tid, oid)` **once** | After binding, the key is `(tid, oid)`; a later e-mail change does not matter |

Rules for both:

- No fuzzy or name-based matching, ever.
- A sign-in without a roster match lands in a "not assigned" state and appears in an administrator's
  queue. The administrator can bind it to a roster entry, audited.
- A roster entry whose person changed accounts (new `oid`) is re-attached by an administrator,
  audited. The old binding is closed, not deleted.
- The school ID number of the administration system is **not stored**. SchulWahl does not need it.

## 5. Kind and roles

| Layer | Source | Meaning |
| ----- | ------ | ------- |
| **Kind** (`student` / `teacher`) | The roster: the administrator marks each imported group (or CSV) as students or teachers | A person in both sets is refused with an error, never silently resolved |
| **Eligibility** | The campaign's rule (`all`, or `class prefix` such as `5` for WPF) applied to the frozen roster batch | Decides who may choose in a campaign and which items they may see |
| **Privileged roles** `campaign_organizer`, `school_admin`, `read_only_auditor` | Granted in the app by a `school_admin`, audited, optionally scoped to a campaign | Never derived from Entra |
| **Bootstrap** | Configuration lists the UPNs or `oid`s of the first administrators | Applied at their first sign-in |
| **Class teacher (KV)** | Assigned per class in the app by an organizer or admin, or taken from a CSV column | Needed for attendance |

### Rights matrix

`S` student, `T` teacher, `KV` class teacher of that class, `O` organizer, `A` school admin, `R`
read-only auditor. "own" = own activity or own record.

| Action | S | T | KV | O | A | R |
| ------ | - | - | -- | - | - | - |
| See open campaign and eligible items | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Submit or change own ranked choices while the window is open | ✓ | – | – | – | – | – |
| Propose an activity | – | ✓ | ✓ | ✓ | ✓ | – |
| Edit an activity before publication | – | own | own | ✓ | ✓ | – |
| Approve or publish the catalogue; open and close a campaign | – | – | – | ✓ | ✓ | – |
| Change an activity after the window opened (audited, affected students notified) | – | – | – | ✓ | ✓ | – |
| Enter choices on behalf of a student (audited, reason required) | – | – | – | ✓ | ✓ | – |
| Exempt a student from a fixed class activity (audited, reason required) | – | – | – | ✓ | ✓ | – |
| Run allocation, review, publish | – | – | – | ✓ | ✓ | – |
| Manual reassignment after publication (audited) | – | – | – | ✓ | ✓ | – |
| See the participant list of an activity (after publication) | – | own | own class | ✓ | ✓ | ✓ |
| See individual rankings | – | – | – | ✓ | ✓ | ✓ |
| See fees per participant (for accounting) | – | own | – | ✓ | ✓ | ✓ |
| Record project-week attendance | – | – | own class | ✓ | ✓ | – |
| Record WPF participation and attendance | – | – | – | – | ✓ | – |
| Import roster; correct bindings and classes; assign class teachers | – | – | – | – | ✓ | – |
| Grant privileged roles | – | – | – | – | ✓ | – |
| Approve WPF rule versions | – | – | – | – | ✓ | – |
| Read and export the audit log | – | – | – | own campaign | ✓ | ✓ |

Reads are authorized per request. Status codes: 401 no session, 403 wrong role, 404 out of scope,
409 lifecycle refusal with its code.

## 6. Lifecycle

| Event | Effect |
| ----- | ------ |
| New student (appears in a newer batch) | Eligible from that batch; pre-provisioned (Graph) or bound at first sign-in (CSV) |
| Class change between batches | Eligibility re-evaluated; existing choices flagged for organizer review, not deleted |
| Student leaves (missing from the newest batch) | Loses eligibility on the next request; choices and assignments kept and marked as withdrawn |
| Account disabled in Entra | No new sign-in; the existing session ends at the latest after 8 h, and earlier if an admin blocks the person |
| Name, e-mail or UPN change | No effect: the key is `(tid, oid)` |
| New `oid` for the same person (account recreated) | Admin re-attaches the roster entry, audited |

**Fail closed:** if Graph is unreachable, the last batch stays in force and its age is shown. If Entra
is unreachable, nobody signs in; organizers may extend the window (audited). There is no bypass.

## 7. Entra setup a school needs

1. One app registration: single tenant, one redirect URI, a client secret or certificate, scopes
   `openid profile email`.
2. For roster import from groups: Microsoft Graph permission to read the chosen groups' members (see
   `data-sources.md` §3 for the delegated vs application choice). CSV-only schools need no Graph
   permission.
3. Nothing else: no mail permissions, no directory write, no app roles.
