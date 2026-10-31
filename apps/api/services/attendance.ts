// Attendance (docs/domain-and-api.md §1 Attendance, §8; mvp-plan S5b): the
// class teacher of a class records, per project day and session, which of
// their students were there; an organizer may for everyone. Only students
// currently assigned to the session's item are recorded, from publication
// until the archive; a record is corrected in place and every recording is
// audited. Separate from the assignments: an absent student keeps their
// place (PW12).

import type { Assignment } from '@school-allocation/school-core'
import { actorOf, type Caller } from '../lib/actor.ts'
import { appendAudit, lockScope } from '../lib/audit.ts'
import * as store from '../lib/dao/attendance.ts'
import * as runs from '../lib/dao/allocation.ts'
import { lockedCampaign, readCampaign } from '../lib/dao/campaigns.ts'
import { campaignStudents } from '../lib/dao/choices.ts'
import { listCampaignItems } from '../lib/dao/items.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { AttendanceRecord, AttendanceRow, AttendanceStatus, ClassAttendanceResponse } from '../lib/models/attendance.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { CampaignStudent } from '../lib/models/choices.ts'
import type { Item } from '../lib/models/items.ts'
import { isOrganizer } from '../lib/policies.ts'
import { datesOfSpan, instantOf } from '../lib/time.ts'
import { classTeacherOf } from './class-teachers.ts'

/** Whether the caller reads the class: an organizer, an auditor, or a class teacher of it in the campaign's school year (`classes`, from classTeacherOf). */
function mayRead(caller: Caller, classes: readonly string[], className: string): boolean {
  return isOrganizer(caller) || caller.roles.includes('read_only_auditor') || classes.includes(className)
}

/** Whether the caller records for the class: an organizer or a class teacher of it in the campaign's school year, while the campaign is in results. */
function mayRecord(caller: Caller, campaign: Pick<Campaign, 'state'>, classes: readonly string[], className: string): boolean {
  return campaign.state === 'results' && (isOrganizer(caller) || classes.includes(className))
}

/** The attendance rows of the campaign's published run: per project day, every student's sessions that day, with what was recorded. */
async function rows(db: Queryable, campaign: Campaign, students: readonly CampaignStudent[]): Promise<{ date: string, rows: AttendanceRow[] }[]> {
  const run = await runs.readPublishedRun(db, campaign.id)
  if (!run) return campaign.projectDays.map((date) => ({ date, rows: [] }))
  const [assignments, items, records] = await Promise.all([runs.listAssignments(db, run.id), listCampaignItems(db, campaign.id), store.listAttendance(db, campaign.id)])
  const byItem = new Map<string, Item>(items.map((item) => [item.id, item]))
  const recorded = new Map(records.map((r) => [`${r.sessionId}\u0000${r.personId}`, r]))
  const named = new Map(students.map((s) => [s.personId, s]))
  const mine = assignments.filter((a: Assignment) => named.has(a.personId))
  return campaign.projectDays.map((date) => {
    const list: AttendanceRow[] = []
    for (const a of mine) {
      const item = byItem.get(a.itemId)
      const student = named.get(a.personId)
      // An item withdrawn after publication still names a place given (the result says so), but it does not take place: no attendance for it.
      if (!item || !student || item.state !== 'approved') continue
      for (const session of item.sessions) {
        if (!datesOfSpan(instantOf(session.startsAt) ?? 0, instantOf(session.endsAt) ?? 0).includes(date)) continue
        const record = recorded.get(`${session.id}\u0000${a.personId}`)
        list.push({ sessionId: session.id, itemId: item.id, title: item.title, number: item.number, startsAt: session.startsAt, endsAt: session.endsAt, personId: a.personId, displayName: student.displayName, className: student.className, status: record?.status ?? null, note: record?.note ?? '' })
      }
    }
    list.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title, 'de') || a.className.localeCompare(b.className, 'de') || a.displayName.localeCompare(b.displayName, 'de'))
    return { date, rows: list }
  })
}

/** A class's attendance as its class teacher sees and records it. */
export async function classAttendance(db: Database, campaign: Campaign, caller: Caller, className: string): Promise<ClassAttendanceResponse> {
  const classes = await classTeacherOf(db, campaign, caller)
  if (!mayRead(caller, classes, className)) throw new ApplicationError('forbidden')
  const students = await campaignStudents(db, campaign, className)
  if (students.length === 0) throw new ApplicationError('not_found')
  return { className, recordable: mayRecord(caller, campaign, classes, className), days: await rows(db, campaign, students) }
}

/** Every row of the campaign (the organizer's and the auditor's workbook), or a class's: one per student and session, a session over two days once. */
export async function attendanceRows(db: Database, campaign: Campaign, caller: Caller, className?: string): Promise<AttendanceRow[]> {
  if (className !== undefined && !mayRead(caller, await classTeacherOf(db, campaign, caller), className)) throw new ApplicationError('forbidden')
  if (className === undefined && !isOrganizer(caller) && !caller.roles.includes('read_only_auditor')) throw new ApplicationError('forbidden')
  const students = await campaignStudents(db, campaign, className)
  if (className !== undefined && students.length === 0) throw new ApplicationError('not_found')
  const seen = new Set<string>()
  return (await rows(db, campaign, students)).flatMap((d) => d.rows).filter((r) => {
    const key = `${r.sessionId}\u0000${r.personId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export interface AttendanceEntry {
  personId: string
  status: AttendanceStatus
  note?: string
}

/**
 * Records a session's attendance for the students named, under the
 * campaign's lock: the session's item approved, the campaign in results,
 * every student currently assigned to the item and, for a class teacher,
 * of their class. Audited with the counts.
 */
export async function recordAttendance(db: Database, caller: Caller, sessionId: string, entries: readonly AttendanceEntry[]): Promise<{ recorded: number }> {
  // Read once for the campaign to lock, then again under its lock: an edit or a withdrawal in between is seen.
  const seen = await store.sessionOf(db, sessionId.toLowerCase())
  if (!seen) throw new ApplicationError('not_found')
  const canon = new Map(entries.map((e) => [e.personId.toLowerCase(), e]))
  let recorded = 0
  await db.tx(async (client) => {
    await lockScope(client, seen.campaignId)
    const session = await store.sessionOf(client, seen.id)
    if (!session || session.campaignId !== seen.campaignId || session.itemState !== 'approved') throw new ApplicationError('not_found')
    const campaign = await lockedCampaign(client, session.campaignId)
    if (!campaign) throw new ApplicationError('not_found')
    if (campaign.state !== 'results') throw new ApplicationError('campaign_state')
    const run = await runs.readPublishedRun(client, campaign.id)
    if (!run) throw new ApplicationError('not_published')
    const students = new Map((await campaignStudents(client, campaign)).map((s) => [s.personId, s]))
    const assigned = new Set((await runs.listAssignments(client, run.id)).filter((a) => a.itemId === session.itemId).map((a) => a.personId))
    // The caller's classes in the campaign's school year, read under the lock with the rest.
    const classes = await classTeacherOf(client, campaign, caller)
    for (const [personId, entry] of canon) {
      const student = students.get(personId)
      if (!student || !assigned.has(personId)) throw new ApplicationError('not_assigned', personId)
      if (!mayRecord(caller, campaign, classes, student.className)) throw new ApplicationError('forbidden')
      await store.upsertAttendance(client, session.itemId, session.position, personId, entry.status, (entry.note ?? '').trim(), caller.id)
      recorded += 1
    }
    const counts = { present: 0, absent: 0, excused: 0 }
    for (const entry of canon.values()) counts[entry.status] += 1
    const actor = actorOf(caller)
    await appendAudit(client, { scopeId: campaign.id, actor: { tid: actor.tid, oid: actor.oid, name: actor.name }, action: 'attendance.recorded', metadata: { sessionId: session.id, itemId: session.itemId, position: session.position, ...counts } })
  })
  return { recorded }
}

/** The campaign a session belongs to, for the route's visibility check. */
export async function sessionCampaign(db: Database, sessionId: string): Promise<Campaign | undefined> {
  const session = await store.sessionOf(db, sessionId.toLowerCase())
  return session === undefined ? undefined : await readCampaign(db, session.campaignId)
}

export type { AttendanceRecord }
