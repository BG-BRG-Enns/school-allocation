// The class teachers (D-17): who is responsible for which class in the
// roster's school year, assigned in the app by an administrator or an
// organizer, audited, or named by address in a CSV roster. A class
// teacher sees their class's state in a campaign and places its unplaced
// students (S3b); here, who they are.

import { rosterTeachers } from '../lib/dao/campaigns.ts'

import { type Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import * as store from '../lib/dao/class-teachers.ts'
import { currentSchoolYear } from '../lib/dao/class-teachers.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'

/**
 * Sets the teachers assigned in the app to a class of the roster in force:
 * assignments not in `personIds` are revoked, missing ones made, audited.
 * The persons must be teachers of the roster; the class one of its classes.
 */
export async function replaceClassTeachers(db: Database, className: string, personIds: readonly string[], actor: Actor): Promise<void> {
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const schoolYear = await currentSchoolYear(client)
    if (schoolYear === undefined) throw new ApplicationError('no_roster')
    const known = await store.countClassStudents(client, className)
    if (known === 0) throw new ApplicationError('class_unknown')
    const wanted = [...new Set(personIds)]
    const teachers = await store.findRosterTeachers(client, wanted)
    if (teachers.length !== wanted.length) throw new ApplicationError('teacher_unknown')
    const current = await store.listAssignments(client, schoolYear, className)
    const have = new Set(current.map((row) => row.personId))
    for (const row of current) {
      if (!wanted.includes(row.personId)) await store.revokeAssignment(client, row, actor)
    }
    for (const personId of wanted) {
      if (!have.has(personId)) {
        await store.insertAssignment(client, schoolYear, className, personId, actor)
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

export async function classDirectory(db: Database) {
  return { classes: await store.listClasses(db) }
}

export async function teacherDirectory(db: Database, query: string | undefined) {
  return { teachers: await rosterTeachers(db, query?.trim() ?? '') }
}
