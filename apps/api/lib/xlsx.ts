// The catalogue as a workbook for the organizer's and the school's own
// spreadsheets: one sheet of activities, one of sessions. Columns are typed
// so the sheet sorts and sums; nothing about students is in it.

import writeXlsxFile from 'write-excel-file/node'
import type { Item } from './items.ts'
import { SCHOOL_TIME_ZONE } from './time.ts'

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
