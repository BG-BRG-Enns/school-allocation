import type { Queryable } from '../db.ts'
import { CAMPAIGN_BATCH_ID } from './roster-selection.ts'

export async function insertClassPlacements(db: Queryable, campaignId: string, itemId: string | undefined) {
  const { rowCount } = await db.query(
    `insert into pre_assignment (campaign_id, item_id, person_id, source)
     select i.campaign_id, i.id, e.person_id, 'class'
       from catalog_item i
       join roster_entry e on e.batch_id = ${CAMPAIGN_BATCH_ID} and e.kind = 'student' and e.person_id is not null and e.class_name = any(i.fixed_classes)
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
