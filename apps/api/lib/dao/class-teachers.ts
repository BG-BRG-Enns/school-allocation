import { type Actor } from '../actor.ts'
import type { Queryable } from '../db.ts'
import type { Campaign } from '../models/campaigns.ts'
import type { ClassStudent, ClassTeacher, ClassWithTeachers } from '../models/class-teachers.ts'
import { campaignRosterBatch, CURRENT_BATCH_ID } from './roster-selection.ts'

/** The current school year: the one of the roster in force; undefined without a roster. */
export async function currentSchoolYear(db: Queryable): Promise<string | undefined> {
  const { rows: [row] } = await db.query<{ school_year: string }>(
    `select school_year from import_batch where id = ${CURRENT_BATCH_ID}`,
  )
  return row?.school_year
}

/**
 * The classes of the roster in force with their teachers: assigned in the
 * app for this school year, or named by the roster's class-teacher address
 * (a teacher of the roster whose address it is).
 */
export async function listClasses(db: Queryable): Promise<ClassWithTeachers[]> {
  const schoolYear = await currentSchoolYear(db)
  if (schoolYear === undefined) return []
  const { rows } = await db.query<{ class_name: string, grade: number, students: string, teachers: ClassTeacher[] }>(
    `with students as (
       select e.class_name, e.grade, count(*) as students, array_remove(array_agg(distinct lower(e.class_teacher_mail)), null) as kv_mails
         from roster_entry e where e.batch_id = ${CURRENT_BATCH_ID} and e.kind = 'student' and e.class_name is not null and e.grade is not null
        group by e.class_name, e.grade),
     teachers as (
       select e.person_id, e.display_name, d.short_name, lower(e.mail) as mail, lower(e.upn) as upn
         from roster_entry e left join teacher_detail d on d.person_id = e.person_id
        where e.batch_id = ${CURRENT_BATCH_ID} and e.kind = 'teacher' and e.person_id is not null)
     select s.class_name, s.grade, s.students::text as students,
            coalesce((select json_agg(json_build_object('personId', t.person_id, 'displayName', t.display_name, 'shortName', t.short_name, 'source', t.source) order by t.display_name)
                        from (select a.person_id, t.display_name, t.short_name, 'app' as source
                                from class_teacher a join teachers t on t.person_id = a.person_id
                               where a.school_year = $1 and a.class_name = s.class_name and a.revoked_at is null
                              union
                              select t.person_id, t.display_name, t.short_name, 'roster' as source
                                from teachers t
                               where t.mail = any(s.kv_mails) or t.upn = any(s.kv_mails)) t), '[]') as teachers
       from students s
      order by s.grade, s.class_name`,
    [schoolYear],
  )
  return rows.map((row) => ({ className: row.class_name, grade: row.grade, students: Number(row.students), teachers: row.teachers }))
}

/**
 * The classes a teacher is class teacher of in the school year of the
 * roster a campaign goes by (the batch frozen at its close, else the one
 * in force): assigned in the app for that year, or named by the
 * class-teacher address of the students in that year's newest committed
 * roster, matched against the teacher's addresses in that same roster.
 * Keyed by the year of the roster the campaign's students come from, so
 * the right and the data are one year's: a class name recurs every year,
 * the right does not.
 */
export async function classesTaught(db: Queryable, campaign: Pick<Campaign, 'rosterBatchId'>, personId: string): Promise<string[]> {
  const { rows } = await db.query<{ c: string }>(
    `with year as (select school_year from import_batch where id = ${campaignRosterBatch(campaign)}),
          batch as (select b.id from import_batch b, year where b.state = 'committed' and b.school_year = year.school_year order by b.decided_at desc limit 1),
          me as (select lower(e.mail) as mail, lower(e.upn) as upn from roster_entry e, batch where e.batch_id = batch.id and e.person_id = $1 and e.kind = 'teacher')
     select distinct c from (
       select a.class_name as c from class_teacher a, year where a.school_year = year.school_year and a.person_id = $1 and a.revoked_at is null
       union
       select s.class_name from roster_entry s, batch, me
        where s.batch_id = batch.id and s.kind = 'student' and s.class_name is not null
          and lower(s.class_teacher_mail) in (me.mail, me.upn)
     ) k order by c`,
    [personId],
  )
  return rows.map((row) => row.c)
}

export async function classStudents(db: Queryable, className: string): Promise<ClassStudent[]> {
  const { rows } = await db.query<{ person_id: string, display_name: string }>(
    `select e.person_id, e.display_name from roster_entry e
      where e.batch_id = ${CURRENT_BATCH_ID} and e.kind = 'student' and e.class_name = $1 and e.person_id is not null
      order by e.display_name`,
    [className],
  )
  return rows.map((row) => ({ personId: row.person_id, displayName: row.display_name }))
}

export async function countClassStudents(db: Queryable, className: string) {
  const { rows: [row] } = await db.query<{ n: string }>(
    `select count(*)::text as n from roster_entry e where e.batch_id = ${CURRENT_BATCH_ID} and e.kind = 'student' and e.class_name = $1`, [className],
  )
  return Number(row?.n ?? 0)
}

export async function findRosterTeachers(db: Queryable, wanted: string[]) {
  const { rows } = await db.query<{ person_id: string }>(
    `select e.person_id from roster_entry e where e.batch_id = ${CURRENT_BATCH_ID} and e.kind = 'teacher' and e.person_id = any($1::uuid[])`, [wanted],
  )
  return rows.map((row) => ({ personId: row.person_id }))
}

export async function listAssignments(db: Queryable, schoolYear: string, className: string) {
  const { rows } = await db.query<{ id: string, person_id: string }>(
    'select id, person_id from class_teacher where school_year = $1 and class_name = $2 and revoked_at is null', [schoolYear, className],
  )
  return rows.map((row) => ({ id: row.id, personId: row.person_id }))
}

export async function revokeAssignment(db: Queryable, row: { id: string, personId: string }, actor: Actor) {
  await db.query('update class_teacher set revoked_at = app_now(), revoked_by = $2 where id = $1', [row.id, actor.id])
}

export async function insertAssignment(db: Queryable, schoolYear: string, className: string, personId: string, actor: Actor) {
  await db.query('insert into class_teacher (school_year, class_name, person_id, assigned_by) values ($1, $2, $3, $4)', [schoolYear, className, personId, actor.id])
}
