import { type Ranking } from '@school-allocation/school-core'
import { type Caller } from '../actor.ts'
import type { Queryable } from '../db.ts'
import type { Campaign } from '../models/campaigns.ts'
import type { CampaignStudent, SaveBy } from '../models/choices.ts'
import { campaignRosterBatch } from './roster-selection.ts'

export async function campaignStudents(db: Queryable, campaign: Pick<Campaign, 'rosterBatchId'>, className?: string): Promise<CampaignStudent[]> {
  const { rows } = await db.query<{ person_id: string, display_name: string, class_name: string, grade: number, address: string | null }>(
    `select e.person_id, e.display_name, e.class_name, e.grade, coalesce(e.mail, e.upn) as address
       from roster_entry e
      where e.batch_id = ${campaignRosterBatch(campaign)} and e.kind = 'student' and e.person_id is not null
        and e.class_name is not null and e.grade is not null and ($1::text is null or e.class_name = $1)
      order by e.class_name, e.display_name`,
    [className ?? null],
  )
  return rows.map((row) => ({ personId: row.person_id, displayName: row.display_name, className: row.class_name, grade: row.grade, address: row.address }))
}

/** One student of the campaign's roster by person id; undefined when the roster does not list them as a student. */
export async function campaignStudent(db: Queryable, campaign: Pick<Campaign, 'rosterBatchId'>, personId: string): Promise<CampaignStudent | undefined> {
  const { rows: [row] } = await db.query<{ display_name: string, class_name: string, grade: number, address: string | null }>(
    `select e.display_name, e.class_name, e.grade, coalesce(e.mail, e.upn) as address from roster_entry e
      where e.batch_id = ${campaignRosterBatch(campaign)} and e.kind = 'student' and e.person_id = $1 and e.class_name is not null and e.grade is not null`,
    [personId],
  )
  return row === undefined ? undefined : { personId, displayName: row.display_name, className: row.class_name, grade: row.grade, address: row.address }
}

/** The items a student is placed into, exemptions left out. */
export async function fixedItemIds(db: Queryable, campaignId: string, personId: string): Promise<Set<string>> {
  const { rows } = await db.query<{ item_id: string }>('select item_id from pre_assignment where campaign_id = $1 and person_id = $2 and exempted_at is null', [campaignId, personId])
  return new Set(rows.map((row) => row.item_id))
}

export async function findChoice(db: Queryable, campaign: Campaign, student: CampaignStudent) {
  const { rows: [row] } = await db.query<{ ranking: Ranking, saved_in: 'first' | 'late', version: number }>(
    'select ranking, saved_in, version from choice where campaign_id = $1 and person_id = $2', [campaign.id, student.personId],
  )
  return row === undefined ? undefined : ({ ranking: row.ranking, savedIn: row.saved_in, version: row.version })
}

export async function lockChoiceWindow(db: Queryable, campaign: Campaign) {
  const { rows: [row] } = await db.query<{ state: Campaign['state'], closes_at: Date | null, late_until: Date | null, roster_batch_id: string | null }>(
    'select state, closes_at, late_until, roster_batch_id from campaign where id = $1 for update', [campaign.id],
  )
  return row === undefined ? undefined : ({ state: row.state, closesAt: row.closes_at, lateUntil: row.late_until, rosterBatchId: row.roster_batch_id })
}

export async function upsertRanking(db: Queryable, campaign: Campaign, student: CampaignStudent, canonical: Ranking, window: string, by: SaveBy) {
  const { rows: [row] } = await db.query<{ version: number }>(
    `insert into choice (campaign_id, person_id, ranking, saved_in, version, entered_by) values ($1, $2, $3, $4, 1, $5)
       on conflict (campaign_id, person_id) do update set ranking = excluded.ranking, saved_in = excluded.saved_in, version = choice.version + 1, updated_at = app_now(), entered_by = excluded.entered_by
       returning version`,
    [campaign.id, student.personId, JSON.stringify(canonical), window, by.caller.id],
  )
  return row === undefined ? undefined : ({ version: row.version })
}

export async function insertRevision(db: Queryable, campaign: Campaign, student: CampaignStudent, row: { version: number } | undefined, canonical: Ranking, window: string, by: SaveBy) {
  await db.query(
    'insert into choice_revision (campaign_id, person_id, version, ranking, saved_in, entered_by, reason) values ($1, $2, $3, $4, $5, $6, $7)',
    [campaign.id, student.personId, row?.version ?? 1, JSON.stringify(canonical), window, by.caller.id, by.reason ?? null],
  )
}

export async function lockExemptionWindow(db: Queryable, campaign: Campaign) {
  const { rows: [row] } = await db.query<{ state: Campaign['state'] }>('select state from campaign where id = $1 for update', [campaign.id])
  return row === undefined ? undefined : ({ state: row.state })
}

export async function lockPreAssignment(db: Queryable, campaign: Campaign, personId: string, itemId: string) {
  const { rows: [row] } = await db.query<{ exempted_at: Date | null }>(
    'select exempted_at from pre_assignment where campaign_id = $1 and person_id = $2 and item_id = $3 for update', [campaign.id, personId, itemId],
  )
  return row === undefined ? undefined : ({ exemptedAt: row.exempted_at })
}

export async function exemptPreAssignment(db: Queryable, campaign: Campaign, personId: string, itemId: string, caller: Caller, reason: string) {
  await db.query(
    'update pre_assignment set exempted_at = app_now(), exempted_by = $4, exempt_reason = $5 where campaign_id = $1 and person_id = $2 and item_id = $3',
    [campaign.id, personId, itemId, caller.id, reason],
  )
}

export async function listChoices(db: Queryable, campaign: Campaign) {
  const { rows } = await db.query<{ person_id: string, ranking: Ranking, saved_in: 'first' | 'late', updated_at: Date }>(
    'select person_id, ranking, saved_in, updated_at from choice where campaign_id = $1', [campaign.id],
  )
  return rows.map((row) => ({ personId: row.person_id, ranking: row.ranking, savedIn: row.saved_in, updatedAt: row.updated_at }))
}
