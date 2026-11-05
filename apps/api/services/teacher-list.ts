// The teacher list a school uploads: the abbreviations its teachers go by
// and who is class teacher of which class, from one CSV instead of a form
// per class. Read by school-core, matched here against the roster in
// force, shown as what it would change, applied in one transaction under
// the school's lock.

import { createHash } from 'node:crypto'
import type { TeacherLeadDutyResponse, TeacherListApplied, TeacherListPreview, TeacherShortNameResponse } from '@school-allocation/api-contracts/settings'
import { parseTeacherCsv, type TeacherCsvRow } from '@school-allocation/school-core'
import type { Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import { currentSchoolYear, listClasses } from '../lib/dao/class-teachers.ts'
import * as classStore from '../lib/dao/class-teachers.ts'
import * as store from '../lib/dao/teacher-detail.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError, TeacherListInvalid } from '../lib/errors.ts'
import { canonicalId } from './campaigns.ts'
import { replaceClassTeachersIn } from './class-teachers.ts'

/** The rows that matched, grouped for the writing: per person the abbreviation, per class its teachers. */
interface Resolved {
  preview: TeacherListPreview
  details: Map<string, { shortName: string }>
  classes: Map<string, string[]>
  /** The lines with a problem: listed, and left out of the rest. */
  skipped: number
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
    const { preview, details, classes, skipped } = await resolve(client, csv)
    if (preview.fileProblems.length > 0) throw new ApplicationError('csv_file_invalid', preview.fileProblems.map((p) => `${p.code}${p.line === undefined ? '' : ` (line ${p.line})`}`).join('; '))
    // Rows with a problem are skipped; a file with no other row has nothing to apply.
    if (!preview.applicable) throw new TeacherListInvalid(preview.problems)
    const current = await store.readDetails(client, [...details.keys()])
    // Released first, then given: two teachers exchanging their abbreviations would otherwise meet the unique index.
    for (const [personId] of details) await store.writeDetail(client, personId, { shortName: null, note: current.get(personId)?.note ?? null, leadDuty: current.get(personId)?.leadDuty ?? true })
    for (const [personId, { shortName }] of details) await store.writeDetail(client, personId, { shortName, note: current.get(personId)?.note ?? null, leadDuty: current.get(personId)?.leadDuty ?? true })
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
      metadata: { schoolYear, sha256: createHash('sha256').update(csv).digest('hex'), teachers: preview.teachers.length, shortNames: details.size, classes: classesChanged, skipped },
    })
    return { classes: await listClasses(client), teachers: preview.teachers.length, shortNames: details.size, classesChanged, skipped }
  })
}

/**
 * Sets one teacher's abbreviation, as the planning page offers it beside the
 * name: the one correction the list import is too much for. Null takes it
 * away. An abbreviation another teacher holds (in any case) is refused; the
 * same one again changes nothing and writes nothing.
 */
export async function setShortName(db: Database, rawPersonId: string, shortName: string | null, actor: Actor): Promise<TeacherShortNameResponse> {
  // Lower case, as PostgreSQL returns ids and the stores key them; the route accepts either case.
  const personId = canonicalId(rawPersonId)
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    if (!await store.isTeacher(client, personId)) throw new ApplicationError('not_found')
    const current = (await store.readDetails(client, [personId])).get(personId) ?? { shortName: null, note: null, leadDuty: true }
    if ((current.shortName ?? '') === (shortName ?? '')) return { personId, shortName: current.shortName }
    if (shortName !== null) {
      const owner = (await store.shortNameOwners(client, [shortName.toLowerCase()])).get(shortName.toLowerCase())
      if (owner !== undefined && owner !== personId) throw new ApplicationError('short_name_held')
    }
    await store.writeDetail(client, personId, { shortName, note: current.note, leadDuty: current.leadDuty })
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'teacher.short-name-changed',
      metadata: { personId, before: current.shortName, after: shortName },
    })
    return { personId, shortName }
  })
}

/**
 * Sets whether a teacher must lead an activity, as the planning page offers
 * it beside the abbreviation: a mark for the overview of who has done
 * their part; nothing the teacher may do changes. The same value again
 * changes nothing and writes nothing.
 */
export async function setLeadDuty(db: Database, rawPersonId: string, leadDuty: boolean, actor: Actor): Promise<TeacherLeadDutyResponse> {
  const personId = canonicalId(rawPersonId)
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    if (!await store.isTeacher(client, personId)) throw new ApplicationError('not_found')
    const current = (await store.readDetails(client, [personId])).get(personId) ?? { shortName: null, note: null, leadDuty: true }
    if (current.leadDuty === leadDuty) return { personId, leadDuty }
    await store.writeDetail(client, personId, { ...current, leadDuty })
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'teacher.lead-duty-changed',
      metadata: { personId, before: current.leadDuty, after: leadDuty },
    })
    return { personId, leadDuty }
  })
}

/** Whether two lists name the same people, whatever their order or names. */
function sameTeachers(a: readonly { personId: string }[], b: readonly { personId: string }[]): boolean {
  const ids = (list: readonly { personId: string }[]) => [...new Set(list.map((x) => x.personId))].sort((a, b) => a.localeCompare(b, 'en')).join('\n')
  return ids(a) === ids(b)
}

async function resolve(db: Queryable, csv: string): Promise<Resolved> {
  const parsed = parseTeacherCsv(csv)
  const preview: TeacherListPreview = { fileProblems: parsed.fileProblems, problems: [...parsed.problems], ignoredColumns: parsed.ignoredColumns, teachers: [], classes: [], applicable: false }
  const details = new Map<string, { shortName: string }>()
  const classes = new Map<string, string[]>()
  if (parsed.fileProblems.length > 0) return { preview, details, classes, skipped: 0 }
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
  // The abbreviations, by identity: a teacher named by mail and by UPN is one teacher. One abbreviation per teacher,
  // one teacher per abbreviation, in the file; and one already held by someone the file does not rename is not taken.
  const wanted = new Map<string, string>()
  const claimed = new Map<string, string>()
  /** The teachers whose abbreviation the file cannot settle, with why. */
  const unsound = new Map<string, 'short_name_inconsistent' | 'short_name_taken'>()
  for (const row of rows) {
    if (row.shortName === undefined) continue
    const lower = row.shortName.toLowerCase()
    const before = wanted.get(row.personId)
    if (before !== undefined && before.toLowerCase() !== lower) {
      preview.problems.push({ code: 'short_name_inconsistent', line: row.line, key: row.email })
      unsound.set(row.personId, 'short_name_inconsistent')
      continue
    }
    const claimant = claimed.get(lower)
    if (claimant !== undefined && claimant !== row.personId) {
      preview.problems.push({ code: 'short_name_taken', line: row.line, key: row.shortName })
      unsound.set(row.personId, 'short_name_taken')
      continue
    }
    wanted.set(row.personId, row.shortName)
    claimed.set(lower, row.personId)
  }
  // Every row of such a teacher that names an abbreviation is skipped, not only the one met second: a row applied
  // without the abbreviation it names would be half read.
  const flagged = new Set(preview.problems.map((problem) => problem.line))
  for (const row of rows) {
    const code = unsound.get(row.personId)
    if (row.shortName === undefined || code === undefined || flagged.has(row.line)) continue
    preview.problems.push({ code, line: row.line, key: code === 'short_name_taken' ? row.shortName : row.email })
    flagged.add(row.line)
  }
  for (const personId of unsound.keys()) wanted.delete(personId)
  // An abbreviation held by someone the file does not rename is not taken. Judged until nothing changes: a teacher
  // whose own claim falls keeps the abbreviation they hold, so a claim on it that passed before falls with them.
  const owners = await store.shortNameOwners(db, [...new Set([...wanted.values()].map((name) => name.toLowerCase()))])
  for (let settled = false; !settled;) {
    settled = true
    for (const [personId, shortName] of wanted) {
      const owner = owners.get(shortName.toLowerCase())
      if (owner === undefined || owner === personId || wanted.has(owner)) continue
      // Every row of the teacher that names it: the rows agree on it, or the teacher would be unsound already.
      for (const row of rows) if (row.personId === personId && row.shortName !== undefined) preview.problems.push({ code: 'short_name_held', line: row.line, key: row.shortName })
      wanted.delete(personId)
      settled = false
    }
  }
  // A row with a problem is listed and left out whole, the parser's rows included; what the other rows say is applied.
  const skippedLines = new Set(preview.problems.map((problem) => problem.line))
  const applied = rows.filter((row) => !skippedLines.has(row.line))
  const current = await store.readDetails(db, [...new Set(applied.map((row) => row.personId))])
  const seen = new Set<string>()
  for (const row of applied) {
    if (seen.has(row.personId)) continue
    seen.add(row.personId)
    const after = wanted.get(row.personId)
    const before = current.get(row.personId)?.shortName ?? null
    if (after !== undefined) details.set(row.personId, { shortName: after })
    preview.teachers.push({ personId: row.personId, displayName: row.displayName, email: row.email, shortName: after === undefined || after === before ? null : { before, after } })
  }
  for (const row of applied) {
    if (row.className === undefined) continue
    const list = classes.get(row.className) ?? []
    if (!list.includes(row.personId)) list.push(row.personId)
    classes.set(row.className, list)
  }
  if (classes.size > 0) {
    const names = new Map(applied.map((row) => [row.personId, row.displayName]))
    // The assignments themselves, not the class list's view of them: a teacher no longer in the roster keeps an
    // assignment the list does not show, and a file without them must still take it away.
    const schoolYear = await currentSchoolYear(db)
    const all = await listClasses(db)
    for (const c of all) for (const teacher of c.teachers) names.set(teacher.personId, teacher.displayName)
    for (const [className, personIds] of classes) {
      const assigned = schoolYear === undefined ? [] : await classStore.listAssignments(db, schoolYear, className)
      const byName = (x: { displayName: string }, y: { displayName: string }) => x.displayName.localeCompare(y.displayName, 'de')
      preview.classes.push({
        className,
        before: assigned.map((a) => ({ personId: a.personId, displayName: names.get(a.personId) ?? a.personId })).sort(byName),
        after: personIds.map((id) => ({ personId: id, displayName: names.get(id) ?? id })).sort(byName),
      })
    }
  }
  preview.applicable = applied.length > 0
  return { preview, details, classes, skipped: skippedLines.size }
}
