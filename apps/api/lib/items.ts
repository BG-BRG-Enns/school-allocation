// The activities of a campaign in the database (docs/domain-and-api.md §1,
// §3; D-24 revised): proposed by teachers, reviewed by organizers, with
// their teachers and sessions. The rules an activity must satisfy are
// school-core's (checkItem); this module turns the stored rows into what
// it checks and back, and keeps who may do what to an item: its teachers
// while it is a draft, organizers always, audited where it is not their own.

import { acceptsProposals, checkItem, itemTransition, type CampaignState, type CatalogueProblem, type Credit, type ItemRules, type ItemState } from '@school-allocation/school-core'
import { appendAudit, lockScope } from './audit.ts'
import type { Caller } from './auth.ts'
import type { Database, Queryable } from './db.ts'
import { reconcilePreAssignments } from './pre-assignments.ts'
import { RosterConflict } from './roster.ts'
import { datesOfSpan, instantOf } from './time.ts'

export interface SessionInput {
  /** ISO 8601 instants. */
  startsAt: string
  endsAt: string
  location: string
  credits: Credit[]
}

export interface ItemInput extends ItemRules {
  title: string
  description: string
  location: string
  feeCents: number
  feeNote: string
  /** Person ids of roster teachers. */
  teachers: string[]
  sessions: SessionInput[]
}

export interface Session extends SessionInput {
  id: string
}

export interface Item extends Omit<ItemInput, 'teachers' | 'sessions'> {
  id: string
  campaignId: string
  number: number | null
  state: ItemState
  reviewNote: string
  proposedBy: { id: string, displayName: string }
  teachers: { personId: string, displayName: string }[]
  sessions: Session[]
  createdAt: string
  updatedAt: string
  approvedAt: string | null
  withdrawnAt: string | null
  withdrawReason: string | null
}

/** Why an activity was refused: the rules it breaks, or a teacher who is not one of the roster's. */
export class ItemInvalid extends Error {
  override name = 'ItemInvalid'
  readonly problems: CatalogueProblem[]
  readonly unknownTeachers: string[]
  constructor(problems: CatalogueProblem[], unknownTeachers: string[] = []) {
    super('item_invalid')
    this.problems = problems
    this.unknownTeachers = unknownTeachers
  }
}

/** Whether the caller is one of the item's people: its proposer or one of its teachers. */
export function isOwn(caller: Pick<Caller, 'id' | 'person'>, item: Pick<Item, 'proposedBy' | 'teachers'>): boolean {
  return item.proposedBy.id === caller.id || (caller.person !== null && item.teachers.some((teacher) => teacher.personId === caller.person?.id))
}

/**
 * Checks an activity against its campaign's project days and the roster's
 * classes and teachers, inside the caller's transaction; throws ItemInvalid.
 */
async function validate(client: Queryable, campaignId: string, input: ItemInput): Promise<void> {
  const { rows: [campaign] } = await client.query<{ project_days: string[] }>('select project_days::text[] as project_days from campaign where id = $1', [campaignId])
  const { rows: classes } = await client.query<{ class_name: string }>(
    `select distinct e.class_name from roster_entry e
       join (select id from import_batch where state = 'committed' order by decided_at desc limit 1) c on c.id = e.batch_id
      where e.kind = 'student' and e.class_name is not null`,
  )
  const { rows: teachers } = await client.query<{ person_id: string }>(
    `select e.person_id from roster_entry e
       join (select id from import_batch where state = 'committed' order by decided_at desc limit 1) c on c.id = e.batch_id
      where e.kind = 'teacher' and e.person_id = any($1::uuid[])`,
    [input.teachers],
  )
  const known = new Set(teachers.map((row) => row.person_id))
  const unknownTeachers = input.teachers.filter((id) => !known.has(id))
  const sessions = input.sessions.map((session) => {
    const startMs = instantOf(session.startsAt) ?? Number.NaN
    const endMs = instantOf(session.endsAt) ?? Number.NaN
    return { startMs, endMs, dates: Number.isFinite(startMs) && Number.isFinite(endMs) ? datesOfSpan(startMs, endMs) : [], credits: session.credits }
  })
  const problems = checkItem({ sessions, rules: input, teachers: input.teachers }, { projectDays: campaign?.project_days ?? [], classes: classes.map((row) => row.class_name) })
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
    const { rows: [campaign] } = await client.query<{ state: CampaignState }>('select state from campaign where id = $1 for update', [campaignId])
    if (!campaign) throw new RosterConflict('not_found')
    if (!acceptsProposals(campaign.state)) throw new RosterConflict('campaign_state')
    await validate(client, campaignId, input)
    const { rows: [row] } = await client.query<{ id: string }>(
      `insert into catalog_item (campaign_id, title, description, location, fee_cents, fee_note, places, min_participants, cancellable_below_min,
                                 fixed_classes, eligible_grades, eligible_classes, proposed_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
      [campaignId, input.title, input.description, input.location, input.feeCents, input.feeNote, input.places, input.minParticipants, input.cancellableBelowMin,
        input.fixedClasses, input.eligibleGrades, input.eligibleClasses, caller.id],
    )
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
    const { rows: [campaign] } = await client.query<{ state: CampaignState }>('select state from campaign where id = $1 for update', [current.campaignId])
    // What a teacher may do without organizer rights: tend their own draft
    // while the catalogue takes proposals. Everything else is an
    // organizer's change and is recorded, their own item or not; an
    // organizer who is no teacher of the roster acts by that right alone.
    const asTeacher = caller.person?.kind === 'teacher' && isOwn(caller, current) && current.state === 'draft' && campaign !== undefined && acceptsProposals(campaign.state)
    if (!organizer && !asTeacher) {
      if (!isOwn(caller, current)) throw new RosterConflict('forbidden')
      if (current.state !== 'draft') throw new RosterConflict('item_state')
      throw new RosterConflict('campaign_state')
    }
    if (current.state === 'withdrawn') throw new RosterConflict('item_state')
    await validate(client, current.campaignId, input)
    await client.query(
      `update catalog_item set title = $2, description = $3, location = $4, fee_cents = $5, fee_note = $6, places = $7, min_participants = $8,
              cancellable_below_min = $9, fixed_classes = $10, eligible_grades = $11, eligible_classes = $12, updated_at = now() where id = $1`,
      [id, input.title, input.description, input.location, input.feeCents, input.feeNote, input.places, input.minParticipants, input.cancellableBelowMin,
        input.fixedClasses, input.eligibleGrades, input.eligibleClasses],
    )
    await client.query('delete from item_teacher where item_id = $1', [id])
    await client.query('delete from item_session where item_id = $1', [id])
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
    if (!isOwn(caller, current)) throw new RosterConflict('forbidden')
    if (current.state !== 'draft' || current.number !== null) throw new RosterConflict('item_state')
    await client.query('delete from catalog_item where id = $1', [id])
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
    if (!acceptsProposals(campaignState)) throw new RosterConflict('campaign_state')
    await client.query('update catalog_item set state = $2, review_note = \'\', updated_at = now() where id = $1', [id, 'proposed'])
  })
}

/** One of an item's teachers takes their proposal back to draft. An organizer's return goes through returnItem, with its note and audit event. */
export async function unproposeItem(db: Database, id: string, caller: Caller): Promise<Item | undefined> {
  return moveItem(db, id, 'draft', caller, false, async (client, current, campaignState) => {
    if (!acceptsProposals(campaignState)) throw new RosterConflict('campaign_state')
    if (current.state !== 'proposed') throw new RosterConflict('item_state')
    await client.query('update catalog_item set state = $2, updated_at = now() where id = $1', [id, 'draft'])
  })
}

/** An organizer approves a proposal, audited. Allowed while the catalogue takes proposals and after it is published (a late item). */
export async function approveItem(db: Database, id: string, caller: Caller): Promise<Item | undefined> {
  return moveItem(db, id, 'approved', caller, true, async (client, current, campaignState) => {
    if (campaignState !== 'catalogue' && campaignState !== 'published') throw new RosterConflict('campaign_state')
    await client.query('update catalog_item set state = $2, approved_at = now(), approved_by = $3, review_note = \'\', updated_at = now() where id = $1', [id, 'approved', caller.id])
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
    if (!acceptsProposals(campaignState)) throw new RosterConflict('campaign_state')
    await client.query('update catalog_item set state = $2, review_note = $3, approved_at = null, approved_by = null, updated_at = now() where id = $1', [id, 'draft', note])
    await appendAudit(client, { scopeId: current.campaignId, actor: actorOf(caller), action: 'item.returned', metadata: { itemId: id, from: current.state, note } })
  })
}

/** An organizer withdraws an item, with a reason, audited; it stays in the record. */
export async function withdrawItem(db: Database, id: string, reason: string, caller: Caller): Promise<Item | undefined> {
  return moveItem(db, id, 'withdrawn', caller, true, async (client, current) => {
    await client.query('update catalog_item set state = $2, withdrawn_at = now(), withdrawn_by = $3, withdraw_reason = $4, updated_at = now() where id = $1', [id, 'withdrawn', caller.id, reason])
    await appendAudit(client, { scopeId: current.campaignId, actor: actorOf(caller), action: 'item.withdrawn', metadata: { itemId: id, from: current.state, reason } })
  })
}

type Move = (client: Queryable, current: Item, campaignState: CampaignState) => Promise<void>

// Every state change: the item and its campaign under the campaign's lock,
// the transition school-core allows, then the change itself.
async function moveItem(db: Database, id: string, to: ItemState, caller: Caller, organizer: boolean, move: Move): Promise<Item | undefined> {
  const found = await db.tx(async (client) => {
    const current = await lockedItem(client, id)
    if (!current) return false
    const { rows: [campaign] } = await client.query<{ state: CampaignState }>('select state from campaign where id = $1 for update', [current.campaignId])
    if (!campaign) return false
    if (!organizer && !isOwn(caller, current)) throw new RosterConflict('forbidden')
    const result = itemTransition(current.state, to)
    if (!result.ok) throw new RosterConflict('invalid_item_transition')
    await move(client, current, campaign.state)
    return true
  })
  return found ? readItem(db, id) : undefined
}

/**
 * Gives every approved item without a number the next one, in the order of
 * the printed catalogue: first session first, then title. Called when the
 * catalogue is published and for an item approved afterwards. Returns how
 * many were numbered.
 */
export async function numberApprovedItems(client: Queryable, campaignId: string): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    `select i.id from catalog_item i
       left join lateral (select min(starts_at) as first from item_session s where s.item_id = i.id) s on true
      where i.campaign_id = $1 and i.state = 'approved' and i.number is null
      order by s.first nulls last, i.title, i.created_at`,
    [campaignId],
  )
  const { rows: [top] } = await client.query<{ max: number | null }>('select max(number) as max from catalog_item where campaign_id = $1', [campaignId])
  let next = (top?.max ?? 0) + 1
  for (const row of rows) {
    await client.query('update catalog_item set number = $2 where id = $1', [row.id, next])
    next += 1
  }
  return rows.length
}

export async function readItem(db: Queryable, id: string): Promise<Item | undefined> {
  const items = await readItems(db, 'where i.id = $1', [id])
  return items[0]
}

/** The items of a campaign the caller may see: organizers all of them; teachers their own and the approved ones; everyone else the approved ones once the catalogue is published. */
export async function listItems(db: Queryable, campaign: { id: string, state: CampaignState }, caller: Caller, organizer: boolean): Promise<Item[]> {
  const items = await readItems(db, 'where i.campaign_id = $1', [campaign.id])
  if (organizer) return items
  const published = campaign.state !== 'draft' && campaign.state !== 'catalogue'
  return items.filter((item) => isOwn(caller, item) || (item.state === 'approved' && (published || caller.person?.kind === 'teacher')))
}

/** The published catalogue: the approved items, numbered, in print order. */
export async function catalogueItems(db: Queryable, campaignId: string): Promise<Item[]> {
  const items = await readItems(db, 'where i.campaign_id = $1 and i.state = \'approved\'', [campaignId])
  return items.sort((a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title, 'de'))
}

async function mustRead(db: Queryable, id: string): Promise<Item> {
  const item = await readItem(db, id)
  if (!item) throw new Error('the item just written is gone')
  return item
}

async function writeParts(client: Queryable, itemId: string, input: ItemInput): Promise<void> {
  for (const [position, personId] of input.teachers.entries()) {
    await client.query('insert into item_teacher (item_id, person_id, position) values ($1, $2, $3)', [itemId, personId, position])
  }
  for (const [position, session] of input.sessions.entries()) {
    await client.query(
      'insert into item_session (item_id, position, starts_at, ends_at, location, credits) values ($1, $2, $3, $4, $5, $6)',
      [itemId, position, session.startsAt, session.endsAt, session.location, JSON.stringify(session.credits)],
    )
  }
}

interface ItemRow {
  id: string
  campaign_id: string
  number: number | null
  title: string
  description: string
  location: string
  fee_cents: number
  fee_note: string
  places: number
  min_participants: number
  cancellable_below_min: boolean
  fixed_classes: string[]
  eligible_grades: number[]
  eligible_classes: string[]
  state: ItemState
  review_note: string
  proposed_by: string
  proposer_name: string
  created_at: Date
  updated_at: Date
  approved_at: Date | null
  withdrawn_at: Date | null
  withdraw_reason: string | null
  teachers: { personId: string, displayName: string }[]
  sessions: { id: string, startsAt: string, endsAt: string, location: string, credits: Credit[] }[]
}

async function readItems(db: Queryable, where: string, values: unknown[]): Promise<Item[]> {
  const { rows } = await db.query<ItemRow>(
    `select i.id, i.campaign_id, i.number, i.title, i.description, i.location, i.fee_cents, i.fee_note, i.places, i.min_participants,
            i.cancellable_below_min, i.fixed_classes, i.eligible_grades, i.eligible_classes, i.state, i.review_note, i.proposed_by,
            u.display_name as proposer_name, i.created_at, i.updated_at, i.approved_at, i.withdrawn_at, i.withdraw_reason,
            coalesce((select json_agg(json_build_object('personId', t.person_id, 'displayName', coalesce(e.display_name, '?')) order by t.position)
                        from item_teacher t
                        left join roster_entry e on e.person_id = t.person_id
                             and e.batch_id = (select id from import_batch where state = 'committed' order by decided_at desc limit 1)
                       where t.item_id = i.id), '[]') as teachers,
            coalesce((select json_agg(json_build_object('id', s.id, 'startsAt', to_char(s.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                                                        'endsAt', to_char(s.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                                                        'location', s.location, 'credits', s.credits) order by s.position)
                        from item_session s where s.item_id = i.id), '[]') as sessions
       from catalog_item i join app_user u on u.id = i.proposed_by
       ${where}
      order by i.number nulls last, i.created_at`,
    values,
  )
  return rows.map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    number: row.number,
    title: row.title,
    description: row.description,
    location: row.location,
    feeCents: row.fee_cents,
    feeNote: row.fee_note,
    places: row.places,
    minParticipants: row.min_participants,
    cancellableBelowMin: row.cancellable_below_min,
    fixedClasses: row.fixed_classes,
    eligibleGrades: row.eligible_grades,
    eligibleClasses: row.eligible_classes,
    state: row.state,
    reviewNote: row.review_note,
    proposedBy: { id: row.proposed_by, displayName: row.proposer_name },
    teachers: row.teachers,
    sessions: row.sessions,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    approvedAt: row.approved_at?.toISOString() ?? null,
    withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
    withdrawReason: row.withdraw_reason,
  }))
}

function actorOf(caller: Caller) {
  return { tid: caller.tid, oid: caller.oid, name: caller.displayName }
}
