// The class teachers (D-17): who is responsible for which class in the
// roster's school year, assigned in the app by an administrator or an
// organizer, audited, or named by address in a CSV roster. A class
// teacher sees their class's state in a campaign and places its unplaced
// students (S3b); here, who they are.

import { appendAudit, lockScope, SCHOOL_SCOPE } from './audit.ts'
import type { Database, Queryable } from './db.ts'
import { RosterConflict, type Actor } from './roster.ts'

export interface ClassTeacher {
  personId: string
  displayName: string
  /** `app` when assigned here, `roster` when the CSV roster names them by address. */
  source: 'app' | 'roster'
}

export interface ClassWithTeachers {
  className: string
  grade: number
  students: number
  teachers: ClassTeacher[]
}

/** The current school year: the one of the roster in force; undefined without a roster. */
export async function currentSchoolYear(db: Queryable): Promise<string | undefined> {
  const { rows: [row] } = await db.query<{ school_year: string }>(
    'select school_year from import_batch where state = \'committed\' order by decided_at desc limit 1',
  )
  return row?.school_year
}

const CURRENT_BATCH = '(select id from import_batch where state = \'committed\' order by decided_at desc limit 1)'

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
         from roster_entry e where e.batch_id = ${CURRENT_BATCH} and e.kind = 'student' and e.class_name is not null and e.grade is not null
        group by e.class_name, e.grade),
     teachers as (
       select e.person_id, e.display_name, lower(e.mail) as mail, lower(e.upn) as upn
         from roster_entry e where e.batch_id = ${CURRENT_BATCH} and e.kind = 'teacher' and e.person_id is not null)
     select s.class_name, s.grade, s.students::text as students,
            coalesce((select json_agg(json_build_object('personId', t.person_id, 'displayName', t.display_name, 'source', t.source) order by t.display_name)
                        from (select a.person_id, t.display_name, 'app' as source
                                from class_teacher a join teachers t on t.person_id = a.person_id
                               where a.school_year = $1 and a.class_name = s.class_name and a.revoked_at is null
                              union
                              select t.person_id, t.display_name, 'roster' as source
                                from teachers t
                               where t.mail = any(s.kv_mails) or t.upn = any(s.kv_mails)) t), '[]') as teachers
       from students s
      order by s.grade, s.class_name`,
    [schoolYear],
  )
  return rows.map((row) => ({ className: row.class_name, grade: row.grade, students: Number(row.students), teachers: row.teachers }))
}

/**
 * Sets the teachers assigned in the app to a class of the roster in force:
 * assignments not in `personIds` are revoked, missing ones made, audited.
 * The persons must be teachers of the roster; the class one of its classes.
 */
export async function replaceClassTeachers(db: Database, className: string, personIds: readonly string[], actor: Actor): Promise<void> {
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const schoolYear = await currentSchoolYear(client)
    if (schoolYear === undefined) throw new RosterConflict('no_roster')
    const { rows: [known] } = await client.query<{ n: string }>(
      `select count(*)::text as n from roster_entry e where e.batch_id = ${CURRENT_BATCH} and e.kind = 'student' and e.class_name = $1`, [className],
    )
    if (known?.n === '0') throw new RosterConflict('class_unknown')
    const wanted = [...new Set(personIds)]
    const { rows: teachers } = await client.query<{ person_id: string }>(
      `select e.person_id from roster_entry e where e.batch_id = ${CURRENT_BATCH} and e.kind = 'teacher' and e.person_id = any($1::uuid[])`, [wanted],
    )
    if (teachers.length !== wanted.length) throw new RosterConflict('teacher_unknown')
    const { rows: current } = await client.query<{ id: string, person_id: string }>(
      'select id, person_id from class_teacher where school_year = $1 and class_name = $2 and revoked_at is null', [schoolYear, className],
    )
    const have = new Set(current.map((row) => row.person_id))
    for (const row of current) {
      if (!wanted.includes(row.person_id)) await client.query('update class_teacher set revoked_at = now(), revoked_by = $2 where id = $1', [row.id, actor.id])
    }
    for (const personId of wanted) {
      if (!have.has(personId)) {
        await client.query('insert into class_teacher (school_year, class_name, person_id, assigned_by) values ($1, $2, $3, $4)', [schoolYear, className, personId, actor.id])
      }
    }
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'class.teachers-changed',
      metadata: { schoolYear, className, teachers: wanted.length },
    })
  })
}

/** The students of a class in the roster in force, for its class teacher's page. */
export interface ClassStudent {
  personId: string
  displayName: string
}

export async function classStudents(db: Queryable, className: string): Promise<ClassStudent[]> {
  const { rows } = await db.query<{ person_id: string, display_name: string }>(
    `select e.person_id, e.display_name from roster_entry e
      where e.batch_id = ${CURRENT_BATCH} and e.kind = 'student' and e.class_name = $1 and e.person_id is not null
      order by e.display_name`,
    [className],
  )
  return rows.map((row) => ({ personId: row.person_id, displayName: row.display_name }))
}
