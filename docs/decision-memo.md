# SchulWahl — Decision memo

2026-10-27 · Summary of the design package. Details are in the other files in `docs/`.

## What SchulWahl assumes about a school

Only this: every student and teacher has an Entra ID account in the school's tenant, and the school
keeps Entra groups for its classes. Nothing else is integrated. No school administration system, no
school database, no school-specific interface.

## Authentication and roster

- **Sign-in:** Entra OIDC through SchulWahl's own app registration; person key `(tid, oid)`; no app
  roles required.
- **Roster:** imported into frozen batches from Entra class groups (Microsoft Graph, pre-provisions
  the `oid`, with the administrator's own delegated token by default) or from a CSV upload (bound once
  by exact e-mail/UPN at first sign-in). The administrator labels groups as students or teachers with
  class and grade. No school ID number is stored.
- **Owned by SchulWahl:** both catalogues, choices, pre-assignments, allocations, WPF plans,
  attendance, class-teacher assignments.

## Mechanism

Ranked choices with free combinations of fixed-time activities. A teacher may also fix an activity for
whole classes (a class trip): those students are pre-assigned, nobody else can choose it, and they
rank only the remaining time. Fees are shown, not consented to; whoever is assigned pays. After the
window closes, an OR-Tools CP-SAT run allocates with a lexicographic "protect the worst-off first"
objective; the run stores its input, seed, settings and result, and every explanation reads from that
record. The TypeScript core re-validates the result before publication. All students take part in project week. WPF is
chosen in the 9th grade for all three years at once and validated by versioned rules; no history
import; exceptions are handled outside the software.

## Notifications

A transactional outbox over the school's SMTP; non-submitters are notified at the
close.

## Deployment

Quadlet stack (app, Postgres, solver), signed images, nightly auto-update always, own
host or sub-path. Operations are the operator's business.

## Deliberate differences from school-election

Identified records instead of anonymous ballots;
roster-derived kind instead of app roles; `busy` only during jobs; a required solver service.

## Still to decide before the MVP

D-06, D-08, D-13, D-15, D-20, D-23 (see `open-decisions.md`). None of them blocks S0–S2; D-06 and
D-08 are needed before S4.

## Smallest next step

S0 + S1 — the repo skeleton from school-election, Entra sign-in against a fake
Entra, group labelling, Graph and CSV import into a batch with a diff, pre-provisioning and e-mail
binding with the unmatched queue, an audit entry for each. The S4 model compiler and validator in
school-core can start in parallel on synthetic data, since they have no I/O.
