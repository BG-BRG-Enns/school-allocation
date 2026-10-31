// The catalogue as a workbook for the organizer's and the school's own
// spreadsheets: one sheet of activities, one of sessions. Columns are typed
// so the sheet sorts and sums; nothing about students is in it.

import type { AttendanceRow } from '@school-allocation/api-contracts/attendance'
import type { AssignmentChange } from '@school-allocation/api-contracts/publication'
import writeXlsxFile from 'write-excel-file/node'
import { INTL_LOCALE, t } from './i18n.ts'
import type { RunReviewResponse } from './models/allocation.ts'
import type { StudentChoiceState } from './models/choices.ts'
import type { Item } from './models/items.ts'
import { SCHOOL_TIME_ZONE } from './time.ts'

/** A student's row of the organizer's list: the state of their list and what was sent to them. */
export interface MissingRow extends StudentChoiceState {
  mails: { kind: string, state: string, createdAt: string }[]
}

const STATE_LABELS: Readonly<Record<string, string>> = t.labels.choiceState
const field = t.common.field
const column = t.workbook.column

/** Every student with the state of their list, for the organizer's and the class teachers' spreadsheets. */
export async function missingWorkbook(rows: readonly MissingRow[]): Promise<Buffer> {
  const data = [
    [field.className, field.grade, field.name, field.state, column.window, column.savedAt, field.email, column.mails].map(header),
    ...rows.map((row) => [
      { type: String, value: row.className },
      { type: Number, value: row.grade },
      { type: String, value: row.displayName },
      { type: String, value: STATE_LABELS[row.state] ?? row.state },
      { type: String, value: row.window === null ? '' : (row.window === 'first' ? t.labels.window.first : t.labels.window.late) },
      { type: String, value: row.updatedAt === null ? '' : when.format(new Date(row.updatedAt)) },
      { type: String, value: row.address ?? '' },
      { type: String, value: row.mails.map((m) => `${m.kind}: ${m.state}`).join('; ') },
    ]),
  ]
  const workbook = writeXlsxFile([{ sheet: t.workbook.sheet.missing, columns: [{ width: 8 }, { width: 10 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 22 }, { width: 36 }, { width: 50 }], data }])
  return workbook.toBuffer()
}

const when = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function header(text: string) {
  return { value: text, fontWeight: 'bold' as const }
}

/** The workbook as bytes; the caller sets the headers. */
export async function catalogueWorkbook(items: readonly Item[]): Promise<Buffer> {
  const activities = [
    [field.number, column.title, field.teachers, column.description, column.location, field.places, column.minParticipants, column.cancellableBelowMinimum, column.fixedClasses, column.grades, column.classes, column.fee, column.feeNote, field.sessions, column.minutes].map(header),
    ...items.map((item) => [
      { type: Number, value: item.number ?? undefined },
      { type: String, value: item.title },
      { type: String, value: item.teachers.map((t) => t.displayName).join(', ') },
      { type: String, value: item.description, wrap: true },
      { type: String, value: item.location },
      { type: Number, value: item.places },
      { type: Number, value: item.minParticipants },
      { type: String, value: item.fixedClasses.length > 0 ? '–' : (item.cancellableBelowMin ? t.workbook.yes : t.workbook.no) },
      { type: String, value: item.fixedClasses.join(', ') },
      { type: String, value: item.eligibleGrades.join(', ') },
      { type: String, value: item.eligibleClasses.join(', ') },
      { type: Number, value: item.feeCents / 100, format: '#,##0.00' },
      { type: String, value: item.feeNote },
      { type: Number, value: item.sessions.length },
      { type: Number, value: item.sessions.flatMap((s) => s.credits).reduce((sum, c) => sum + c.minutes, 0) },
    ]),
  ]
  const sessions = [
    [field.number, column.title, column.starts, column.ends, column.location, column.credits].map(header),
    ...items.flatMap((item) => item.sessions.map((session) => [
      { type: Number, value: item.number ?? undefined },
      { type: String, value: item.title },
      { type: String, value: when.format(new Date(session.startsAt)) },
      { type: String, value: when.format(new Date(session.endsAt)) },
      { type: String, value: session.location },
      { type: String, value: session.credits.map((c) => `${c.date}: ${c.minutes}`).join('; ') },
    ])),
  ]
  const workbook = writeXlsxFile([
    { sheet: t.workbook.sheet.items, columns: [{ width: 6 }, { width: 40 }, { width: 30 }, { width: 60 }, { width: 24 }, { width: 8 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 10 }, { width: 30 }, { width: 8 }, { width: 8 }], data: activities },
    { sheet: t.workbook.sheet.sessions, columns: [{ width: 6 }, { width: 40 }, { width: 22 }, { width: 22 }, { width: 24 }, { width: 40 }], data: sessions },
  ])
  return workbook.toBuffer()
}

const SOURCE_LABELS: Readonly<Record<string, string>> = t.workbook.source

const CHANGE_KIND_LABELS: Readonly<Record<string, string>> = t.labels.changeKind
const ATTENDANCE_LABELS: Readonly<Record<string, string>> = t.labels.attendanceStatus

/** The attendance as a workbook: one row per student and session, with what was recorded; the whole campaign or one class. */
export async function attendanceWorkbook(rows: readonly AttendanceRow[]): Promise<Buffer> {
  const data = [
    [field.day, field.number, field.item, column.from, column.until, field.className, field.name, column.attendance, column.note].map(header),
    ...rows.map((r) => [
      { type: String, value: dayShort.format(new Date(r.startsAt)) },
      { type: Number, value: r.number ?? undefined },
      { type: String, value: r.title },
      // As text in the school's time: an Excel date carries no zone and would show UTC.
      { type: String, value: whenLong.format(new Date(r.startsAt)) },
      { type: String, value: whenLong.format(new Date(r.endsAt)) },
      { type: String, value: r.className },
      { type: String, value: r.displayName },
      { type: String, value: r.status === null ? '' : ATTENDANCE_LABELS[r.status] ?? r.status },
      { type: String, value: r.note },
    ]),
  ]
  const workbook = writeXlsxFile([{ sheet: t.workbook.sheet.attendance, columns: [{ width: 12 }, { width: 6 }, { width: 36 }, { width: 18 }, { width: 18 }, { width: 8 }, { width: 30 }, { width: 14 }, { width: 40 }], data }])
  return workbook.toBuffer()
}

/**
 * A run as a workbook for the organizer's review and the school's lists:
 * every student with their items per day and the fee, the participants per
 * item, the items with their counts, and the missing minutes. The same
 * builder serves a published run, then with the sheet of the changes made
 * since publication (the reason included: the sheet is the organizer's).
 */
export async function runWorkbook(review: RunReviewResponse, changes?: readonly AssignmentChange[]): Promise<Buffer> {
  const items = new Map(review.items.map((item) => [item.itemId, item]))
  const label = (itemId: string) => {
    const item = items.get(itemId)
    return item === undefined ? itemId : item.number === null ? item.title : `${item.number}. ${item.title}`
  }
  const dayHeaders = review.projectDays.flatMap((date) => [`${dayShort.format(new Date(`${date}T12:00:00Z`))}`, column.minutes])
  const students = [
    [field.className, field.grade, field.name, column.window, ...dayHeaders, column.deficit, column.fee].map(header),
    ...review.students.map((s) => {
      const perDay = review.projectDays.flatMap((date) => {
        const onDay = s.items.filter((e) => (e.minutesByDate[date] ?? 0) > 0)
        const text = onDay.map((e) => `${label(e.itemId)}${e.source === 'wish' ? ` (${t.workbook.place.wish(e.rank)})` : e.source === 'fallback' ? ` (${t.workbook.place.fallback})` : e.source === 'fixed' ? ` (${t.workbook.place.fixed})` : ''}`).join('; ')
        return [{ type: String, value: text }, { type: Number, value: onDay.reduce((sum, e) => sum + (e.minutesByDate[date] ?? 0), 0) }]
      })
      const fee = s.items.reduce((sum, e) => sum + (items.get(e.itemId)?.feeCents ?? 0), 0)
      return [
        { type: String, value: s.className },
        { type: Number, value: s.grade },
        { type: String, value: s.displayName },
        { type: String, value: s.window === null ? t.labels.choiceState.none : s.window === 'first' ? t.labels.window.first : t.labels.window.late },
        ...perDay,
        { type: Number, value: s.days.reduce((sum, d) => sum + d.deficit, 0) },
        { type: Number, value: fee / 100, format: '#,##0.00' },
      ]
    }),
  ]
  const participants = [
    [field.number, field.item, field.className, field.name, column.kind, column.wish].map(header),
    ...review.items.flatMap((item) => review.students.flatMap((s) => s.items.filter((e) => e.itemId === item.itemId).map((e) => [
      { type: Number, value: item.number ?? undefined },
      { type: String, value: item.title },
      { type: String, value: s.className },
      { type: String, value: s.displayName },
      { type: String, value: SOURCE_LABELS[e.source] ?? e.source },
      { type: Number, value: e.rank ?? undefined },
    ]))),
  ]
  const activities = [
    [field.number, field.item, field.places, column.assigned, column.fixed, column.minimum, column.cancelled, column.fee].map(header),
    ...review.items.map((item) => [
      { type: Number, value: item.number ?? undefined },
      { type: String, value: item.title },
      { type: Number, value: item.places },
      { type: Number, value: item.assigned },
      { type: Number, value: item.fixed },
      { type: Number, value: item.minimum },
      { type: String, value: item.cancelled ? t.workbook.yes : '' },
      { type: Number, value: item.feeCents / 100, format: '#,##0.00' },
    ]),
  ]
  const deficits = [
    [field.className, field.name, field.day, column.deficit].map(header),
    ...review.students.flatMap((s) => s.days.filter((d) => d.deficit > 0).map((d) => [
      { type: String, value: s.className },
      { type: String, value: s.displayName },
      { type: String, value: dayShort.format(new Date(`${d.date}T12:00:00Z`)) },
      { type: Number, value: d.deficit },
    ])),
  ]
  const changed = changes === undefined
    ? []
    : [{
        sheet: t.workbook.sheet.changes,
        columns: [{ width: 6 }, { width: 18 }, { width: 12 }, { width: 8 }, { width: 30 }, { width: 36 }, { width: 36 }, { width: 40 }, { width: 10 }, { width: 24 }],
        data: [
          [field.number, column.when, column.kind, field.className, field.name, column.left, column.to, field.reason, column.forced, column.by].map(header),
          ...changes.map((c) => [
            { type: Number, value: c.seq },
            // As text in the school's time: an Excel date carries no zone and would show UTC.
            { type: String, value: whenLong.format(new Date(c.changedAt)) },
            { type: String, value: CHANGE_KIND_LABELS[c.kind] ?? c.kind },
            { type: String, value: c.className },
            { type: String, value: c.displayName },
            { type: String, value: c.leftItemIds.map(label).join('; ') },
            { type: String, value: c.toItemId === null ? '' : label(c.toItemId) },
            { type: String, value: c.reason ?? '' },
            { type: String, value: c.forced ? t.workbook.yes : '' },
            { type: String, value: c.changedBy.displayName },
          ]),
        ],
      }]
  const workbook = writeXlsxFile([
    { sheet: t.workbook.sheet.students, columns: [{ width: 8 }, { width: 10 }, { width: 30 }, { width: 16 }, ...review.projectDays.flatMap(() => [{ width: 40 }, { width: 9 }]), { width: 16 }, { width: 12 }], data: students },
    { sheet: t.workbook.sheet.participants, columns: [{ width: 6 }, { width: 36 }, { width: 8 }, { width: 30 }, { width: 16 }, { width: 8 }], data: participants },
    { sheet: t.workbook.sheet.items, columns: [{ width: 6 }, { width: 36 }, { width: 8 }, { width: 10 }, { width: 12 }, { width: 9 }, { width: 9 }, { width: 12 }], data: activities },
    { sheet: t.workbook.sheet.deficits, columns: [{ width: 8 }, { width: 30 }, { width: 16 }, { width: 16 }], data: deficits },
    ...changed,
  ])
  return workbook.toBuffer()
}

const dayShort = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit' })
const whenLong = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: SCHOOL_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
