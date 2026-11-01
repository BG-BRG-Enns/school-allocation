// The CSV a school uploads about its teachers' availability on the project
// days, so the organizer does not click it in for sixty teachers: a row per
// teacher, named by address or abbreviation, a column per project day. Read
// here, pure, as the teacher list is; the API matches the teachers against
// the roster and writes.
//
// The sheet a school keeps says "MO", "DI", "MI" over the days and writes
// nothing, "N" or "F" into them; a "Leitung" column it may have is ignored
// and said so, and an "Anmerkung" is the note. Any other column is a
// problem, not ignored: a mistyped day would otherwise lose a column.

import { AVAILABILITY_STATUSES, type AvailabilityStatus } from './planning.ts'
import { parseCsv, type CsvProblem } from './roster-csv.ts'
import { isAddress } from './roster.ts'
import { checkRows, isBlank, own, readCell, SHORT_NAME_MAX } from './teacher-csv.ts'

/** The most characters a note has. */
export const NOTE_MAX = 200

/** A header's spellings, lower case, for the columns that are not days. */
const ALIASES: Readonly<Record<string, 'email' | 'short_name' | 'note' | 'ignored'>> = {
  'email': 'email',
  'e-mail': 'email',
  'mail': 'email',
  'address email': 'email',
  'short_name': 'short_name',
  'kürzel': 'short_name',
  'kuerzel': 'short_name',
  'name': 'short_name',
  'note': 'note',
  'anmerkung': 'note',
  'bemerkung': 'note',
  'leitung': 'ignored',
}

/** A weekday's spellings, lower case, to its ISO number (Monday 1). */
const WEEKDAYS: Readonly<Record<string, number>> = {
  mo: 1, montag: 1, mon: 1, monday: 1,
  di: 2, dienstag: 2, tue: 2, tues: 2, tuesday: 2,
  mi: 3, mittwoch: 3, wed: 3, wednesday: 3,
  do: 4, donnerstag: 4, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fr: 5, freitag: 5, fri: 5, friday: 5,
  sa: 6, samstag: 6, sat: 6, saturday: 6,
  so: 7, sonntag: 7, sun: 7, sunday: 7,
}

/** A cell's spellings, lower case and trimmed, to a status; the empty cell is available. */
const VALUES: Readonly<Record<string, AvailabilityStatus>> = {
  '': 'available',
  'verfügbar': 'available',
  'verfuegbar': 'available',
  'available': 'available',
  'ja': 'available',
  'j': 'available',
  'yes': 'available',
  'y': 'available',
  'n': 'unavailable',
  'nein': 'unavailable',
  'no': 'unavailable',
  'nicht verfügbar': 'unavailable',
  'nicht verfuegbar': 'unavailable',
  'unavailable': 'unavailable',
  '-': 'unavailable',
  'f': 'if_needed',
  'nur wenn nötig': 'if_needed',
  'nur wenn noetig': 'if_needed',
  'wenn nötig': 'if_needed',
  'wenn noetig': 'if_needed',
  'if_needed': 'if_needed',
  'if needed': 'if_needed',
  'only if necessary': 'if_needed',
  'if necessary': 'if_needed',
}

export const AVAILABILITY_CSV_PROBLEM_CODES = [
  /** Neither an address nor an abbreviation in the row. */
  'key_missing',
  /** The e-mail field is no address. */
  'email_invalid',
  /** An abbreviation longer than SHORT_NAME_MAX. */
  'short_name_too_long',
  /** A day's cell says none of the three. */
  'status_invalid',
  /** A note longer than NOTE_MAX. */
  'note_too_long',
] as const
export type AvailabilityCsvProblemCode = typeof AVAILABILITY_CSV_PROBLEM_CODES[number]

export interface AvailabilityCsvProblem {
  code: AvailabilityCsvProblemCode
  /** The line, counted from 1 with the header. */
  line: number
  /** What the problem is about: the cell's text, the address, the abbreviation. */
  key?: string
}

/** One row as read: who, their status per project day the file has a column for, and the note where the file has one. */
export interface AvailabilityCsvRow {
  line: number
  email?: string
  shortName?: string
  /** Per project day (ISO date) the status; only the days the file has columns for. */
  days: Record<string, AvailabilityStatus>
  /** The note: a text, or null for an empty cell; absent when the file has no note column. */
  note?: string | null
}

export interface AvailabilityCsvResult {
  rows: AvailabilityCsvRow[]
  /** Problems of the file's shape or header; with any of these, `rows` is empty. */
  fileProblems: CsvProblem[]
  problems: AvailabilityCsvProblem[]
  /** Header names read as nothing (a "Leitung" column), as written. */
  ignoredColumns: string[]
  /** The project days the file has columns for, in the file's order. */
  days: string[]
  /** Whether the file has a note column. */
  hasNote: boolean
}

/** The ISO weekday (Monday 1) of a local date, by arithmetic alone (Sakamoto); a pure module has no clock. */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  const year = m < 3 ? y - 1 : y
  const day = (year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400) + (offsets[m - 1] ?? 0) + d) % 7
  return day === 0 ? 7 : day
}

/**
 * Parses the availability list against a registration's project days. A
 * day column is headed by the date (`2034-07-03`) or by a weekday in
 * German or English; a weekday that two project days share needs the
 * date. The row's key is the address or the abbreviation, either.
 */
export function parseAvailabilityCsv(text: string, projectDays: readonly string[]): AvailabilityCsvResult {
  const none = (fileProblems: CsvProblem[], ignoredColumns: string[] = []): AvailabilityCsvResult => ({ rows: [], fileProblems, problems: [], ignoredColumns, days: [], hasNote: false })
  const parsed = parseCsv(text)
  if (parsed.problem) return none([parsed.problem])
  const [header, ...records] = parsed.records
  if (header === undefined) return none([{ code: 'no_header' }])
  const columns = new Map<'email' | 'short_name' | 'note', number>()
  const dayColumns = new Map<string, number>()
  const ignored: string[] = []
  const fileProblems: CsvProblem[] = []
  // Columns without a header: tolerated while empty (a trailing separator), refused once a record has anything in one.
  const unnamed: number[] = []
  header.forEach((raw, i) => {
    const name = raw.trim()
    const lower = name.toLowerCase()
    const known = own(ALIASES, lower)
    if (known === 'ignored') {
      ignored.push(name)
      return
    }
    if (known !== undefined) {
      // Two headers for one thing ("note" and "Anmerkung", say) would let one silently win: refused.
      if (columns.has(known)) fileProblems.push({ code: 'duplicate_column', column: name })
      else columns.set(known, i)
      return
    }
    // A day named twice (the weekday and its date, say) would let one column silently win: refused instead.
    const dayColumn = (date: string) => {
      if (dayColumns.has(date)) fileProblems.push({ code: 'duplicate_column', column: name })
      else dayColumns.set(date, i)
    }
    if (projectDays.includes(lower)) {
      dayColumn(lower)
      return
    }
    const weekday = own(WEEKDAYS, lower)
    if (weekday !== undefined) {
      const matching = projectDays.filter((date) => weekdayOf(date) === weekday)
      if (matching.length === 1) dayColumn(matching[0] as string)
      else fileProblems.push({ code: matching.length === 0 ? 'unknown_column' : 'day_ambiguous', column: name })
      return
    }
    if (name === '') unnamed.push(i)
    else fileProblems.push({ code: 'unknown_column', column: name })
  })
  if (columns.size === 0 && dayColumns.size === 0) return none([{ code: 'no_header' }], ignored)
  if (!columns.has('email') && !columns.has('short_name')) fileProblems.push({ code: 'missing_column', column: 'email' })
  if (dayColumns.size === 0 && !columns.has('note')) fileProblems.push({ code: 'missing_column', column: projectDays[0] ?? 'day' })
  if (fileProblems.length > 0) return none(fileProblems, ignored)
  const shapeProblems = checkRows(records, header.length)
  if (shapeProblems.length > 0) return none(shapeProblems, ignored)
  const filledUnnamed = unnamed.filter((i) => records.some((fields) => (fields[i] ?? '').trim() !== ''))
  if (filledUnnamed.length > 0) return none(filledUnnamed.map((i) => ({ code: 'unknown_column' as const, column: `#${i + 1}` })), ignored)
  const rows: AvailabilityCsvRow[] = []
  const problems: AvailabilityCsvProblem[] = []
  // Every cell without the apostrophe the template puts before a value that starts like a formula: an address, an
  // abbreviation or a note comes back as it went out.
  const cell = (fields: readonly string[], i: number | undefined): string | undefined => (i === undefined ? undefined : readCell(fields[i]))
  records.forEach((fields, i) => {
    if (isBlank(fields)) return
    const line = i + 2
    const email = cell(fields, columns.get('email'))?.toLowerCase()
    const shortName = cell(fields, columns.get('short_name'))
    if (email === undefined && shortName === undefined) {
      problems.push({ code: 'key_missing', line })
      return
    }
    if (email !== undefined && !isAddress(email)) {
      problems.push({ code: 'email_invalid', line, key: email })
      return
    }
    if (shortName !== undefined && shortName.length > SHORT_NAME_MAX) {
      problems.push({ code: 'short_name_too_long', line, key: shortName })
      return
    }
    const days: Record<string, AvailabilityStatus> = {}
    let sound = true
    for (const [date, index] of dayColumns) {
      // A status cell has a fixed vocabulary, so a leading apostrophe (a spreadsheet's text marker) is never part of it.
      const raw = (fields[index] ?? '').trim().replace(/^'/, '')
      const status = own(VALUES, raw.toLowerCase())
      if (status === undefined) {
        problems.push({ code: 'status_invalid', line, key: raw })
        sound = false
        continue
      }
      days[date] = status
    }
    const noteIndex = columns.get('note')
    const note = noteIndex === undefined ? undefined : (cell(fields, noteIndex) ?? null)
    if (note !== undefined && note !== null && note.length > NOTE_MAX) {
      problems.push({ code: 'note_too_long', line })
      sound = false
    }
    if (!sound) return
    rows.push({ line, ...(email === undefined ? {} : { email }), ...(shortName === undefined ? {} : { shortName }), days, ...(note === undefined ? {} : { note }) })
  })
  return { rows, fileProblems: [], problems, ignoredColumns: ignored, days: [...dayColumns.keys()], hasNote: columns.has('note') }
}

/** The statuses a cell may say, for a template's legend: the first spelling of each. */
export const AVAILABILITY_CSV_VALUES: Readonly<Record<AvailabilityStatus, string>> = { available: '', unavailable: 'N', if_needed: 'F' }

// AVAILABILITY_STATUSES is the contract's list; the map above must know every one of them.
const _every: readonly AvailabilityStatus[] = AVAILABILITY_STATUSES
void _every
