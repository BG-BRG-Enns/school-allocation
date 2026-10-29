// Keeping the placements by class true to the catalogue and the roster
// (D-24): the students of every class an approved item is fixed for are
// placed into it, and a placement by class goes when its class is no
// longer fixed or its student no longer in that class. Called when the
// window opens, when an organizer changes an approved item's fixed
// classes while it is open, and when a roster is committed meanwhile. An
// organizer's exemption is a decision and stays whatever happens around it.

import { lockScope } from './audit.ts'
import type { Queryable } from './db.ts'

/** The campaign's roster batch: the one frozen at the close, else the one in force. */
const BATCH = `coalesce((select roster_batch_id from campaign where id = $1), (select id from import_batch where state = 'committed' order by decided_at desc limit 1))`

/**
 * Reconciles the placements of a campaign's approved items, or of one
 * item of it; returns how many were added and how many went.
 */
export async function reconcilePreAssignments(client: Queryable, campaignId: string, itemId?: string): Promise<{ placed: number, removed: number }> {
  const { rowCount: placed } = await client.query(
    `insert into pre_assignment (campaign_id, item_id, person_id, source)
     select i.campaign_id, i.id, e.person_id, 'class'
       from catalog_item i
       join roster_entry e on e.batch_id = ${BATCH} and e.kind = 'student' and e.person_id is not null and e.class_name = any(i.fixed_classes)
      where i.campaign_id = $1 and i.state = 'approved' and ($2::uuid is null or i.id = $2)
     on conflict do nothing`,
    [campaignId, itemId ?? null],
  )
  const { rowCount: removed } = await client.query(
    `delete from pre_assignment p
      where p.campaign_id = $1 and ($2::uuid is null or p.item_id = $2) and p.exempted_at is null and p.source = 'class'
        and not exists (select 1 from roster_entry e join catalog_item i on i.id = p.item_id
                         where e.batch_id = ${BATCH} and e.person_id = p.person_id and i.state = 'approved' and e.class_name = any(i.fixed_classes))`,
    [campaignId, itemId ?? null],
  )
  return { placed: placed ?? 0, removed: removed ?? 0 }
}

/**
 * After a roster commit: every campaign whose window is open on the roster
 * in force follows it. Each under its own lock, its state read again there,
 * so a close in flight (which freezes the previous roster) and this never
 * cross: the one that takes the lock first decides what the other sees.
 */
export async function reconcileOpenCampaigns(client: Queryable): Promise<number> {
  const { rows } = await client.query<{ id: string }>('select id from campaign where state in (\'open\', \'grace\') and roster_batch_id is null order by created_at')
  let reconciled = 0
  for (const { id } of rows) {
    await lockScope(client, id)
    const { rowCount } = await client.query('select 1 from campaign where id = $1 and state in (\'open\', \'grace\') and roster_batch_id is null for update', [id])
    if (!rowCount) continue
    await reconcilePreAssignments(client, id)
    reconciled += 1
  }
  return reconciled
}
