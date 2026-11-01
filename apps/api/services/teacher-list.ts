// The teacher list a school uploads: the abbreviations its teachers go by
// and who is class teacher of which class, from one CSV instead of a form
// per class. Read by school-core, matched here against the roster in
// force, shown as what it would change, applied in one transaction under
// the school's lock.

import { createHash } from 'node:crypto'
import type { TeacherListApplied, TeacherListPreview } from '@school-allocation/api-contracts/settings'
import { parseTeacherCsv, type TeacherCsvRow } from '@school-allocation/school-core'
import type { Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import { currentSchoolYear, listClasses } from '../lib/dao/class-teachers.ts'
import * as store from '../lib/dao/teacher-detail.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError, TeacherListInvalid } from '../lib/errors.ts'
import { replaceClassTeachersIn } from './class-teachers.ts'

/** The rows that matched, grouped for the writing: per person the abbreviation, per class its teachers. */
interface Resolved {
  preview: TeacherListPreview
  details: Map<string, { shortName: string }>
  classes: Map<string, string[]>
}

/** What the list would do against the roster in force; `applicable` says whether apply would take it. */
export async function previewTeacherList(db: Queryable, csv: string): Promise<TeacherListPreview> {
  return (await resolve(db, csv)).preview
}

/** Applies the list: the abbreviations, then every class it names gets exactly the class teachers it lists. */
export async function applyTeacherList(db: Database, csv: string, actor: Actor): Promise<TeacherListApplied> {
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const schoolYear = await currentSchoolYear(client)
    if (schoolYear === undefined) throw new ApplicationError('no_roster')
    const { preview, details, classes } = await resolve(client, csv)
    if (preview.fileProblems.length > 0) throw new ApplicationError('csv_invalid', preview.fileProblems.map((p) => `${p.code}${p.line === undefined ? '' : ` (line ${p.line})`}`).join('; '))
    if (!preview.applicable) throw new TeacherListInvalid(preview.problems)
    const current = await store.readDetails(client, [...details.keys()])
    // Released first, then given: two teachers exchanging their abbreviations would otherwise meet the unique index.
    for (const [personId] of details) await store.writeDetail(client, personId, { shortName: null, note: current.get(personId)?.note ?? null })
    for (const [personId, { shortName }] of details) await store.writeDetail(client, personId, { shortName, note: current.get(personId)?.note ?? null })
    let classesChanged = 0
    for (const [className, personIds] of classes) {
      const change = preview.classes.find((c) => c.className === className)
      if (change && sameTeachers(change.before, change.after)) continue
      await replaceClassTeachersIn(client, schoolYear, className, personIds, actor)
      classesChanged++
    }
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'class.teachers-imported',
      metadata: { schoolYear, sha256: createHash('sha256').update(csv).digest('hex'), teachers: preview.teachers.length, shortNames: details.size, classes: classesChanged },
    })
    return { classes: await listClasses(client), teachers: preview.teachers.length, shortNames: details.size, classesChanged }
  })
}

/** Whether two lists name the same people, whatever their order or names. */
function sameTeachers(a: readonly { personId: string }[], b: readonly { personId: string }[]): boolean {
  const ids = (list: readonly { personId: string }[]) => [...new Set(list.map((x) => x.personId))].sort().join('\n')
  return ids(a) === ids(b)
}

async function resolve(db: Queryable, csv: string): Promise<Resolved> {
  const parsed = parseTeacherCsv(csv)
  const preview: TeacherListPreview = { fileProblems: parsed.fileProblems, problems: [...parsed.problems], ignoredColumns: parsed.ignoredColumns, teachers: [], classes: [], applicable: false }
  const details = new Map<string, { shortName: string }>()
  const classes = new Map<string, string[]>()
  if (parsed.fileProblems.length > 0) return { preview, details, classes }
  const found = await store.findTeachersByAddress(db, [...new Set(parsed.rows.map((row) => row.email))])
  const known = await store.knownClasses(db)
  const rows: (TeacherCsvRow & { personId: string, displayName: string })[] = []
  for (const row of parsed.rows) {
    const teacher = found.get(row.email)
    if (teacher === undefined) {
      preview.problems.push({ code: 'teacher_unknown', line: row.line, key: row.email })
      continue
    }
    if (row.className !== undefined && !known.has(row.className)) {
      preview.problems.push({ code: 'class_unknown', line: row.line, key: row.className })
      continue
    }
    rows.push({ ...row, ...teacher })
  }
  // An abbreviation already held by someone the file does not rename is not taken from them.
  const wanted = new Map(rows.filter((row) => row.shortName !== undefined).map((row) => [row.personId, row.shortName as string]))
  const owners = await store.shortNameOwners(db, [...new Set([...wanted.values()].map((name) => name.toLowerCase()))])
  for (const row of rows) {
    if (row.shortName === undefined) continue
    const owner = owners.get(row.shortName.toLowerCase())
    if (owner !== undefined && owner !== row.personId && !wanted.has(owner)) {
      preview.problems.push({ code: 'short_name_held', line: row.line, key: row.shortName })
      wanted.delete(row.personId)
    }
  }
  const current = await store.readDetails(db, [...new Set(rows.map((row) => row.personId))])
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.personId)) continue
    seen.add(row.personId)
    const after = wanted.get(row.personId)
    const before = current.get(row.personId)?.shortName ?? null
    if (after !== undefined) details.set(row.personId, { shortName: after })
    preview.teachers.push({ personId: row.personId, displayName: row.displayName, email: row.email, shortName: after === undefined || after === before ? null : { before, after } })
  }
  for (const row of rows) {
    if (row.className === undefined) continue
    const list = classes.get(row.className) ?? []
    if (!list.includes(row.personId)) list.push(row.personId)
    classes.set(row.className, list)
  }
  if (classes.size > 0) {
    const names = new Map(rows.map((row) => [row.personId, row.displayName]))
    const all = await listClasses(db)
    for (const [className, personIds] of classes) {
      const assigned = all.find((c) => c.className === className)?.teachers.filter((t) => t.source === 'app') ?? []
      const byName = (x: { displayName: string }, y: { displayName: string }) => x.displayName.localeCompare(y.displayName, 'de')
      preview.classes.push({
        className,
        before: assigned.map((t) => ({ personId: t.personId, displayName: t.displayName })).sort(byName),
        after: personIds.map((id) => ({ personId: id, displayName: names.get(id) ?? id })).sort(byName),
      })
    }
  }
  preview.applicable = preview.problems.length === 0 && rows.length > 0
  return { preview, details, classes }
}
