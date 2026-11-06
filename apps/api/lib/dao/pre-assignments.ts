import type { Queryable } from '../db.ts'
import type { Campaign } from '../models/campaigns.ts'
import { CAMPAIGN_BATCH_ID, campaignRosterBatch } from './roster-selection.ts'

export async function insertClassPlacements(db: Queryable, campaignId: string, itemId: string | undefined) {
  const { rowCount } = await db.query(
    `insert into pre_assignment (campaign_id, item_id, person_id, source)
     select i.campaign_id, i.id, e.person_id, 'class'
       from catalog_item i
       join roster_entry e on e.batch_id = ${CAMPAIGN_BATCH_ID} and e.kind = 'student' and e.person_id is not null and e.class_name = any(i.fixed_classes)
       join campaign_class cc on cc.campaign_id = i.campaign_id and cc.class_name = e.class_name
      where i.campaign_id = $1 and i.state = 'approved' and ($2::uuid is null or i.id = $2)
     on conflict do nothing`,
    [campaignId, itemId ?? null],
  )
  return rowCount ?? 0
}

export async function deleteObsoletePlacements(db: Queryable, campaignId: string, itemId: string | undefined) {
  const { rowCount } = await db.query(
    `delete from pre_assignment p
      where p.campaign_id = $1 and ($2::uuid is null or p.item_id = $2) and p.exempted_at is null and p.source = 'class'
        and not exists (select 1 from roster_entry e join catalog_item i on i.id = p.item_id
                           join campaign_class cc on cc.campaign_id = p.campaign_id and cc.class_name = e.class_name
                         where e.batch_id = ${CAMPAIGN_BATCH_ID} and e.person_id = p.person_id and i.state = 'approved' and e.class_name = any(i.fixed_classes))`,
    [campaignId, itemId ?? null],
  )
  return rowCount ?? 0
}

export async function listOpenCampaigns(db: Queryable) {
  const { rows } = await db.query<{ id: string }>('select id from campaign where state in (\'open\', \'grace\') and roster_batch_id is null order by created_at')
  return rows.map((row) => ({ id: row.id }))
}

export async function lockOpenCampaign(db: Queryable, id: string) {
  const { rowCount } = await db.query('select 1 from campaign where id = $1 and state in (\'open\', \'grace\') and roster_batch_id is null for update', [id])
  return rowCount ?? 0
}

/** A placement as stored: by class (with whether the student was taken out of it) or direct (with whether it takes the student out of their class activities of that time). */
export interface PlacementRecord {
  itemId: string
  personId: string
  source: 'class' | 'direct'
  exempted: boolean
  leavesClass: boolean
}

/** The placements of a campaign, or of one student in it, whatever the state of their activities; the reader says which activities count. */
export async function listPlacements(db: Queryable, campaignId: string, personId?: string): Promise<PlacementRecord[]> {
  const { rows } = await db.query<{ item_id: string, person_id: string, source: 'class' | 'direct', exempted: boolean, leaves_class: boolean }>(
    `select item_id, person_id, source, exempted_at is not null as exempted, leaves_class
       from pre_assignment
      where campaign_id = $1 and source in ('class', 'direct') and ($2::uuid is null or person_id = $2)
      order by person_id, item_id`,
    [campaignId, personId ?? null],
  )
  return rows.map((row) => ({ itemId: row.item_id, personId: row.person_id, source: row.source, exempted: row.exempted, leavesClass: row.leaves_class }))
}

/** A student placed directly into an activity, or the say of an existing direct placement changed; false when the row there is not a direct one. */
export async function upsertDirectPlacement(db: Queryable, campaignId: string, itemId: string, personId: string, leavesClass: boolean): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into pre_assignment (campaign_id, item_id, person_id, source, leaves_class) values ($1, $2, $3, 'direct', $4)
     on conflict (campaign_id, item_id, person_id) do update set leaves_class = excluded.leaves_class where pre_assignment.source = 'direct'`,
    [campaignId, itemId, personId, leavesClass],
  )
  return rowCount === 1
}

/** A student's direct placements in `itemIds` removed; how many there were. */
export async function deleteDirectPlacements(db: Queryable, campaignId: string, itemIds: readonly string[], personId: string): Promise<number> {
  const { rowCount } = await db.query('delete from pre_assignment where campaign_id = $1 and item_id = any($2::uuid[]) and person_id = $3 and source = \'direct\'', [campaignId, itemIds, personId])
  return rowCount ?? 0
}

/** The placement of a student in an activity, locked: what an exemption or its lifting decides on. */
export async function lockPlacement(db: Queryable, campaignId: string, itemId: string, personId: string) {
  const { rows: [row] } = await db.query<{ source: string, exempted: boolean }>(
    'select source, exempted_at is not null as exempted from pre_assignment where campaign_id = $1 and item_id = $2 and person_id = $3 for update', [campaignId, itemId, personId],
  )
  return row === undefined ? undefined : { source: row.source, exempted: row.exempted }
}

/** A student taken out of a class activity before its class placements are written: the row a later opening leaves as it is. */
export async function insertExemptedPlacement(db: Queryable, campaignId: string, itemId: string, personId: string, userId: string) {
  await db.query(
    'insert into pre_assignment (campaign_id, item_id, person_id, source, exempted_at, exempted_by) values ($1, $2, $3, \'class\', app_now(), $4)',
    [campaignId, itemId, personId, userId],
  )
}

/** A class placement that holds marked as left, without a reason: nobody gives one for not coming along. */
export async function exemptPlacement(db: Queryable, campaignId: string, itemId: string, personId: string, userId: string) {
  await db.query(
    'update pre_assignment set exempted_at = app_now(), exempted_by = $4 where campaign_id = $1 and item_id = $2 and person_id = $3 and source = \'class\' and exempted_at is null',
    [campaignId, itemId, personId, userId],
  )
}

/** An exemption lifted whole: the student is in the class activity again. */
export async function liftExemption(db: Queryable, campaignId: string, itemId: string, personId: string) {
  await db.query(
    'update pre_assignment set exempted_at = null, exempted_by = null, exempt_reason = null where campaign_id = $1 and item_id = $2 and person_id = $3 and source = \'class\'',
    [campaignId, itemId, personId],
  )
}

/** A class placement that holds removed: before the window opens there are none, so a lifted exemption leaves no row behind. */
export async function deleteClassPlacement(db: Queryable, campaignId: string, itemId: string, personId: string) {
  await db.query('delete from pre_assignment where campaign_id = $1 and item_id = $2 and person_id = $3 and source = \'class\' and exempted_at is null', [campaignId, itemId, personId])
}

/** Everything placed into or taken out of an activity that is being deleted as a draft: exemptions lifted, then every row gone. */
export async function deleteItemPlacements(db: Queryable, itemId: string) {
  await db.query('update pre_assignment set exempted_at = null, exempted_by = null, exempt_reason = null where item_id = $1 and exempted_at is not null', [itemId])
  await db.query('delete from pre_assignment where item_id = $1 and source in (\'class\', \'direct\')', [itemId])
}

/**
 * Per activity of a campaign, how many of the campaign's students are
 * placed into it directly: each takes one of its places. Its students as
 * every reader takes them (dao/choices.ts campaignStudents): of its roster,
 * in a class taking part, and not of a class the activity takes as a
 * whole (such a student is in it with their class, which takes no place).
 * A placement of someone who has left counts for nothing, here as in the
 * run (lib/placements.ts directlyPlaced).
 */
export async function directCounts(db: Queryable, campaign: Pick<Campaign, 'id' | 'rosterBatchId'>): Promise<Map<string, number>> {
  const { rows } = await db.query<{ item_id: string, placed: string }>(
    `select p.item_id, count(*) as placed
       from pre_assignment p
       join roster_entry e on e.batch_id = ${campaignRosterBatch(campaign)} and e.kind = 'student' and e.person_id = p.person_id and e.grade is not null
       join campaign_class cc on cc.campaign_id = p.campaign_id and cc.class_name = e.class_name
       join catalog_item i on i.id = p.item_id
      where p.campaign_id = $1 and p.source = 'direct' and not (e.class_name = any(i.fixed_classes))
      group by p.item_id`,
    [campaign.id],
  )
  return new Map(rows.map((row) => [row.item_id, Number(row.placed)]))
}
