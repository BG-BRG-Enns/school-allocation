// Changes after publication (docs/domain-and-api.md §3 rule 7, §4, §8;
// mvp-plan S5a): a student moves into an item with free places while the
// swap window is open, a class teacher places a student of their class who
// is short of minutes into a gap, an organizer changes a placement by hand
// with a reason. The rules are school-core's (allocation-change.ts) and are
// checked under the campaign's lock against the published run's current
// rows; a change supersedes rows and adds a row, tells the student, and is
// audited. Nothing here changes a run, a row or a change once written.

import { applyMove, checkMove, explainStudent, leavesForSwap, type Assignment, type Move, type MoveProblem } from '@school-allocation/school-core'
import type { AssignmentChange, ChangeKind } from '@school-allocation/api-contracts/publication'
import type { Messages } from '@school-allocation/messages'
import { actorOf, type Actor, type Caller } from '../lib/actor.ts'
import { appendAudit, lockScope } from '../lib/audit.ts'
import * as store from '../lib/dao/allocation.ts'
import { lockedCampaign } from '../lib/dao/campaigns.ts'
import { campaignStudent, campaignStudents } from '../lib/dao/choices.ts'
import { listCampaignItems } from '../lib/dao/items.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { schoolWords } from '../lib/i18n.ts'
import { enqueueMail } from '../lib/mail/outbox.ts'
import type { StoredChange, StoredRun } from '../lib/models/allocation.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { CampaignStudent } from '../lib/models/choices.ts'
import type { Item } from '../lib/models/items.ts'
import type { WindowContext } from '../lib/models/window.ts'
import { isOrganizer } from '../lib/policies.ts'
import { readTemplate, renderTemplate } from './mail-templates.ts'
import { itemLabel, programmeWriter, swapWindowOpen, unavailableItems } from './publication.ts'
import { firstNameOf } from './window.ts'

/** The campaign locked with its published run and the rows as they stand; what every change starts from. */
interface Locked {
  campaign: Campaign
  run: StoredRun
  rows: Assignment[]
  /** Every item the campaign had, its fee the run's. */
  items: Map<string, Item>
  /** Items nobody enters now: cancelled by the run, withdrawn since. */
  unavailable: Set<string>
}

async function lock(client: Queryable, campaignId: string): Promise<Locked> {
  await lockScope(client, campaignId)
  const campaign = await lockedCampaign(client, campaignId)
  if (!campaign) throw new ApplicationError('not_found')
  if (campaign.state !== 'results') throw new ApplicationError('campaign_state')
  const run = await store.readPublishedRun(client, campaignId)
  if (!run) throw new ApplicationError('not_published')
  const rows = await store.listAssignments(client, run.id)
  const items = await listCampaignItems(client, campaignId)
  // The fee as the run froze it, as the result and the workbook show it: a fee changed since is not the student's.
  const frozenFee = new Map(run.snapshot.items.map((item) => [item.id, item.feeCents]))
  return { campaign, run, rows, items: new Map(items.map((item) => [item.id, { ...item, feeCents: frozenFee.get(item.id) ?? item.feeCents }])), unavailable: unavailableItems(run, items) }
}

/** The first problem, as the refusal's code; the item it names as the detail. */
function refuse(problems: MoveProblem[]): void {
  const [first] = problems
  if (first) throw new ApplicationError(first.code, first.itemId)
}

/** Writes the change and what it does to the rows; the caller checked the move under the lock. */
async function write(client: Queryable, locked: Locked, move: Move, kind: ChangeKind, reason: string | null, forced: boolean, actor: Actor): Promise<{ id: string, seq: number }> {
  const change = await store.insertChange(client, {
    runId: locked.run.id, kind, personId: move.personId, fromItemId: kind === 'move' || kind === 'remove' ? move.leaves[0] ?? null : null, toItemId: move.toItemId, reason, forced, changedBy: actor.id,
  })
  const superseded = await store.supersedeAssignments(client, locked.run.id, move.personId, move.leaves, change.id)
  // Under the campaign's lock the rows checked are the rows found; anything else is a defect, not a refusal.
  if (superseded !== move.leaves.length) throw new Error(`a change superseded ${superseded} rows where ${move.leaves.length} were checked`)
  if (move.toItemId !== null) await store.insertChangedAssignment(client, locked.run.id, move.personId, move.toItemId, kind === 'swap' ? 'swap' : 'manual', change.id)
  return change
}

/**
 * Tells the student, once per change, in the school's language as the
 * change's transaction reads it: their programme as it is now, and for a
 * change by hand who changed it (the class teacher or the organization) and
 * what changed.
 */
async function notify(client: Queryable, context: WindowContext, locked: Locked, student: CampaignStudent, move: Move, changeId: string, by: 'classTeacher' | 'organizer' | null): Promise<void> {
  if (student.address === null) return
  const words = await schoolWords(client)
  const kind = by === null ? 'swap_confirmed' : 'assignment_changed'
  const after = applyMove(locked.rows, move, by === null ? 'swap' : 'manual')
  const explanation = explainStudent(locked.run.snapshot, after, student.personId)
  const template = await readTemplate(client, kind, words.locale)
  const { subject, body } = renderTemplate(template, {
    first_name: firstNameOf(student.displayName), name: student.displayName, campaign: locked.campaign.name,
    link: `${context.baseUrl}/wahlen/${locked.campaign.id}/ergebnis`,
    programme: explanation ? programmeWriter(words).lines(explanation, locked.items).join('\n') || '–' : '–',
    ...(by === null ? {} : { changed_by: words.t.notices.changedBy[by], change: changeText(words.t, locked, move) }),
  })
  await enqueueMail(client, { kind, campaignId: locked.campaign.id, personId: student.personId, to: student.address, subject, body, dedupeKey: `${kind}:${locked.campaign.id}:${changeId}` })
}

/** What a change by hand did, in the student's notice: the item entered, the item left, or both. */
function changeText(t: Messages, locked: Locked, move: Move): string {
  const label = (id: string) => {
    const item = locked.items.get(id)
    return item ? itemLabel(item) : '?'
  }
  const left = move.leaves.map(label).join(', ')
  if (move.toItemId === null) return t.notices.change.left(left)
  return left === '' ? t.notices.change.entered(label(move.toItemId)) : t.notices.change.replaced(left, label(move.toItemId))
}

const auditActor = (actor: Actor) => ({ tid: actor.tid, oid: actor.oid, name: actor.name })

/**
 * The student's own move (rule 7): into an item with free places they may
 * enter, leaving what overlaps it, while the swap window is open; first come
 * first served under the campaign's lock.
 */
export async function swap(db: Database, context: WindowContext, campaign: Campaign, caller: Caller, itemId: string): Promise<void> {
  const personId = caller.person?.kind === 'student' ? caller.person.id : null
  if (personId === null) throw new ApplicationError('not_a_student')
  await db.tx(async (client) => {
    const locked = await lock(client, campaign.id)
    if (!swapWindowOpen(locked.campaign, db.now().getTime())) throw new ApplicationError('swap_closed')
    const student = await campaignStudent(client, locked.campaign, personId)
    if (!student) throw new ApplicationError('not_a_student')
    const toItemId = itemId.toLowerCase()
    const move: Move = { personId, toItemId, leaves: leavesForSwap(locked.run.snapshot, locked.rows, personId, toItemId) }
    refuse(checkMove(locked.run.snapshot, locked.rows, move, { unavailable: locked.unavailable }))
    const actor = actorOf(caller)
    const change = await write(client, locked, move, 'swap', null, false, actor)
    await notify(client, context, locked, student, move, change.id, null)
    await appendAudit(client, { scopeId: campaign.id, actor: auditActor(actor), action: 'assignment.swapped', metadata: { changeId: change.id, seq: change.seq, runId: locked.run.id, personId, toItemId, left: [...move.leaves] } })
  })
}

/**
 * A class teacher places a student of their class who is short of minutes
 * or of a rule into an item with free places that fits the gap; organizers
 * may too. From publication to the archive, no window.
 */
export async function placeStudent(db: Database, context: WindowContext, campaign: Campaign, caller: Caller, className: string, personId: string, itemId: string, reason: string): Promise<void> {
  const asClassTeacher = caller.classTeacherOf.includes(className)
  if (!isOrganizer(caller) && !asClassTeacher) throw new ApplicationError('forbidden')
  await db.tx(async (client) => {
    const locked = await lock(client, campaign.id)
    const student = await campaignStudent(client, locked.campaign, personId.toLowerCase())
    if (!student || student.className !== className) throw new ApplicationError('not_found')
    const explanation = explainStudent(locked.run.snapshot, locked.rows, student.personId)
    if (!explanation) throw new ApplicationError('not_found')
    if (!explanation.days.some((d) => d.deficit > 0) && explanation.rules.every((r) => r.met)) throw new ApplicationError('fully_placed')
    const move: Move = { personId: student.personId, toItemId: itemId.toLowerCase(), leaves: [] }
    refuse(checkMove(locked.run.snapshot, locked.rows, move, { unavailable: locked.unavailable }))
    const actor = actorOf(caller)
    const change = await write(client, locked, move, 'place', reason, false, actor)
    await notify(client, context, locked, student, move, change.id, asClassTeacher ? 'classTeacher' : 'organizer')
    await appendAudit(client, { scopeId: campaign.id, actor: auditActor(actor), action: 'assignment.placed', metadata: { changeId: change.id, seq: change.seq, runId: locked.run.id, personId: student.personId, toItemId: move.toItemId, className } })
  })
}

export interface ManualChange {
  personId: string
  itemId?: string
  removeItemId?: string
  reason: string
  force?: boolean
}

/**
 * The organizer's change by hand: into an item, out of one, or both. The
 * same rules as everyone's; `force` overrides a full item, an item's
 * minimum and a rule falling short on the organizer's responsibility,
 * recorded with the change.
 */
export async function changeAssignment(db: Database, context: WindowContext, campaign: Campaign, caller: Caller, input: ManualChange): Promise<AssignmentChange> {
  const toItemId = input.itemId?.toLowerCase() ?? null
  const fromItemId = input.removeItemId?.toLowerCase() ?? null
  if ((toItemId === null && fromItemId === null) || toItemId === fromItemId) throw new ApplicationError('no_change')
  const kind: ChangeKind = toItemId !== null && fromItemId !== null ? 'move' : toItemId !== null ? 'place' : 'remove'
  const force = input.force ?? false
  let changeId = ''
  await db.tx(async (client) => {
    const locked = await lock(client, campaign.id)
    const student = await campaignStudent(client, locked.campaign, input.personId.toLowerCase())
    if (!student) throw new ApplicationError('not_found')
    const move: Move = { personId: student.personId, toItemId, leaves: fromItemId === null ? [] : [fromItemId] }
    refuse(checkMove(locked.run.snapshot, locked.rows, move, { unavailable: locked.unavailable, force }))
    const actor = actorOf(caller)
    const change = await write(client, locked, move, kind, input.reason, force, actor)
    changeId = change.id
    await notify(client, context, locked, student, move, change.id, 'organizer')
    await appendAudit(client, { scopeId: campaign.id, actor: auditActor(actor), action: 'assignment.changed', metadata: { changeId: change.id, seq: change.seq, runId: locked.run.id, personId: student.personId, kind, toItemId, fromItemId, forced: force } })
  })
  const change = (await changeLog(db, campaign)).find((c) => c.id === changeId)
  if (!change) throw new Error('the change written is not in the log')
  return change
}

function toChange(change: StoredChange, students: Map<string, CampaignStudent>): AssignmentChange {
  const student = students.get(change.personId)
  return { ...change, displayName: student?.displayName ?? '', className: student?.className ?? '' }
}

/** Every change of the published run, oldest first, with names; empty before publication. The organizer's and the auditor's. */
export async function changeLog(db: Queryable, campaign: Campaign): Promise<AssignmentChange[]> {
  const run = await store.readPublishedRun(db, campaign.id)
  if (!run) return []
  // One after another: `db` may be a snapshot's client (the published workbook), which takes one query at a time.
  const rows = await store.listChanges(db, run.id)
  const students = await campaignStudents(db, campaign)
  const named = new Map(students.map((s) => [s.personId, s]))
  return rows.map((row) => toChange(row, named))
}
