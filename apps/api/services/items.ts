// The activities of a campaign in the database (docs/domain-and-api.md §1,
// §3; D-24 revised): proposed by teachers, reviewed by organizers, with
// their teachers and sessions. The rules an activity must satisfy are
// school-core's (checkItem); this module turns the stored rows into what
// it checks and back, and keeps who may do what to an item: its teachers
// while it is a draft, organizers always, audited where it is not their own.

import { acceptsProposals, checkItem, itemTransition, type CampaignState, type ItemState } from '@school-allocation/school-core'
import { actorOf, type Caller } from '../lib/actor.ts'
import { appendAudit, lockScope } from '../lib/audit.ts'
import { readCampaign } from '../lib/dao/campaigns.ts'
import * as store from '../lib/dao/items.ts'
import { numberApprovedItems, readItem, writeParts } from '../lib/dao/items.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError, ItemInvalid } from '../lib/errors.ts'
import type { Item, ItemInput, Move } from '../lib/models/items.ts'
import { canSee, isOwn } from '../lib/policies.ts'
import { datesOfSpan, instantOf } from '../lib/time.ts'
import { reconcilePreAssignments } from './pre-assignments.ts'

/**
 * Checks an activity against its campaign's project days and the roster's
 * classes and teachers, inside the caller's transaction; throws ItemInvalid.
 */
async function validate(client: Queryable, campaignId: string, input: ItemInput): Promise<void> {
  const campaign = await store.findProjectDays(client, campaignId)
  const classes = await store.listRosterClasses(client)
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
    if (caller.person?.kind !== 'teacher') {
      await appendAudit(client, { scopeId: campaignId, actor: actorOf(caller), action: 'item.created', metadata: { itemId: row.id, teachers: input.teachers.length } })
    }
    return row.id
  })
  return mustRead(db, id)
}

/**
 * Replaces an activity's content. Its own people may do that while it is a
 * draft and the campaign takes proposals; an organizer may at any time but
 * withdrawn, audited unless it is their own.
 */
export async function updateItem(db: Database, id: string, input: ItemInput, caller: Caller, organizer: boolean): Promise<Item | undefined> {
  const found = await db.tx(async (client) => {
    const current = await lockedItem(client, id)
    if (!current) return false
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
    await validate(client, current.campaignId, input)
    await store.updateContent(client, id, input)
    await store.deleteTeachers(client, id)
    await store.deleteSessions(client, id)
    await writeParts(client, id, input)
    if (campaign !== undefined && current.state === 'approved' && (campaign.state === 'open' || campaign.state === 'grace')) {
      await reconcilePreAssignments(client, current.campaignId, id)
    }
    if (!asTeacher) {
      await appendAudit(client, { scopeId: current.campaignId, actor: actorOf(caller), action: 'item.changed', metadata: { itemId: id, state: current.state } })
    }
    return true
  })
  return found ? readItem(db, id) : undefined
}

/**
 * Removes a draft of the caller's own; anything else, and anything that was
 * ever in a published catalogue (it has a number), is withdrawn, not
 * removed. Drafting is its teachers' business alone: an organizer takes
 * someone else's item out through the audited withdrawal.
 */
export async function deleteDraft(db: Database, id: string, caller: Caller): Promise<boolean> {
  return db.tx(async (client) => {
    const current = await lockedItem(client, id)
    if (!current) return false
    if (!isOwn(caller, current)) throw new ApplicationError('forbidden')
    if (current.state !== 'draft' || current.number !== null) throw new ApplicationError('item_state')
    await store.deleteItem(client, id)
    return true
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

/** One of an item's teachers proposes their draft; the campaign must be taking proposals. Organizers propose their own items like anyone. */
export async function proposeItem(db: Database, id: string, caller: Caller): Promise<Item | undefined> {
  return moveItem(db, id, 'proposed', caller, false, async (client, current, campaignState) => {
    if (!acceptsProposals(campaignState)) throw new ApplicationError('campaign_state')
    await store.proposeItem(client, id)
  })
}

/** One of an item's teachers takes their proposal back to draft. An organizer's return goes through returnItem, with its note and audit event. */
export async function unproposeItem(db: Database, id: string, caller: Caller): Promise<Item | undefined> {
  return moveItem(db, id, 'draft', caller, false, async (client, current, campaignState) => {
    if (!acceptsProposals(campaignState)) throw new ApplicationError('campaign_state')
    if (current.state !== 'proposed') throw new ApplicationError('item_state')
    await store.unproposeItem(client, id)
  })
}

/** An organizer approves a proposal, audited. Allowed while the catalogue takes proposals and after it is published (a late item). */
export async function approveItem(db: Database, id: string, caller: Caller): Promise<Item | undefined> {
  return moveItem(db, id, 'approved', caller, true, async (client, current, campaignState) => {
    if (campaignState !== 'catalogue' && campaignState !== 'published') throw new ApplicationError('campaign_state')
    await store.approveItem(client, id, caller)
    if (campaignState === 'published') await numberApprovedItems(client, current.campaignId)
    await appendAudit(client, { scopeId: current.campaignId, actor: actorOf(caller), action: 'item.approved', metadata: { itemId: id } })
  })
}

/**
 * An organizer returns a proposal or an approved item to draft, with a note
 * for its teachers, audited. Only while the catalogue takes proposals: after
 * publication a teacher could neither edit nor propose it again, so an
 * organizer corrects a published item directly (audited) or withdraws it.
 */
export async function returnItem(db: Database, id: string, note: string, caller: Caller): Promise<Item | undefined> {
  return moveItem(db, id, 'draft', caller, true, async (client, current, campaignState) => {
    if (!acceptsProposals(campaignState)) throw new ApplicationError('campaign_state')
    await store.returnItem(client, id, note)
    await appendAudit(client, { scopeId: current.campaignId, actor: actorOf(caller), action: 'item.returned', metadata: { itemId: id, from: current.state, note } })
  })
}

/** An organizer withdraws an item, with a reason, audited; it stays in the record. */
export async function withdrawItem(db: Database, id: string, reason: string, caller: Caller): Promise<Item | undefined> {
  return moveItem(db, id, 'withdrawn', caller, true, async (client, current, campaignState) => {
    await store.withdrawItem(client, id, caller, reason)
    // A class activity withdrawn while the window is open frees its classes: the placements by class go (D-24), as after an edit.
    if (current.state === 'approved' && (campaignState === 'open' || campaignState === 'grace')) await reconcilePreAssignments(client, current.campaignId, id)
    await appendAudit(client, { scopeId: current.campaignId, actor: actorOf(caller), action: 'item.withdrawn', metadata: { itemId: id, from: current.state, reason } })
  })
}

// Every state change: the item and its campaign under the campaign's lock,
// the transition school-core allows, then the change itself.
async function moveItem(db: Database, id: string, to: ItemState, caller: Caller, organizer: boolean, move: Move): Promise<Item | undefined> {
  const found = await db.tx(async (client) => {
    const current = await lockedItem(client, id)
    if (!current) return false
    const campaign = await store.lockCampaignForMove(client, current)
    if (!campaign) return false
    if (!organizer && !isOwn(caller, current)) throw new ApplicationError('forbidden')
    const result = itemTransition(current.state, to)
    if (!result.ok) throw new ApplicationError('invalid_item_transition')
    await move(client, current, campaign.state)
    return true
  })
  return found ? readItem(db, id) : undefined
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
export async function withVisibleItem<T>(db: Database, id: string, caller: Caller, operation: () => Promise<T | undefined>): Promise<T> {
  const item = await readItem(db, id)
  const campaign = item === undefined ? undefined : await readCampaign(db, item.campaignId)
  if (!item || !campaign || !canSee(caller, campaign.state)) throw new ApplicationError('not_found')
  const result = await operation()
  if (result === undefined) throw new ApplicationError('not_found')
  return result
}
