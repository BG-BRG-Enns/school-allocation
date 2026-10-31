// The retention purge (docs/open-decisions.md D-15; mvp-plan S5c): an
// administrator removes the records of a school year once a year has
// passed since its end, every campaign of it archived, with a reason;
// audited in the school scope with the counts. The deletion itself is the
// database's definer function (purge_school_year), the one path through the guards; the
// teachers' availability on the year's dates, which no guard keeps, goes
// first, in the same transaction.
// Nothing is deleted automatically.

import { isSchoolYear, retentionEndsAt } from '@school-allocation/school-core'
import type { RetentionYear } from '@school-allocation/api-contracts/retention'
import type { Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import * as store from '../lib/dao/retention.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'

/** Whether the records of the school year may be purged at `now` (D-15). */
export function retentionReached(schoolYear: string, now: Date): boolean {
  return now.getTime() >= Date.parse(retentionEndsAt(schoolYear))
}

/** Every school year with records, newest first, and whether its retention has passed at `now`. */
export async function retentionOverview(db: Database, now = db.now()): Promise<RetentionYear[]> {
  return (await store.schoolYearRecords(db)).map((year) => ({ ...year, retentionEndsAt: retentionEndsAt(year.schoolYear), reached: retentionReached(year.schoolYear, now) }))
}

/**
 * Purges a school year: its retention passed, every campaign of it
 * archived, something of it there to remove. Under the school's lock, so
 * no import or grant runs alongside; the audit event names the year, the
 * reason and what went.
 */
export async function purgeSchoolYear(db: Database, schoolYear: string, reason: string, actor: Actor, now = db.now()): Promise<{ relation: string, count: number }[]> {
  if (!isSchoolYear(schoolYear)) throw new ApplicationError('invalid_school_year')
  if (!retentionReached(schoolYear, now)) throw new ApplicationError('retention_not_reached')
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const states = await store.campaignStatesOf(client, schoolYear)
    if (states.some((state) => state !== 'archived')) throw new ApplicationError('campaign_state')
    const records = (await store.schoolYearRecords(client)).find((year) => year.schoolYear === schoolYear)
    if (!records) throw new ApplicationError('not_found')
    const availability = await store.purgeAvailability(client, schoolYear)
    const removed = [{ relation: 'teacher_availability', count: availability }, ...await store.purgeSchoolYear(client, schoolYear)]
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE, actor: { tid: actor.tid, oid: actor.oid, name: actor.name }, action: 'retention.purged',
      metadata: { schoolYear, reason, removed: Object.fromEntries(removed.map((r) => [r.relation, r.count])) },
    })
    return removed
  })
}
