// The activities of a campaign in the database (docs/domain-and-api.md §1,
// §3; D-24 revised): proposed by teachers, reviewed by organizers, with
// their teachers and sessions. The rules an activity must satisfy are
// school-core's (checkItem); this module turns the stored rows into what
// it checks and back, and keeps who may do what to an item: its teachers
// while it is a draft, organizers always, audited where it is not their own.

import { requireFound } from '../lib/errors.ts'

import type { ItemCheckBody, ItemCheckResponse, ClassConflictView } from '@school-allocation/api-contracts/catalogue'
import { acceptsProposals, addedCells, checkItem, classConflicts, demandByDay, gateCells, gateRefused, itemTransition, servedCells, type CampaignState, type ClassActivity, type GateCell, type ItemState, type OfferedItem } from '@school-allocation/school-core'
import { actorOf, type Caller } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import { lockedCampaign, readCampaign } from '../lib/dao/campaigns.ts'
import { knownCategories } from '../lib/dao/categories.ts'
import * as store from '../lib/dao/items.ts'
import { numberApprovedItems, readItem, readProposedShape, writeParts } from '../lib/dao/items.ts'
import { readDetails } from '../lib/dao/teacher-detail.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError, ClassConflictError, ItemInvalid, TargetReached } from '../lib/errors.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item, ItemInput, Move, StoredShape } from '../lib/models/items.ts'
import { isOrganizer, isOwn } from '../lib/policies.ts'
import { datesOfSpan, instantOf } from '../lib/time.ts'
import { demandInputs } from './campaigns.ts'
import { itemInput } from './catalogue-input.ts'
import { reconcilePreAssignments } from './pre-assignments.ts'
import { mayView } from './visibility.ts'

/**
 * Checks an activity against its campaign's project days and classes and
 * the roster's teachers, inside the caller's transaction; throws ItemInvalid.
 */
async function validate(client: Queryable, campaignId: string, input: ItemInput): Promise<void> {
  const campaign = await store.findProjectDays(client, campaignId)
  const classes = await store.listCampaignClasses(client, campaignId)
  const teachers = await store.findItemTeachers(client, input)
  const known = new Set(teachers.map((row) => row.personId))
  const unknownTeachers = input.teachers.filter((id) => !known.has(id))
  const sessions = input.sessions.map((session) => {
    const startMs = instantOf(session.startsAt) ?? Number.NaN
    const endMs = instantOf(session.endsAt) ?? Number.NaN
    return { startMs, endMs, dates: Number.isFinite(startMs) && Number.isFinite(endMs) ? datesOfSpan(startMs, endMs) : [], credits: session.credits }
  })
  const problems = checkItem({ sessions, rules: input, teachers: input.teachers }, { projectDays: campaign?.projectDays ?? [], classes: classes.map((row) => row.className) })
  if (problems.length > 0 || unknownTeachers.length > 0) throw new ItemInvalid(problems, unknownTeachers)
  const categories = input.categories ?? []
  const categoriesKnown = await knownCategories(client, categories)
  if (categories.some((id) => !categoriesKnown.has(id))) throw new ApplicationError('category_unknown')
}

/**
 * Writes an activity as a draft; the campaign must be taking proposals. A
 * teacher drafting their own is not recorded; someone who is no teacher of
 * the roster creates by organizer right, on a teacher's behalf, and that is.
 */
export async function createItem(db: Database, campaignId: string, input: ItemInput, caller: Caller): Promise<Item> {
  const id = await db.tx(async (client) => {
    await lockScope(client, campaignId)
    const campaign = await store.lockCampaignForCreate(client, campaignId)
    if (!campaign) throw new ApplicationError('not_found')
    if (!acceptsProposals(campaign.state)) throw new ApplicationError('campaign_state')
    await validate(client, campaignId, input)
    const row = await store.insertItem(client, campaignId, input, caller)
    if (!row) throw new Error('catalog_item insert returned no row')
    await writeParts(client, row.id, input)
    await store.replaceCategories(client, row.id, input.categories ?? [])
    if (caller.person?.kind !== 'teacher') {
      await appendAudit(client, { scopeId: campaignId, actor: actorOf(caller), action: 'item.created', metadata: { itemId: row.id, teachers: input.teachers.length } })
    }
    return row.id
  })
  return mustRead(db, id)
}

/** The sessions as a comparable text: when, where, what they credit, in order. */
function sessionsKey(list: readonly { startsAt: string, endsAt: string, location?: string, credits: readonly { date: string, minutes: number }[] }[]): string {
  return list.map((s) => `${Date.parse(s.startsAt)}-${Date.parse(s.endsAt)}@${s.location ?? ''}:${[...s.credits].sort((a, b) => a.date.localeCompare(b.date, 'en')).map((c) => `${c.date}=${c.minutes}`).join('+')}`).join('|')
}

/** The sessions' times alone: what a class conflict is about. */
function timesKey(list: readonly { startsAt: string, endsAt: string }[]): string {
  return list.map((s) => `${Date.parse(s.startsAt)}-${Date.parse(s.endsAt)}`).join('|')
}

/** The sessions' times and credits alone, the locations left out. */
function timedSessionsKey(list: readonly { startsAt: string, endsAt: string, credits: readonly { date: string, minutes: number }[] }[]): string {
  return sessionsKey(list.map((s) => ({ ...s, location: '' })))
}

/** Whether the edit changes what the allocation computed with: the times and credits, the places and the minimum, the fee, the classes and grades, the categories its rules counted. */
function allocationRelevantChange(current: Item, input: ItemInput & { categories: string[] }): boolean {
  const byText = (a: string | number, b: string | number) => String(a).localeCompare(String(b), 'en')
  const sorted = (list: readonly (string | number)[]) => [...list].sort(byText).join(',')
  return current.places !== input.places || current.minParticipants !== input.minParticipants || current.cancellableBelowMin !== input.cancellableBelowMin || current.feeCents !== input.feeCents
    || sorted(current.fixedClasses) !== sorted(input.fixedClasses) || sorted(current.eligibleGrades) !== sorted(input.eligibleGrades) || sorted(current.eligibleClasses) !== sorted(input.eligibleClasses)
    || timedSessionsKey(current.sessions) !== timedSessionsKey(input.sessions)
    || sorted(current.categoryIds) !== sorted(input.categories)
}

/**
 * Replaces an activity's content. Its own people may do that while it is a
 * draft and the campaign takes proposals; an organizer may at any time but
 * withdrawn, audited unless it is their own; from publication on only its
 * words, not what the allocation computed with.
 */
export async function updateItem(db: Database, id: string, sent: ItemInput, caller: Caller, organizer: boolean): Promise<Item> {
  await db.tx(async (client) => {
    const current = await lockedItem(client, id)
    if (!current) throw new ApplicationError('not_found')
    // Categories left out are the ones it has: a client that knows none keeps them.
    const input = { ...sent, categories: sent.categories ?? current.categoryIds }
    const campaign = await store.lockCampaignForUpdate(client, current)
    // What a teacher may do without organizer rights: tend their own draft
    // while the catalogue takes proposals. Everything else is an
    // organizer's change and is recorded, their own item or not; an
    // organizer who is no teacher of the roster acts by that right alone.
    const asTeacher = caller.person?.kind === 'teacher' && isOwn(caller, current) && current.state === 'draft' && campaign !== undefined && acceptsProposals(campaign.state)
    if (!organizer && !asTeacher) {
      if (!isOwn(caller, current)) throw new ApplicationError('forbidden')
      if (current.state !== 'draft') throw new ApplicationError('item_state')
      throw new ApplicationError('campaign_state')
    }
    if (current.state === 'withdrawn') throw new ApplicationError('item_state')
    // An archived campaign changes no more. From publication on, an approved item is what the published run was computed
    // with: its times, places, minimum, fee, eligibility and categories stay (the result, the swaps and the placements read
    // them); the words may still change.
    if (campaign?.state === 'archived') throw new ApplicationError('campaign_state')
    if (campaign?.state === 'results' && current.state === 'approved' && allocationRelevantChange(current, input)) throw new ApplicationError('campaign_state')
    await validate(client, current.campaignId, input)
    // A class is in one class activity at a time: an organizer's change of classes or times to an activity already
    // submitted or approved must not make two (a teacher's draft is checked when it is submitted).
    const byName = (a: string, b: string) => a.localeCompare(b, 'de')
    const classesOrTimesChanged = [...current.fixedClasses].sort(byName).join() !== [...input.fixedClasses].sort(byName).join() || timesKey(current.sessions) !== timesKey(input.sessions)
    if ((current.state === 'proposed' || current.state === 'approved') && classesOrTimesChanged) await refuseClassConflicts(client, current.campaignId, { id, ...shapeOf(input) })
    await store.updateContent(client, id, input)
    await store.deleteTeachers(client, id)
    // Sessions are replaced only when their times or credits change: otherwise a session keeps its id, and with it the
    // attendance recorded for it, and a changed location is written in place.
    const timesChanged = timedSessionsKey(current.sessions) !== timedSessionsKey(input.sessions)
    if (timesChanged) await store.deleteSessions(client, id)
    else if (sessionsKey(current.sessions) !== sessionsKey(input.sessions)) await store.updateSessionLocations(client, id, input.sessions.map((s) => s.location ?? ''))
    await writeParts(client, id, timesChanged ? input : { ...input, sessions: [] })
    await store.replaceCategories(client, id, input.categories)
    if (campaign !== undefined && current.state === 'approved' && (campaign.state === 'open' || campaign.state === 'grace')) {
      await reconcilePreAssignments(client, current.campaignId, id)
    }
    if (!asTeacher) {
      await appendAudit(client, { scopeId: current.campaignId, actor: actorOf(caller), action: 'item.changed', metadata: { itemId: id, state: current.state } })
    }
  })
  return requireFound(await readItem(db, id))
}

/**
 * Removes a draft of the caller's own; anything else, and anything that was
 * ever in a published catalogue (it has a number), is withdrawn, not
 * removed. Drafting is its teachers' business alone: an organizer takes
 * someone else's item out through the audited withdrawal.
 */
export async function deleteDraft(db: Database, id: string, caller: Caller): Promise<void> {
  return db.tx(async (client) => {
    const current = await lockedItem(client, id)
    if (!current) throw new ApplicationError('not_found')
    if (!isOwn(caller, current)) throw new ApplicationError('forbidden')
    if (current.state !== 'draft' || current.number !== null) throw new ApplicationError('item_state')
    // An archived campaign changes no more, a forgotten draft included.
    if ((await store.lockCampaignForUpdate(client, current))?.state === 'archived') throw new ApplicationError('campaign_state')
    await store.deleteItem(client, id)
  })
}

/**
 * The item as it is under its campaign's lock: read once for the campaign,
 * locked, read again, so that what the caller decides on is what the lock
 * protects, not a snapshot another transaction may have changed since.
 */
async function lockedItem(client: Queryable, id: string): Promise<Item | undefined> {
  const found = await readItem(client, id)
  if (!found) return undefined
  await lockScope(client, found.campaignId)
  return readItem(client, id)
}

/**
 * One of an item's teachers proposes their draft; the campaign must be
 * taking proposals. Organizers propose their own items like anyone. Two
 * rules of the school's: a class activity is refused while a class of it
 * is in another class activity at the same time (`class_conflict`), and,
 * when the registration locks new offers, a teacher's activity is refused
 * when every cell it would serve has reached its target (`target_reached`);
 * an organizer's never is, and a resubmission is judged by the cells that
 * get more places than its last submission gave them. The first
 * submission's time stays through a return; the shape is this one's.
 */
export async function proposeItem(db: Database, id: string, caller: Caller): Promise<Item> {
  return moveItem(db, id, 'proposed', caller, false, async (client, current, campaign) => {
    if (!acceptsProposals(campaign.state)) throw new ApplicationError('campaign_state')
    const shape = shapeOf(current)
    if (current.fixedClasses.length > 0) await refuseClassConflicts(client, campaign.id, { id, ...shape })
    else if (campaign.lockNewOffers && !isOrganizer(caller)) {
      const { cells, refused } = await gateFor(client, campaign, id, shape, await readProposedShape(client, id))
      if (refused) throw new TargetReached(cells)
    }
    await store.proposeItem(client, id, shape)
  })
}

/** One of an item's teachers takes their proposal back to draft. An organizer's return goes through returnItem, with its note and audit event. */
export async function unproposeItem(db: Database, id: string, caller: Caller): Promise<Item> {
  return moveItem(db, id, 'draft', caller, false, async (client, current, campaign) => {
    if (!acceptsProposals(campaign.state)) throw new ApplicationError('campaign_state')
    if (current.state !== 'proposed') throw new ApplicationError('item_state')
    await store.unproposeItem(client, id)
  })
}

/** An organizer approves a proposal, audited. Allowed while the catalogue takes proposals and after it is published (a late item); a class activity not while a class of it is in another one at the same time. */
export async function approveItem(db: Database, id: string, caller: Caller): Promise<Item> {
  return moveItem(db, id, 'approved', caller, true, async (client, current, campaign) => {
    if (campaign.state !== 'catalogue' && campaign.state !== 'published') throw new ApplicationError('campaign_state')
    if (current.fixedClasses.length > 0) await refuseClassConflicts(client, campaign.id, { id, ...shapeOf(current) })
    await store.approveItem(client, id, caller)
    if (campaign.state === 'published') await numberApprovedItems(client, current.campaignId)
    await appendAudit(client, { scopeId: current.campaignId, actor: actorOf(caller), action: 'item.approved', metadata: { itemId: id } })
  })
}

/**
 * An organizer returns a proposal or an approved item to draft, with a note
 * for its teachers, audited. Only while the catalogue takes proposals: after
 * publication a teacher could neither edit nor propose it again, so an
 * organizer corrects a published item directly (audited) or withdraws it.
 */
export async function returnItem(db: Database, id: string, note: string, caller: Caller): Promise<Item> {
  return moveItem(db, id, 'draft', caller, true, async (client, current, campaign) => {
    if (!acceptsProposals(campaign.state)) throw new ApplicationError('campaign_state')
    await store.returnItem(client, id, note)
    await appendAudit(client, { scopeId: current.campaignId, actor: actorOf(caller), action: 'item.returned', metadata: { itemId: id, from: current.state, note } })
  })
}

/**
 * What becomes of a withdrawn item's assignments after publication: every
 * student currently in it is removed from it as a change by hand with the
 * withdrawal's reason, told, each audited; returns how many. Supplied by
 * services/withdrawal.ts from assignment-changes, so this module stays
 * below it. Runs inside the withdrawal's transaction, under the campaign's
 * lock, before the withdrawal is recorded.
 */
export type WithdrawalCascade = (client: Queryable, item: Item, reason: string) => Promise<number>

/**
 * An organizer withdraws an item, with a reason, audited; it stays in the
 * record. After publication nobody is left in it: `cascade` removes its
 * students (the result, the class page and the attendance then agree that
 * it does not take place), and the event carries how many.
 */
export async function withdrawItem(db: Database, id: string, reason: string, caller: Caller, cascade: WithdrawalCascade): Promise<Item> {
  return moveItem(db, id, 'withdrawn', caller, true, async (client, current, campaign) => {
    await store.withdrawItem(client, id, caller, reason)
    // A class activity withdrawn while the window is open frees its classes: the placements by class go (D-24), as after an edit.
    if (current.state === 'approved' && (campaign.state === 'open' || campaign.state === 'grace')) await reconcilePreAssignments(client, current.campaignId, id)
    const removed = current.state === 'approved' && campaign.state === 'results' ? await cascade(client, current, reason) : 0
    await appendAudit(client, { scopeId: current.campaignId, actor: actorOf(caller), action: 'item.withdrawn', metadata: { itemId: id, from: current.state, reason, ...(campaign.state === 'results' ? { removed } : {}) } })
  })
}

// Every state change: the item and its campaign under the campaign's lock,
// the transition school-core allows, then the change itself.
async function moveItem(db: Database, id: string, to: ItemState, caller: Caller, organizer: boolean, move: Move): Promise<Item> {
  await db.tx(async (client) => {
    // The campaign's scope lock before its rows, in the order every change of the published run takes them (assignment-changes lock).
    const seen = await readItem(client, id)
    if (!seen) throw new ApplicationError('not_found')
    // A submission is judged by the roster's classes and the period grid, which the school's scope lock protects: taken
    // first, before the campaign's, in the order the retention purge takes them, so the decision reads one snapshot.
    if (to === 'proposed') await lockScope(client, SCHOOL_SCOPE)
    await lockScope(client, seen.campaignId)
    const current = await lockedItem(client, id)
    if (!current) throw new ApplicationError('not_found')
    // The whole campaign, locked: a move reads its state, and a submission its lock on offers, its days and its headroom.
    const campaign = await lockedCampaign(client, current.campaignId)
    if (!campaign) throw new ApplicationError('not_found')
    if (!organizer && !isOwn(caller, current)) throw new ApplicationError('forbidden')
    // An archived campaign changes no more.
    if (campaign.state === 'archived') throw new ApplicationError('campaign_state')
    const result = itemTransition(current.state, to)
    if (!result.ok) throw new ApplicationError('invalid_item_transition')
    await move(client, current, campaign)
  })
  return requireFound(await readItem(db, id))
}

/** What the gate and the conflicts read of an activity, as stored or as sent: its places, whom it is for, when it takes place. */
function shapeOf(item: Pick<ItemInput, 'places' | 'fixedClasses' | 'eligibleGrades' | 'eligibleClasses'> & { sessions: readonly { startsAt: string, endsAt: string }[] }): StoredShape {
  return {
    places: item.places,
    fixedClasses: [...item.fixedClasses],
    eligibleGrades: [...item.eligibleGrades],
    eligibleClasses: [...item.eligibleClasses],
    sessions: item.sessions.map((s) => ({ startMs: instantOf(s.startsAt) ?? 0, endMs: instantOf(s.endsAt) ?? 0 })),
  }
}

/** A class activity's conflicts with the campaign's other proposed and approved class activities, each with the other's title and lead. */
async function classConflictsOf(client: Queryable, campaignId: string, candidate: ClassActivity): Promise<ClassConflictView[]> {
  if (candidate.fixedClasses.length === 0) return []
  // The candidate's id as the store spells it: a URL may carry it in capitals, and the activity must not meet itself.
  const self = { ...candidate, id: candidate.id.toLowerCase() }
  const others = (await store.listCampaignItems(client, campaignId)).filter((item) => (item.state === 'proposed' || item.state === 'approved') && item.fixedClasses.length > 0 && item.id !== self.id)
  const found = classConflicts(self, others.map((item) => ({ id: item.id, ...shapeOf(item) })))
  if (found.length === 0) return []
  const byId = new Map(others.map((item) => [item.id, item]))
  const leads = new Map(others.map((item) => [item.id, item.teachers.find((teacher) => teacher.lead) ?? null]))
  const details = await readDetails(client, [...new Set([...leads.values()].flatMap((lead) => (lead ? [lead.personId] : [])))])
  return found.map((conflict) => {
    const other = byId.get(conflict.itemId)
    const lead = leads.get(conflict.itemId) ?? null
    return {
      className: conflict.className,
      itemId: conflict.itemId,
      title: other?.title ?? '',
      lead: { displayName: lead?.displayName ?? '', shortName: lead === null ? null : (details.get(lead.personId)?.shortName ?? null) },
      startsAt: new Date(conflict.startMs).toISOString(),
      endsAt: new Date(conflict.endMs).toISOString(),
    }
  })
}

/** Refuses a class activity that would put a class into two class activities at once. */
async function refuseClassConflicts(client: Queryable, campaignId: string, candidate: ClassActivity): Promise<void> {
  const conflicts = await classConflictsOf(client, campaignId, candidate)
  if (conflicts.length > 0) throw new ClassConflictError(conflicts)
}

/**
 * The gate's verdict on an activity: the demand without it (every other
 * proposed and approved activity), the cells it would serve, judged, and
 * whether a teacher's submission is refused. A resubmission (`previous`,
 * the shape of its last submission) is judged by the cells that get more
 * places than before; `served` is every cell it serves, judged the same
 * way, for the page that says where its places go. The demand with it,
 * for a page that shows both.
 */
async function gateFor(client: Queryable, campaign: Campaign, itemId: string | null, shape: OfferedItem, previous: StoredShape | null): Promise<{ before: ReturnType<typeof demandByDay>, after: ReturnType<typeof demandByDay>, served: GateCell[], cells: GateCell[], refused: boolean }> {
  const { classes, days, items } = await demandInputs(client, campaign)
  if (itemId !== null) items.delete(itemId)
  const others = [...items.values()]
  const before = demandByDay(days, classes, others)
  const served = servedCells(shape, days, classes)
  const judged = previous === null ? served : addedCells(servedCells(previous, days, classes), served, shape.places > previous.places)
  const cells = gateCells(judged, before, campaign.placeHeadroomPercent)
  return { before, after: demandByDay(days, classes, [...others, shape]), served: gateCells(served, before, campaign.placeHeadroomPercent), cells, refused: gateRefused(cells) }
}

/**
 * What a submission would meet, for the form and the review: the demand
 * without and with the activity, the cells it serves, whether a teacher's
 * submission would be refused (the gate counts for a teacher; the page
 * tells an organizer they may go ahead), whether the registration locks
 * new offers, and its class conflicts. The activity as the form holds it,
 * a stored one by id (the caller's own or an organizer's to see), or both:
 * the form's shape, left out of the demand as the stored activity and
 * judged as its resubmission.
 */
export async function checkItemOffer(db: Database, campaign: Campaign, body: ItemCheckBody, caller: Caller): Promise<ItemCheckResponse> {
  let shape: StoredShape | null = null
  let previous: StoredShape | null = null
  let itemId: string | null = null
  if (body.itemId !== undefined) {
    const item = await readItem(db, body.itemId.toLowerCase())
    if (!item || item.campaignId !== campaign.id || !(isOrganizer(caller) || isOwn(caller, item))) throw new ApplicationError('not_found')
    shape = shapeOf(item)
    previous = await readProposedShape(db, item.id)
    itemId = item.id
  }
  if (body.item !== undefined) shape = shapeOf(itemInput(body.item, caller, true))
  if (shape === null) throw new ApplicationError('validation_failed')
  const { before, after, served, cells, refused } = await gateFor(db, campaign, itemId, shape, previous)
  const classActivity = shape.fixedClasses.length > 0
  return {
    before,
    after,
    served,
    cells,
    refused: campaign.lockNewOffers && !classActivity && refused,
    locked: campaign.lockNewOffers,
    conflicts: await classConflictsOf(db, campaign.id, { id: itemId ?? '', ...shape }),
  }
}

/** The items of a campaign the caller may see: organizers all of them; teachers their own and the approved ones; everyone else the approved ones once the catalogue is published. */
export async function listItems(db: Queryable, campaign: { id: string, state: CampaignState }, caller: Caller, organizer: boolean): Promise<Item[]> {
  const items = await store.listCampaignItems(db, campaign.id)
  if (organizer) return items
  const published = campaign.state !== 'draft' && campaign.state !== 'catalogue'
  return items.filter((item) => isOwn(caller, item) || (item.state === 'approved' && (published || caller.person?.kind === 'teacher')))
}

/** The published catalogue: the approved items, numbered, in print order. */
export async function catalogueItems(db: Queryable, campaignId: string): Promise<Item[]> {
  const items = await store.listApprovedItems(db, campaignId)
  return items.sort((a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title, 'de'))
}

async function mustRead(db: Queryable, id: string): Promise<Item> {
  const item = await readItem(db, id)
  if (!item) throw new Error('the item just written is gone')
  return item
}

/** Check resource visibility before applying the requested operation. */
export async function withVisibleItem<T>(db: Database, id: string, caller: Caller, operation: () => Promise<T>): Promise<T> {
  const item = await readItem(db, id)
  const campaign = item === undefined ? undefined : await readCampaign(db, item.campaignId)
  if (!item || !campaign || !(await mayView(db, caller, campaign))) throw new ApplicationError('not_found')
  return operation()
}
