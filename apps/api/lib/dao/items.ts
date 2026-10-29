import { type CampaignState } from '@school-allocation/school-core'
import { type Caller } from '../actor.ts'
import type { Queryable } from '../db.ts'
import type { Item, ItemInput, ItemRow } from '../models/items.ts'

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

export async function writeParts(client: Queryable, itemId: string, input: ItemInput): Promise<void> {
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

export async function readItems(db: Queryable, where: string, values: unknown[]): Promise<Item[]> {
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

export function findProjectDays(db: Queryable, campaignId: string) {
  return db.query<{ project_days: string[] }>('select project_days::text[] as project_days from campaign where id = $1', [campaignId])
}

export function listRosterClasses(db: Queryable) {
  return db.query<{ class_name: string }>(
    `select distinct e.class_name from roster_entry e
       join (select id from import_batch where state = 'committed' order by decided_at desc limit 1) c on c.id = e.batch_id
      where e.kind = 'student' and e.class_name is not null`,
  )
}

export function findItemTeachers(db: Queryable, input: ItemInput) {
  return db.query<{ person_id: string }>(
    `select e.person_id from roster_entry e
       join (select id from import_batch where state = 'committed' order by decided_at desc limit 1) c on c.id = e.batch_id
      where e.kind = 'teacher' and e.person_id = any($1::uuid[])`,
    [input.teachers],
  )
}

export function lockCampaignForCreate(db: Queryable, campaignId: string) {
  return db.query<{ state: CampaignState }>('select state from campaign where id = $1 for update', [campaignId])
}

export function insertItem(db: Queryable, campaignId: string, input: ItemInput, caller: Caller) {
  return db.query<{ id: string }>(
    `insert into catalog_item (campaign_id, title, description, location, fee_cents, fee_note, places, min_participants, cancellable_below_min,
                                 fixed_classes, eligible_grades, eligible_classes, proposed_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
    [campaignId, input.title, input.description, input.location, input.feeCents, input.feeNote, input.places, input.minParticipants, input.cancellableBelowMin,
      input.fixedClasses, input.eligibleGrades, input.eligibleClasses, caller.id],
  )
}

export function lockCampaignForUpdate(db: Queryable, current: Item) {
  return db.query<{ state: CampaignState }>('select state from campaign where id = $1 for update', [current.campaignId])
}

export function updateContent(db: Queryable, id: string, input: ItemInput) {
  return db.query(
    `update catalog_item set title = $2, description = $3, location = $4, fee_cents = $5, fee_note = $6, places = $7, min_participants = $8,
              cancellable_below_min = $9, fixed_classes = $10, eligible_grades = $11, eligible_classes = $12, updated_at = now() where id = $1`,
    [id, input.title, input.description, input.location, input.feeCents, input.feeNote, input.places, input.minParticipants, input.cancellableBelowMin,
      input.fixedClasses, input.eligibleGrades, input.eligibleClasses],
  )
}

export function deleteTeachers(db: Queryable, id: string) {
  return db.query('delete from item_teacher where item_id = $1', [id])
}

export function deleteSessions(db: Queryable, id: string) {
  return db.query('delete from item_session where item_id = $1', [id])
}

export function deleteItem(db: Queryable, id: string) {
  return db.query('delete from catalog_item where id = $1', [id])
}

export function proposeItem(db: Queryable, id: string) {
  return db.query('update catalog_item set state = $2, review_note = \'\', updated_at = now() where id = $1', [id, 'proposed'])
}

export function unproposeItem(db: Queryable, id: string) {
  return db.query('update catalog_item set state = $2, updated_at = now() where id = $1', [id, 'draft'])
}

export function approveItem(db: Queryable, id: string, caller: Caller) {
  return db.query('update catalog_item set state = $2, approved_at = now(), approved_by = $3, review_note = \'\', updated_at = now() where id = $1', [id, 'approved', caller.id])
}

export function returnItem(db: Queryable, id: string, note: string) {
  return db.query('update catalog_item set state = $2, review_note = $3, approved_at = null, approved_by = null, updated_at = now() where id = $1', [id, 'draft', note])
}

export function withdrawItem(db: Queryable, id: string, caller: Caller, reason: string) {
  return db.query('update catalog_item set state = $2, withdrawn_at = now(), withdrawn_by = $3, withdraw_reason = $4, updated_at = now() where id = $1', [id, 'withdrawn', caller.id, reason])
}

export function lockCampaignForMove(db: Queryable, current: Item) {
  return db.query<{ state: CampaignState }>('select state from campaign where id = $1 for update', [current.campaignId])
}
