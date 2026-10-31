import type { AvailabilityStatus } from '@school-allocation/school-core'
import type { Queryable } from '../db.ts'
import { CAMPAIGN_BATCH_ID, CURRENT_BATCH_ID } from './roster-selection.ts'

/** A teacher's status on a day other than available; available has no row. */
export interface LimitedDay {
  personId: string
  date: string
  status: Exclude<AvailabilityStatus, 'available'>
}

/** The rows on `days`, of `personIds` only when given. */
export async function limitedDays(db: Queryable, days: readonly string[], personIds?: readonly string[]): Promise<LimitedDay[]> {
  const { rows } = await db.query<{ person_id: string, day: string, status: LimitedDay['status'] }>(
    `select person_id, day::text as day, status from teacher_availability
      where day = any($1::date[]) and ($2::uuid[] is null or person_id = any($2::uuid[]))
      order by day, person_id`,
    [days, personIds ?? null],
  )
  return rows.map((row) => ({ personId: row.person_id, date: row.day, status: row.status }))
}

/** Sets a teacher's status on a day: available removes the row. */
export async function writeAvailability(db: Queryable, personId: string, day: string, status: AvailabilityStatus): Promise<void> {
  if (status === 'available') {
    await db.query('delete from teacher_availability where person_id = $1 and day = $2', [personId, day])
    return
  }
  await db.query(
    `insert into teacher_availability (person_id, day, status) values ($1, $2, $3)
     on conflict (person_id, day) do update set status = excluded.status, updated_at = app_now()`,
    [personId, day, status],
  )
}

/** The registrations taking proposals, with their project days: the days a teacher sets their own availability on. */
export async function campaignsTakingProposals(db: Queryable): Promise<{ id: string, name: string, projectDays: string[] }[]> {
  const { rows } = await db.query<{ id: string, name: string, project_days: string[] }>(
    'select id, name, project_days::text[] as project_days from campaign where state = \'catalogue\' order by created_at',
  )
  return rows.map((row) => ({ id: row.id, name: row.name, projectDays: row.project_days }))
}

/**
 * The teachers of the planning: those of the campaign's roster and anyone
 * one of `itemIds` names, by name: the campaign's roster's, else the
 * current roster's, where an organizer added a teacher after the freeze.
 */
export async function planningTeachers(db: Queryable, campaignId: string, itemIds: readonly string[]): Promise<{ personId: string, displayName: string }[]> {
  const { rows } = await db.query<{ person_id: string, display_name: string }>(
    `with batch as (select ${CAMPAIGN_BATCH_ID} as id),
     named as (
       select e.person_id from roster_entry e, batch where e.batch_id = batch.id and e.kind = 'teacher' and e.person_id is not null
       union
       select t.person_id from item_teacher t where t.item_id = any($2::uuid[])
     )
     select n.person_id,
            coalesce((select e.display_name from roster_entry e, batch where e.batch_id = batch.id and e.person_id = n.person_id),
                     (select e.display_name from roster_entry e where e.batch_id = ${CURRENT_BATCH_ID} and e.person_id = n.person_id), '?') as display_name
       from named n order by 2, 1`,
    [campaignId, itemIds],
  )
  return rows.map((row) => ({ personId: row.person_id, displayName: row.display_name }))
}
