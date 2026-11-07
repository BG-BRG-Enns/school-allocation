// What the sessions of the registrations not yet open credit follows the
// windows of their days (lib/credits.ts): the school's grid and each
// registration's attendance frames. A change of either derives every such
// session's credit again, under the registration's lock, its state read
// again there, so an opening in flight and this never cross: one that has
// opened keeps what its choices compute with. An activity accepted before
// is not checked again against the minimum length (the project lead,
// 2026-11-07): the organization keeps an eye on it, as on a raised minimum.

import type { Period } from '@school-allocation/school-core'
import { lockScope } from '../lib/audit.ts'
import { sessionCredits } from '../lib/credits.ts'
import { findProjectDays, listSessionsBeforeOpening, updateSessionCredits } from '../lib/dao/items.ts'
import type { Queryable } from '../lib/db.ts'

/** Derives the credits of every session of `campaignIds` that has not opened, against `grid`; the caller holds their locks. Returns how many sessions were written. */
export async function recomputeCredits(client: Queryable, campaignIds: readonly string[], grid: readonly Period[]): Promise<number> {
  const sessions = await listSessionsBeforeOpening(client, campaignIds)
  const frames = new Map<string, Awaited<ReturnType<typeof findProjectDays>>>()
  for (const id of campaignIds) frames.set(id, await findProjectDays(client, id))
  for (const session of sessions) {
    await updateSessionCredits(client, session.id, sessionCredits(grid, frames.get(session.campaignId)?.frames ?? {}, session.startsAt, session.endsAt))
  }
  return sessions.length
}

/** The same for the registrations not yet open, each under its lock: what a change of the grid sets off. */
export async function recomputeAllCredits(client: Queryable, campaignIds: readonly string[], grid: readonly Period[]): Promise<number> {
  for (const id of campaignIds) await lockScope(client, id)
  return recomputeCredits(client, campaignIds, grid)
}
