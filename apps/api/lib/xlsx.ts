// The catalogue as a workbook for the organizer's and the school's own
// spreadsheets: one sheet of activities, one of sessions. Columns are typed
// so the sheet sorts and sums; nothing about students is in it.

import type { AssignmentChange } from '@school-allocation/api-contracts/publication'
import writeXlsxFile from 'write-excel-file/node'
import type { RunReviewResponse } from './models/allocation.ts'
import type { StudentChoiceState } from './models/choices.ts'
import type { Item } from './models/items.ts'
import { SCHOOL_TIME_ZONE } from './time.ts'

/** A student's row of the organizer's list: the state of their list and what was sent to them. */
export interface MissingRow extends StudentChoiceState {
  mails: { kind: string, state: string, createdAt: string }[]
}

const STATE_LABELS: Record<string, string> = { none: 'keine Wünsche', incomplete: 'unvollständig', complete: 'vollständig' }

/** Every student with the state of their list, for the organizer's and the class teachers' spreadsheets. */
export async function missingWorkbook(rows: readonly MissingRow[]): Promise<Buffer> {
  const data = [
    ['Klasse', 'Schulstufe', 'Name', 'Stand', 'Fenster', 'Zuletzt gespeichert', 'E-Mail', 'Nachrichten'].map(header),
    ...rows.map((row) => [
      { type: String, value: row.className },
      { type: Number, value: row.grade },
      { type: String, value: row.displayName },
      { type: String, value: STATE_LABELS[row.state] ?? row.state },
      { type: String, value: row.window === null ? '' : (row.window === 'first' ? 'Anmeldefenster' : 'Nachfrist') },
      { type: String, value: row.updatedAt === null ? '' : when.format(new Date(row.updatedAt)) },
      { type: String, value: row.address ?? '' },
      { type: String, value: row.mails.map((m) => `${m.kind}: ${m.state}`).join('; ') },
    ]),
  ]
  const workbook = writeXlsxFile([{ sheet: 'Wahlstand', columns: [{ width: 8 }, { width: 10 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 22 }, { width: 36 }, { width: 50 }], data }])
  return workbook.toBuffer()
}

const when = new Intl.DateTimeFormat('de-AT', { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function header(text: string) {
  return { value: text, fontWeight: 'bold' as const }
}

/** The workbook as bytes; the caller sets the headers. */
export async function catalogueWorkbook(items: readonly Item[]): Promise<Buffer> {
  const activities = [
    ['Nr.', 'Titel', 'Lehrkräfte', 'Beschreibung', 'Ort', 'Plätze', 'Mindestteilnehmer', 'Absagbar unter Minimum', 'Fixe Klassen', 'Schulstufen', 'Klassen', 'Beitrag (€)', 'Beitrag: Anmerkung', 'Termine', 'Minuten'].map(header),
    ...items.map((item) => [
      { type: Number, value: item.number ?? undefined },
      { type: String, value: item.title },
      { type: String, value: item.teachers.map((t) => t.displayName).join(', ') },
      { type: String, value: item.description, wrap: true },
      { type: String, value: item.location },
      { type: Number, value: item.places },
      { type: Number, value: item.minParticipants },
      { type: String, value: item.fixedClasses.length > 0 ? '–' : (item.cancellableBelowMin ? 'ja' : 'nein') },
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
    ['Nr.', 'Titel', 'Beginn', 'Ende', 'Ort', 'Angerechnet (Tag: Minuten)'].map(header),
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
    { sheet: 'Aktivitäten', columns: [{ width: 6 }, { width: 40 }, { width: 30 }, { width: 60 }, { width: 24 }, { width: 8 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 10 }, { width: 30 }, { width: 8 }, { width: 8 }], data: activities },
    { sheet: 'Termine', columns: [{ width: 6 }, { width: 40 }, { width: 22 }, { width: 22 }, { width: 24 }, { width: 40 }], data: sessions },
  ])
  return workbook.toBuffer()
}

const SOURCE_LABELS: Record<string, string> = { fixed: 'Klassenaktivität', wish: 'Wunsch', fallback: 'Ersatzplatz', swap: 'Tausch', manual: 'Händisch' }

const CHANGE_KIND_LABELS: Record<string, string> = { swap: 'Tausch', place: 'Zuteilung', move: 'Umsetzung', remove: 'Herausnahme' }

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
  const dayHeaders = review.projectDays.flatMap((date) => [`${dayShort.format(new Date(`${date}T12:00:00Z`))}`, 'Minuten'])
  const students = [
    ['Klasse', 'Schulstufe', 'Name', 'Fenster', ...dayHeaders, 'Fehlende Minuten', 'Beitrag (€)'].map(header),
    ...review.students.map((s) => {
      const perDay = review.projectDays.flatMap((date) => {
        const onDay = s.items.filter((e) => (e.minutesByDate[date] ?? 0) > 0)
        const text = onDay.map((e) => `${label(e.itemId)}${e.source === 'wish' ? ` (${e.rank}. Wunsch)` : e.source === 'fallback' ? ' (Ersatzplatz)' : e.source === 'fixed' ? ' (Klasse)' : ''}`).join('; ')
        return [{ type: String, value: text }, { type: Number, value: onDay.reduce((sum, e) => sum + (e.minutesByDate[date] ?? 0), 0) }]
      })
      const fee = s.items.reduce((sum, e) => sum + (items.get(e.itemId)?.feeCents ?? 0), 0)
      return [
        { type: String, value: s.className },
        { type: Number, value: s.grade },
        { type: String, value: s.displayName },
        { type: String, value: s.window === null ? 'keine Wünsche' : s.window === 'first' ? 'Anmeldefenster' : 'Nachfrist' },
        ...perDay,
        { type: Number, value: s.days.reduce((sum, d) => sum + d.deficit, 0) },
        { type: Number, value: fee / 100, format: '#,##0.00' },
      ]
    }),
  ]
  const participants = [
    ['Nr.', 'Aktivität', 'Klasse', 'Name', 'Art', 'Wunsch'].map(header),
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
    ['Nr.', 'Aktivität', 'Plätze', 'Zugeteilt', 'Fix (Klassen)', 'Minimum', 'Abgesagt', 'Beitrag (€)'].map(header),
    ...review.items.map((item) => [
      { type: Number, value: item.number ?? undefined },
      { type: String, value: item.title },
      { type: Number, value: item.places },
      { type: Number, value: item.assigned },
      { type: Number, value: item.fixed },
      { type: Number, value: item.minimum },
      { type: String, value: item.cancelled ? 'ja' : '' },
      { type: Number, value: item.feeCents / 100, format: '#,##0.00' },
    ]),
  ]
  const deficits = [
    ['Klasse', 'Name', 'Tag', 'Fehlende Minuten'].map(header),
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
        sheet: 'Änderungen',
        columns: [{ width: 6 }, { width: 18 }, { width: 12 }, { width: 8 }, { width: 30 }, { width: 36 }, { width: 36 }, { width: 40 }, { width: 10 }, { width: 24 }],
        data: [
          ['Nr.', 'Wann', 'Art', 'Klasse', 'Name', 'Nicht mehr', 'Neu', 'Begründung', 'Erzwungen', 'Durch'].map(header),
          ...changes.map((c) => [
            { type: Number, value: c.seq },
            { type: Date, value: new Date(c.changedAt), format: 'dd.mm.yyyy hh:mm' },
            { type: String, value: CHANGE_KIND_LABELS[c.kind] ?? c.kind },
            { type: String, value: c.className },
            { type: String, value: c.displayName },
            { type: String, value: c.leftItemIds.map(label).join('; ') },
            { type: String, value: c.toItemId === null ? '' : label(c.toItemId) },
            { type: String, value: c.reason ?? '' },
            { type: String, value: c.forced ? 'ja' : '' },
            { type: String, value: c.changedBy.displayName },
          ]),
        ],
      }]
  const workbook = writeXlsxFile([
    { sheet: 'Schülerinnen und Schüler', columns: [{ width: 8 }, { width: 10 }, { width: 30 }, { width: 16 }, ...review.projectDays.flatMap(() => [{ width: 40 }, { width: 9 }]), { width: 16 }, { width: 12 }], data: students },
    { sheet: 'Teilnehmer', columns: [{ width: 6 }, { width: 36 }, { width: 8 }, { width: 30 }, { width: 16 }, { width: 8 }], data: participants },
    { sheet: 'Aktivitäten', columns: [{ width: 6 }, { width: 36 }, { width: 8 }, { width: 10 }, { width: 12 }, { width: 9 }, { width: 9 }, { width: 12 }], data: activities },
    { sheet: 'Fehlende Minuten', columns: [{ width: 8 }, { width: 30 }, { width: 16 }, { width: 16 }], data: deficits },
    ...changed,
  ])
  return workbook.toBuffer()
}

const dayShort = new Intl.DateTimeFormat('de-AT', { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit' })
