// Keeping the placements by class true to the catalogue and the roster
// (D-24): the students of every class an approved item is fixed for are
// placed into it, and a placement by class goes when its class is no
// longer fixed or its student no longer in that class. Called when the
// window opens, when an organizer changes an approved item's fixed
// classes while it is open, and when a roster is committed meanwhile. An
// organizer's exemption is a decision and stays whatever happens around it.

import { lockScope } from '../lib/audit.ts'
import * as store from '../lib/dao/pre-assignments.ts'
import type { Queryable } from '../lib/db.ts'

/**
 * Reconciles the placements of a campaign's approved items, or of one
 * item of it; returns how many were added and how many went.
 */
export async function reconcilePreAssignments(client: Queryable, campaignId: string, itemId?: string): Promise<{ placed: number, removed: number }> {
  const placed = await store.insertClassPlacements(client, campaignId, itemId)
  const removed = await store.deleteObsoletePlacements(client, campaignId, itemId)
  return { placed, removed }
}

/**
 * After a roster commit: every campaign whose window is open on the roster
 * in force follows it. Each under its own lock, its state read again there,
 * so a close in flight (which freezes the previous roster) and this never
 * cross: the one that takes the lock first decides what the other sees.
 */
export async function reconcileOpenCampaigns(client: Queryable): Promise<number> {
  const rows = await store.listOpenCampaigns(client)
  let reconciled = 0
  for (const { id } of rows) {
    await lockScope(client, id)
    const affected = await store.lockOpenCampaign(client, id)
    if (!affected) continue
    await reconcilePreAssignments(client, id)
    reconciled += 1
  }
  return reconciled
}
