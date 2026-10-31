import { type Period } from '@school-allocation/school-core'
import { type Actor } from '../actor.ts'
import type { Queryable } from '../db.ts'

export async function readPeriods(db: Queryable): Promise<Period[]> {
  const { rows } = await db.query<{ period: number, starts: string, ends: string }>(
    'select period, to_char(starts, \'HH24:MI\') as starts, to_char(ends, \'HH24:MI\') as ends from period_grid order by period',
  )
  return rows.map((row) => ({ period: row.period, starts: row.starts, ends: row.ends }))
}

export async function deletePeriods(db: Queryable) {
  await db.query('delete from period_grid')
}

export async function insertPeriod(db: Queryable, period: Period) {
  await db.query('insert into period_grid (period, starts, ends) values ($1, $2::time, $3::time)', [period.period, period.starts, period.ends])
}

/** The school's language as stored; undefined without the row. The caller checks it against the catalogue's. */
export async function readLocale(db: Queryable): Promise<string | undefined> {
  const { rows } = await db.query<{ locale: string }>('select locale from school_setting')
  return rows[0]?.locale
}

export async function updateLocale(db: Queryable, locale: string, actor: Actor) {
  await db.query('update school_setting set locale = $1, updated_at = app_now(), updated_by = $2', [locale, actor.id])
}
