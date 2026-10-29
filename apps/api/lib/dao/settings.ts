import { type Period } from '@school-allocation/school-core'
import type { Queryable } from '../db.ts'

export async function readPeriods(db: Queryable): Promise<Period[]> {
  const { rows } = await db.query<{ period: number, starts: string, ends: string }>(
    'select period, to_char(starts, \'HH24:MI\') as starts, to_char(ends, \'HH24:MI\') as ends from period_grid order by period',
  )
  return rows.map((row) => ({ period: row.period, starts: row.starts, ends: row.ends }))
}

export function deletePeriods(db: Queryable) {
  return db.query('delete from period_grid')
}

export function insertPeriod(db: Queryable, period: Period) {
  return db.query('insert into period_grid (period, starts, ends) values ($1, $2::time, $3::time)', [period.period, period.starts, period.ends])
}
