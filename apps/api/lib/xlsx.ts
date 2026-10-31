// The workbooks for the organizer's and the school's own spreadsheets: the
// state of the lists, the catalogue, the attendance, a run. Columns are
// typed so a sheet sorts and sums. Every builder takes the words it writes
// (lib/i18n.ts), the school's language at the time of the request; dates
// are written as text in the school's time and that language.

import type { AttendanceRow } from '@school-allocation/api-contracts/attendance'
import type { PlanningResponse } from '@school-allocation/api-contracts/planning'
import type { AssignmentChange } from '@school-allocation/api-contracts/publication'
import writeXlsxFile from 'write-excel-file/node'
import type { Words } from './i18n.ts'
import type { RunReviewResponse } from './models/allocation.ts'
import type { StudentChoiceState } from './models/choices.ts'
import type { Category } from './models/categories.ts'
import type { Item } from './models/items.ts'
import { SCHOOL_TIME_ZONE } from './time.ts'

/** A student's row of the organizer's list: the state of their list and what was sent to them. */
export interface MissingRow extends StudentChoiceState {
  mails: { kind: string, state: string, createdAt: string }[]
}

/** The words a workbook is written in: the catalogue of the school's language and its Intl locale. */
export type WorkbookWords = Pick<Words, 't' | 'intl'>

/** How the workbooks write moments and days, as text in the school's time: an Excel date carries no zone and would show UTC. */
function dateFormats(intl: string) {
  return {
    when: new Intl.DateTimeFormat(intl, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    dayShort: new Intl.DateTimeFormat(intl, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit' }),
    whenLong: new Intl.DateTimeFormat(intl, { timeZone: SCHOOL_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  }
}

/** Every student with the state of their list, for the organizer's and the class teachers' spreadsheets. */
export async function missingWorkbook({ t, intl }: WorkbookWords, rows: readonly MissingRow[]): Promise<Buffer> {
  const stateLabels: Readonly<Record<string, string>> = t.labels.choiceState
  const field = t.common.field
  const column = t.workbook.column
  const { when } = dateFormats(intl)
  const data = [
    [field.className, field.grade, field.name, field.state, column.window, column.savedAt, field.email, column.mails].map(header),
    ...rows.map((row) => [
      { type: String, value: row.className },
      { type: Number, value: row.grade },
      { type: String, value: row.displayName },
      { type: String, value: stateLabels[row.state] ?? row.state },
      { type: String, value: row.window === null ? '' : (row.window === 'first' ? t.labels.window.first : t.labels.window.late) },
      { type: String, value: row.updatedAt === null ? '' : when.format(new Date(row.updatedAt)) },
      { type: String, value: row.address ?? '' },
      { type: String, value: row.mails.map((m) => `${m.kind}: ${m.state}`).join('; ') },
    ]),
  ]
  const workbook = writeXlsxFile([{ sheet: t.workbook.sheet.missing, columns: [{ width: 8 }, { width: 10 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 22 }, { width: 36 }, { width: 50 }], data }])
  return workbook.toBuffer()
}

function header(text: string) {
  return { value: text, fontWeight: 'bold' as const }
}

/**
 * The organizer's overview of the teachers: one row per teacher and project
 * day, with their availability and the activities they lead and accompany
 * there, so a pivot table counts either way.
 */
export async function planningWorkbook({ t, intl }: WorkbookWords, planning: PlanningResponse): Promise<Buffer> {
  const field = t.common.field
  const column = t.workbook.column
  const statusLabels: Readonly<Record<string, string>> = t.labels.availability
  const day = new Intl.DateTimeFormat(intl, { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  const named = (items: PlanningResponse['teachers'][number]['days'][number]['leads']) => items.map((item) => (item.number === null ? item.title : `${item.number}. ${item.title}`)).join(', ')
  const data = [
    [field.name, field.day, column.availability, column.leads, column.accompanies].map(header),
    ...planning.teachers.flatMap((teacher) => teacher.days.map((d) => [
      { type: String, value: teacher.displayName },
      { type: String, value: day.format(new Date(`${d.date}T00:00:00Z`)) },
      { type: String, value: statusLabels[d.status] ?? d.status },
      { type: String, value: named(d.leads) },
      { type: String, value: named(d.accompanies) },
    ])),
  ]
  const workbook = writeXlsxFile([{ sheet: t.workbook.sheet.planning, columns: [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 40 }, { width: 40 }], data }])
  return workbook.toBuffer()
}

/** The catalogue: one sheet of activities, one of sessions; nothing about students is in it. The workbook as bytes; the caller sets the headers. */
export async function catalogueWorkbook({ t, intl }: WorkbookWords, items: readonly Item[], categories: readonly Category[]): Promise<Buffer> {
  const field = t.common.field
  const column = t.workbook.column
  const { when } = dateFormats(intl)
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]))
  const activities = [
    [field.number, column.title, field.teachers, column.description, column.location, field.places, column.minParticipants, column.cancellableBelowMinimum, column.fixedClasses, column.grades, column.classes, column.fee, column.feeNote, field.sessions, column.minutes, column.categories].map(header),
    ...items.map((item) => [
      { type: Number, value: item.number ?? undefined },
      { type: String, value: item.title },
      { type: String, value: item.teachers.map((teacher) => teacher.displayName).join(', ') },
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
      { type: String, value: item.categoryIds.map((id) => categoryNames.get(id) ?? '').filter(Boolean).sort((a, b) => a.localeCompare(b, intl)).join(', ') },
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
    { sheet: t.workbook.sheet.items, columns: [{ width: 6 }, { width: 40 }, { width: 30 }, { width: 60 }, { width: 24 }, { width: 8 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 10 }, { width: 30 }, { width: 8 }, { width: 8 }, { width: 24 }], data: activities },
    { sheet: t.workbook.sheet.sessions, columns: [{ width: 6 }, { width: 40 }, { width: 22 }, { width: 22 }, { width: 24 }, { width: 40 }], data: sessions },
  ])
  return workbook.toBuffer()
}

/** The attendance as a workbook: one row per student and session, with what was recorded; the whole campaign or one class. */
export async function attendanceWorkbook({ t, intl }: WorkbookWords, rows: readonly AttendanceRow[]): Promise<Buffer> {
  const attendanceLabels: Readonly<Record<string, string>> = t.labels.attendanceStatus
  const field = t.common.field
  const column = t.workbook.column
  const { dayShort, whenLong } = dateFormats(intl)
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
      { type: String, value: r.status === null ? '' : attendanceLabels[r.status] ?? r.status },
      { type: String, value: r.note },
    ]),
  ]
  const workbook = writeXlsxFile([{ sheet: t.workbook.sheet.attendance, columns: [{ width: 12 }, { width: 6 }, { width: 36 }, { width: 18 }, { width: 18 }, { width: 8 }, { width: 30 }, { width: 14 }, { width: 40 }], data }])
  return workbook.toBuffer()
}

/**
 * A run as a workbook for the organizer's review and the school's lists:
 * every student with their items per day, the fee and what they reach of
 * each rule, the participants per item, the items with their counts, the
 * missing minutes and the missing rules. The same
 * builder serves a published run, then with the sheet of the changes made
 * since publication (the reason included: the sheet is the organizer's).
 */
export async function runWorkbook({ t, intl }: WorkbookWords, review: RunReviewResponse, changes?: readonly AssignmentChange[]): Promise<Buffer> {
  const sourceLabels: Readonly<Record<string, string>> = t.workbook.source
  const changeKindLabels: Readonly<Record<string, string>> = t.labels.changeKind
  const field = t.common.field
  const column = t.workbook.column
  const { dayShort, whenLong } = dateFormats(intl)
  const items = new Map(review.items.map((item) => [item.itemId, item]))
  const label = (itemId: string) => {
    const item = items.get(itemId)
    return item === undefined ? itemId : item.number === null ? item.title : `${item.number}. ${item.title}`
  }
  const dayHeaders = review.projectDays.flatMap((date) => [`${dayShort.format(new Date(`${date}T12:00:00Z`))}`, column.minutes])
  // A rule by its category, what it asks and of whom: "Sport: mindestens 1 Aktivität (9. und 10. Schulstufe)".
  const categoryNames = new Map(review.categories.map((c) => [c.id, c.name]))
  const ruleLabels = new Map(review.rules.map((rule) => [rule.id, `${t.rules.asks(categoryNames.get(rule.categoryId) ?? '?', rule.minimum, rule.unit)} (${t.rules.scope(rule.grades, rule.classes)})`]))
  const students = [
    [field.className, field.grade, field.name, column.window, ...dayHeaders, column.deficit, column.fee, ...review.rules.map((rule) => ruleLabels.get(rule.id) ?? '')].map(header),
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
        // What the student's items bring to each rule; empty where a rule does not apply to them.
        ...review.rules.map((rule) => ({ type: Number, value: s.rules.find((r) => r.ruleId === rule.id)?.have })),
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
      { type: String, value: sourceLabels[e.source] ?? e.source },
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
  const ruleGaps = review.rules.length === 0
    ? []
    : [{
        sheet: t.workbook.sheet.rules,
        columns: [{ width: 8 }, { width: 30 }, { width: 50 }, { width: 10 }, { width: 10 }],
        data: [
          [field.className, field.name, column.rule, column.reached, column.missing].map(header),
          ...review.students.flatMap((s) => s.rules.filter((r) => !r.met).map((r) => [
            { type: String, value: s.className },
            { type: String, value: s.displayName },
            { type: String, value: ruleLabels.get(r.ruleId) ?? '' },
            { type: Number, value: r.have },
            { type: Number, value: r.minimum - r.have },
          ])),
        ],
      }]
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
            { type: String, value: changeKindLabels[c.kind] ?? c.kind },
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
    { sheet: t.workbook.sheet.students, columns: [{ width: 8 }, { width: 10 }, { width: 30 }, { width: 16 }, ...review.projectDays.flatMap(() => [{ width: 40 }, { width: 9 }]), { width: 16 }, { width: 12 }, ...review.rules.map(() => ({ width: 24 }))], data: students },
    { sheet: t.workbook.sheet.participants, columns: [{ width: 6 }, { width: 36 }, { width: 8 }, { width: 30 }, { width: 16 }, { width: 8 }], data: participants },
    { sheet: t.workbook.sheet.items, columns: [{ width: 6 }, { width: 36 }, { width: 8 }, { width: 10 }, { width: 12 }, { width: 9 }, { width: 9 }, { width: 12 }], data: activities },
    { sheet: t.workbook.sheet.deficits, columns: [{ width: 8 }, { width: 30 }, { width: 16 }, { width: 16 }], data: deficits },
    ...ruleGaps,
    ...changed,
  ])
  return workbook.toBuffer()
}
