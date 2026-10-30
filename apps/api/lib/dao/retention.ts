import type { Queryable } from '../db.ts'

/** A school year as the records know it: its campaigns, how many roster batches and class-teacher rows it has. */
export interface SchoolYearRecords {
  schoolYear: string
  campaigns: { id: string, name: string, state: string }[]
  batches: number
  classTeachers: number
}

/** Every school year any record names, newest first. */
export async function schoolYearRecords(db: Queryable): Promise<SchoolYearRecords[]> {
  const { rows } = await db.query<{ school_year: string, campaigns: { id: string, name: string, state: string }[], batches: string, class_teachers: string }>(
    `with years as (select school_year from campaign union select school_year from import_batch union select school_year from class_teacher)
     select y.school_year,
            coalesce((select json_agg(json_build_object('id', c.id, 'name', c.name, 'state', c.state) order by c.created_at) from campaign c where c.school_year = y.school_year), '[]') as campaigns,
            (select count(*) from import_batch b where b.school_year = y.school_year) as batches,
            (select count(*) from class_teacher t where t.school_year = y.school_year) as class_teachers
       from years y order by y.school_year desc`,
  )
  return rows.map((row) => ({ schoolYear: row.school_year, campaigns: row.campaigns, batches: Number(row.batches), classTeachers: Number(row.class_teachers) }))
}

/** The states of the year's campaigns, for the check before the purge; the caller holds the school's lock. */
export async function campaignStatesOf(client: Queryable, schoolYear: string): Promise<string[]> {
  const { rows } = await client.query<{ state: string }>('select state from campaign where school_year = $1', [schoolYear])
  return rows.map((row) => row.state)
}

/** Runs the purge (0010) and returns what it removed, per relation, in order. */
export async function purgeSchoolYear(client: Queryable, schoolYear: string): Promise<{ relation: string, count: number }[]> {
  const { rows } = await client.query<{ relation: string, removed: string }>('select relation, removed from purge_school_year($1)', [schoolYear])
  return rows.map((row) => ({ relation: row.relation, count: Number(row.removed) }))
}
