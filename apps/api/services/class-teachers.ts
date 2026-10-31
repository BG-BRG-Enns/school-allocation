// The class teachers (D-17): who is responsible for which class in a
// school year, assigned in the app by an administrator or an organizer,
// audited, or named by address in a CSV roster. A class teacher sees their
// class's state in a campaign, places its unplaced students (S3b) and
// records its attendance (S5b); here, who they are, and for which
// campaign.

import { rosterTeachers } from '../lib/dao/campaigns.ts'

import { type Actor, type Caller } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import * as store from '../lib/dao/class-teachers.ts'
import { currentSchoolYear } from '../lib/dao/class-teachers.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import { isTeacher } from '../lib/policies.ts'

/**
 * The classes the caller is class teacher of in the campaign's school
 * year, the year of the roster its students come from: a teacher of the
 * roster in force (a binding outlives the roster, the right does not),
 * class teacher of the class in that year, assigned in the app or named
 * by the roster's class-teacher address. Class teachers are base data of
 * a school year, the same for every campaign of it; a class name recurs
 * every year, so this year's class teacher of 5A has no right to an
 * earlier 5A. The year is read from the roster the campaign goes by, not
 * from its settings: a campaign still following the roster in force shows
 * that roster's students, and its class teachers are that roster's year's.
 * Every class page, workbook and recording asks this, never a list made
 * for the roster in force.
 */
export async function classTeacherOf(db: Queryable, campaign: Pick<Campaign, 'rosterBatchId'>, caller: Caller): Promise<string[]> {
  if (!isTeacher(caller) || caller.person === null) return []
  return store.classesTaught(db, campaign, caller.person.id)
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
