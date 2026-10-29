// The school's settings that are not a campaign's: the period grid (D-25),
// read by everyone who places or reads a session, replaced as a whole by
// an administrator, audited in the school scope.

import { checkPeriods, type Period } from '@school-allocation/school-core'
import { type Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import * as store from '../lib/dao/settings.ts'
import { readPeriods } from '../lib/dao/settings.ts'
import type { Database } from '../lib/db.ts'
import { PeriodsInvalid } from '../lib/errors.ts'

/** Replaces the grid with `periods`, which must pass school-core's check; audited. */
export async function replacePeriods(db: Database, periods: readonly Period[], actor: Actor): Promise<Period[]> {
  const problems = checkPeriods(periods)
  if (problems.length > 0) throw new PeriodsInvalid(problems)
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    await store.deletePeriods(client)
    for (const period of periods) {
      await store.insertPeriod(client, period)
    }
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'settings.periods-changed',
      metadata: { periods: periods.length, first: periods[0]?.starts ?? '', last: periods.at(-1)?.ends ?? '' },
    })
  })
  return readPeriods(db)
}

/** The grid offered to signed-in people by the settings page. */
export async function periodSettings(db: Database) {
  return { periods: await readPeriods(db) }
}
