// The teacher list as it stands, as a CSV the school edits and uploads
// again: every teacher of the roster in force with the abbreviation known
// and a row per class they are class teacher of in the app (the roster's
// own class-teacher column is the roster's, not this file's). Without a
// roster, the template with its example rows; with one, never them.

import { TEACHER_CSV_TEMPLATE } from '@school-allocation/school-core'
import { currentSchoolYear, listClasses } from '../lib/dao/class-teachers.ts'
import { rosterTeacherAddresses } from '../lib/dao/teacher-detail.ts'
import type { Queryable } from '../lib/db.ts'

/**
 * A CSV field: quoted when it holds the separator, a quote or a line break
 * (RFC 4180); a value a spreadsheet would read as a formula gets an
 * apostrophe first, so it stays text when opened (an abbreviation cannot
 * start so, but the file is opened in a spreadsheet by design).
 */
function field(value: string): string {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export async function teacherListTemplate(db: Queryable): Promise<string> {
  // The example rows only without a roster; a roster without an addressable teacher gives the header alone.
  if (await currentSchoolYear(db) === undefined) return TEACHER_CSV_TEMPLATE
  const teachers = await rosterTeacherAddresses(db)
  const classesOf = new Map<string, string[]>()
  for (const c of await listClasses(db)) {
    for (const teacher of c.teachers) {
      if (teacher.source !== 'app') continue
      classesOf.set(teacher.personId, [...(classesOf.get(teacher.personId) ?? []), c.className])
    }
  }
  const lines = ['email;short_name;class']
  for (const teacher of teachers) {
    const classes = classesOf.get(teacher.personId) ?? ['']
    for (const className of classes) lines.push([teacher.address, teacher.shortName ?? '', className].map(field).join(';'))
  }
  return `${lines.join('\r\n')}\r\n`
}
