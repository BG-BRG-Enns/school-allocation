// The school's settings that are not a campaign's: the period grid (D-25),
// read by everyone who places or reads a session, replaced as a whole by
// an administrator, audited in the school scope.

import { checkPeriods, type Period, type PeriodProblemCode } from '@school-allocation/school-core'
import { appendAudit, lockScope, SCHOOL_SCOPE } from './audit.ts'
import type { Database, Queryable } from './db.ts'
import type { Actor } from './roster.ts'

/** The grid as entered breaks the rules; the codes are school-core's. */
export class PeriodsInvalid extends Error {
  override name = 'PeriodsInvalid'
  readonly problems: PeriodProblemCode[]
  constructor(problems: PeriodProblemCode[]) {
    super('period_grid_invalid')
    this.problems = problems
  }
}

export async function readPeriods(db: Queryable): Promise<Period[]> {
  const { rows } = await db.query<{ period: number, starts: string, ends: string }>(
    'select period, to_char(starts, \'HH24:MI\') as starts, to_char(ends, \'HH24:MI\') as ends from period_grid order by period',
  )
  return rows.map((row) => ({ period: row.period, starts: row.starts, ends: row.ends }))
}

/** Replaces the grid with `periods`, which must pass school-core's check; audited. */
export async function replacePeriods(db: Database, periods: readonly Period[], actor: Actor): Promise<Period[]> {
  const problems = checkPeriods(periods)
  if (problems.length > 0) throw new PeriodsInvalid(problems)
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    await client.query('delete from period_grid')
    for (const period of periods) {
      await client.query('insert into period_grid (period, starts, ends) values ($1, $2::time, $3::time)', [period.period, period.starts, period.ends])
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
