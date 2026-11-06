import { type Ranking } from '@school-allocation/school-core'
import { type Caller } from '../actor.ts'
import type { Queryable } from '../db.ts'
import type { Campaign } from '../models/campaigns.ts'
import type { CampaignStudent, SaveBy } from '../models/choices.ts'
import { campaignRosterBatch, CURRENT_BATCH_ID } from './roster-selection.ts'

/** The students of the campaign: those of its classes in the roster it goes by, or of one class of them. */
export async function campaignStudents(db: Queryable, campaign: Pick<Campaign, 'id' | 'rosterBatchId'>, className?: string): Promise<CampaignStudent[]> {
  const { rows } = await db.query<{ person_id: string, display_name: string, class_name: string, grade: number, address: string | null }>(
    `select e.person_id, e.display_name, e.class_name, e.grade, coalesce(e.mail, e.upn) as address
       from roster_entry e
       join campaign_class cc on cc.campaign_id = $2 and cc.class_name = e.class_name
      where e.batch_id = ${campaignRosterBatch(campaign)} and e.kind = 'student' and e.person_id is not null
        and e.grade is not null and ($1::text is null or e.class_name = $1)
      order by e.class_name, e.display_name`,
    [className ?? null, campaign.id],
  )
  return rows.map((row) => ({ personId: row.person_id, displayName: row.display_name, className: row.class_name, grade: row.grade, address: row.address }))
}

/** One student of the campaign by person id; undefined when the roster does not list them as a student of one of its classes. */
export async function campaignStudent(db: Queryable, campaign: Pick<Campaign, 'id' | 'rosterBatchId'>, personId: string): Promise<CampaignStudent | undefined> {
  const { rows: [row] } = await db.query<{ display_name: string, class_name: string, grade: number, address: string | null }>(
    `select e.display_name, e.class_name, e.grade, coalesce(e.mail, e.upn) as address from roster_entry e
       join campaign_class cc on cc.campaign_id = $2 and cc.class_name = e.class_name
      where e.batch_id = ${campaignRosterBatch(campaign)} and e.kind = 'student' and e.person_id = $1 and e.grade is not null`,
    [personId, campaign.id],
  )
  return row === undefined ? undefined : { personId, displayName: row.display_name, className: row.class_name, grade: row.grade, address: row.address }
}

/** Which of the campaigns `ids` the person is a student of, each judged by its own roster: a class of theirs in it takes part. */
export async function memberCampaignIds(db: Queryable, personId: string, ids: readonly string[]): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `select c.id from campaign c
       join roster_entry e on e.batch_id = coalesce(c.roster_batch_id, ${CURRENT_BATCH_ID}) and e.kind = 'student' and e.person_id = $1
       join campaign_class cc on cc.campaign_id = c.id and cc.class_name = e.class_name
      where c.id = any($2::uuid[])`,
    [personId, ids],
  )
  return rows.map((row) => row.id)
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
  // A class placement alone: a direct placement is taken back by its activity's teachers, not exempted from.
  const { rows: [row] } = await db.query<{ exempted_at: Date | null }>(
    'select exempted_at from pre_assignment where campaign_id = $1 and person_id = $2 and item_id = $3 and source = \'class\' for update', [campaign.id, personId, itemId],
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

/** The students of a campaign's classes a teacher finds by a part of their name or by their class: the name and the class, nothing else. */
export async function searchCampaignStudents(db: Queryable, campaign: Pick<Campaign, 'id' | 'rosterBatchId'>, q: string): Promise<{ personId: string, displayName: string, className: string }[]> {
  const pattern = `%${q.replaceAll(/[\\%_]/g, (c) => `\\${c}`)}%`
  const { rows } = await db.query<{ person_id: string, display_name: string, class_name: string }>(
    `select e.person_id, e.display_name, e.class_name
       from roster_entry e
       join campaign_class cc on cc.campaign_id = $1 and cc.class_name = e.class_name
      where e.batch_id = ${campaignRosterBatch(campaign)} and e.kind = 'student' and e.person_id is not null and e.grade is not null
        and (e.display_name ilike $2 or e.class_name ilike $2)
      order by e.class_name, e.display_name limit 30`,
    [campaign.id, pattern],
  )
  return rows.map((row) => ({ personId: row.person_id, displayName: row.display_name, className: row.class_name }))
}
