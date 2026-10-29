// The choice window in the database (docs/domain-and-api.md §3, D-05,
// D-06, D-24): the pre-assignments materialized when it opens, what a
// student is offered and has ranked, the saving of a ranking with its
// revision, an organizer's exemption or entry on behalf, and the list of
// who has not chosen. The rules are school-core's; this module hands them
// the stored rows.

import { acceptsChoices, checkRanking, isComplete, offeredTo, timeGroupsOf, wishesRequired, type Ranking } from '@school-allocation/school-core'
import { type Caller } from '../lib/actor.ts'
import { appendAudit, lockScope } from '../lib/audit.ts'
import * as store from '../lib/dao/choices.ts'
import { campaignStudent, campaignStudents, fixedItemIds } from '../lib/dao/choices.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError, ChoiceInvalid } from '../lib/errors.ts'
import { mailStatesByPerson } from '../lib/mail/outbox.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { CampaignStudent, ChoiceState, ChoiceView, SaveBy, StudentChoiceState } from '../lib/models/choices.ts'
import type { Item } from '../lib/models/items.ts'
import { instantOf } from '../lib/time.ts'
import { catalogueItems } from './items.ts'
import { reconcilePreAssignments } from './pre-assignments.ts'

export { campaignStudent, campaignStudents, rosterBatchClause } from '../lib/dao/choices.ts'
export { ChoiceInvalid } from '../lib/errors.ts'
export type { CampaignStudent, ChoiceState, ChoiceView, GroupView, SaveBy, StudentChoiceState } from '../lib/models/choices.ts'

/** Places every student of a class an approved item is fixed for into it (D-24), from the roster in force; called when the window opens. */
export async function materializePreAssignments(client: Queryable, campaign: Pick<Campaign, 'id'>): Promise<number> {
  return (await reconcilePreAssignments(client, campaign.id)).placed
}

/** A session as school-core spans it: epoch milliseconds. */
function spansOf(item: Item): { startMs: number, endMs: number }[] {
  return item.sessions.map((s) => ({ startMs: instantOf(s.startsAt) ?? 0, endMs: instantOf(s.endsAt) ?? 0 }))
}

/** What a student sees and may rank, with what they have ranked. */
export async function choiceView(db: Queryable, campaign: Campaign, student: CampaignStudent): Promise<ChoiceView> {
  const items = await catalogueItems(db, campaign.id)
  const fixedIds = await fixedItemIds(db, campaign.id, student.personId)
  const fixed = items.filter((item) => fixedIds.has(item.id))
  const fixedSpans = fixed.flatMap(spansOf)
  const offerable = items.filter((item) => !fixedIds.has(item.id)).map((item) => ({ id: item.id, sessions: spansOf(item), rules: item }))
  const offered = offeredTo({ className: student.className, grade: student.grade }, offerable, fixedSpans)
  const byId = new Map(items.map((item) => [item.id, item]))
  const groups = timeGroupsOf(offered).map((group) => ({
    ...group,
    startsAt: new Date(group.startMs).toISOString(),
    endsAt: new Date(group.endMs).toISOString(),
    items: group.itemIds.map((id) => byId.get(id)).filter((item): item is Item => item !== undefined),
    required: wishesRequired(group, campaign.wishesPerGroup),
  }))
  const { rows: [saved] } = await store.findChoice(db, campaign, student)
  // Only what is offered now counts: a group or item the catalogue lost since the save is pruned from the
  // view (the revisions keep it), so a save never fails on a key the student cannot see.
  const ranking: Ranking = {}
  for (const group of groups) {
    const ids = (saved?.ranking[group.key] ?? []).filter((id) => group.itemIds.includes(id))
    if (ids.length > 0) ranking[group.key] = ids
  }
  return {
    fixed,
    groups,
    ranking,
    window: saved?.saved_in ?? null,
    version: saved?.version ?? 0,
    cap: campaign.wishesPerGroup,
    complete: isComplete(ranking, groups, campaign.wishesPerGroup),
    acceptsChoices: acceptsChoices(campaign.state),
    student: { personId: student.personId, displayName: student.displayName, className: student.className, grade: student.grade },
  }
}

/**
 * Replaces a student's ranking, under the campaign's lock: only while the
 * window takes choices, only items the student is offered, at most the
 * cap per group. A list saved after the close is late (D-06). Every save
 * writes a revision; an organizer's save on behalf is audited as well.
 * The student, the campaign's window and the clock are all read under the
 * lock: a roster committed or a deadline passed while the request waited
 * counts, not the request's earlier picture of them.
 */
export async function saveRanking(db: Database, campaign: Campaign, personId: string, ranking: Ranking, by: SaveBy): Promise<ChoiceView> {
  let student: CampaignStudent | undefined
  await db.tx(async (client) => {
    await lockScope(client, campaign.id)
    const now = new Date()
    const { rows: [current] } = await store.lockChoiceWindow(client, campaign)
    if (!current || !acceptsChoices(current.state)) throw new ApplicationError('campaign_state')
    // The clock under the lock, not the last tick: after the window's end nothing is taken, whatever the state still says.
    const end = current.late_until ?? current.closes_at
    if (end !== null && now.getTime() > end.getTime()) throw new ApplicationError('campaign_state')
    student = await campaignStudent(client, { rosterBatchId: current.roster_batch_id }, personId)
    if (!student) throw new ApplicationError('not_a_student')
    const view = await choiceView(client, { ...campaign, state: current.state }, student)
    const problems = checkRanking(ranking, view.groups, campaign.wishesPerGroup)
    if (problems.length > 0) throw new ChoiceInvalid(problems)
    // In order, each group once, so the stored object is canonical.
    const canonical: Ranking = {}
    for (const group of view.groups) {
      const ids = ranking[group.key]
      if (ids !== undefined && ids.length > 0) canonical[group.key] = [...ids]
    }
    // Late in the grace week, or after the close before the clock moved the state: the save is late either way.
    const window = current.state === 'grace' || (current.closes_at !== null && now.getTime() > current.closes_at.getTime()) ? 'late' : 'first'
    const { rows: [row] } = await store.upsertRanking(client, campaign, student, canonical, window, by)
    await store.insertRevision(client, campaign, student, row, canonical, window, by)
    if (by.reason !== undefined) {
      await appendAudit(client, {
        scopeId: campaign.id,
        actor: { tid: by.caller.tid, oid: by.caller.oid, name: by.caller.displayName },
        action: 'choice.entered-on-behalf',
        metadata: { personId: student.personId, version: row?.version ?? 1, window, reason: by.reason },
      })
    }
  })
  return choiceView(db, campaign, student as CampaignStudent)
}

/**
 * An organizer exempts a student from a class activity, with a reason,
 * audited; false when there is no such pre-assignment. Only while the
 * window takes choices, read under the lock: after the close the
 * placements are the allocation's frozen input (a placement by hand is
 * S4's).
 */
export async function exemptPreAssignment(db: Database, campaign: Campaign, personId: string, itemId: string, reason: string, caller: Caller): Promise<boolean> {
  return db.tx(async (client) => {
    await lockScope(client, campaign.id)
    const { rows: [current] } = await store.lockExemptionWindow(client, campaign)
    if (!current || !acceptsChoices(current.state)) throw new ApplicationError('campaign_state')
    const { rows: [row] } = await store.lockPreAssignment(client, campaign, personId, itemId)
    if (!row) return false
    if (row.exempted_at !== null) throw new ApplicationError('already_exempted')
    await store.exemptPreAssignment(client, campaign, personId, itemId, caller, reason)
    await appendAudit(client, {
      scopeId: campaign.id,
      actor: { tid: caller.tid, oid: caller.oid, name: caller.displayName },
      action: 'preassignment.exempted',
      metadata: { personId, itemId, reason },
    })
    return true
  })
}

/**
 * Every student of the campaign's roster with the state of their list:
 * none, incomplete or complete, judged against what they are offered now.
 * The organizer's non-submitter list, the class teacher's page and the
 * reminders all read this.
 */
export async function choiceStates(db: Queryable, campaign: Campaign, className?: string): Promise<StudentChoiceState[]> {
  const students = await campaignStudents(db, campaign, className)
  const { rows } = await store.listChoices(db, campaign)
  const saved = new Map(rows.map((row) => [row.person_id, row]))
  const result: StudentChoiceState[] = []
  for (const student of students) {
    // Each student's groups depend on their class and fixed items; computed per student, which a school's roster allows.
    const view = await choiceView(db, campaign, student)
    const choice = saved.get(student.personId)
    // Nothing to rank (every day taken by class activities) is complete without a row.
    const state: ChoiceState = view.groups.length === 0 || (choice !== undefined && view.complete) ? 'complete' : (choice === undefined ? 'none' : 'incomplete')
    result.push({ ...student, state, window: choice?.saved_in ?? null, updatedAt: choice?.updated_at.toISOString() ?? null })
  }
  return result
}

/** The caller must belong to this campaign's roster to rank for themselves. */
export async function callerStudent(db: Queryable, campaign: Campaign, caller: Caller): Promise<CampaignStudent> {
  const student = caller.person === null ? undefined : await campaignStudent(db, campaign, caller.person.id)
  if (!student) throw new ApplicationError('not_a_student')
  return student
}

/** Resolve a student named by an organizer against the campaign's roster. */
export async function namedStudent(db: Queryable, campaign: Campaign, personId: string): Promise<CampaignStudent> {
  const student = await campaignStudent(db, campaign, personId.toLowerCase())
  if (!student) throw new ApplicationError('not_found')
  return student
}

/** Choice status with the delivery history used by both the screen and export. */
export async function missingStudents(db: Queryable, campaign: Campaign) {
  const [states, mails] = await Promise.all([choiceStates(db, campaign), mailStatesByPerson(db, campaign.id)])
  return states.map((student) => ({ ...student, mails: mails.get(student.personId) ?? [] }))
}
