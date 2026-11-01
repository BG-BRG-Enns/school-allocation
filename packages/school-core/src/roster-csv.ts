// The CSV a school uploads instead of reading its Entra groups
// (docs/data-sources.md §3 B): one row per person, with the school address
// the person is bound to at their first sign-in. Parsed here, pure, so the
// browser can show the problems of a file before it is sent and the API
// refuses the same files.
//
// The format is what a spreadsheet saves: a header line naming the
// columns, a comma or a semicolon between fields (the header decides),
// quotes around a field that contains the separator, a quote or a line
// break, a doubled quote inside a quoted field (RFC 4180), CRLF or LF, an
// optional byte-order mark.

import type { PersonKind, RosterEntry, RosterProblem } from './roster.ts'

/** The columns, by their header names; `upn` and `class_teacher_email` are optional, and either `email` or `upn` must be present. */
export const CSV_COLUMNS = ['email', 'upn', 'given_name', 'family_name', 'class', 'grade', 'kind', 'class_teacher_email'] as const
type Column = typeof CSV_COLUMNS[number]

/** The file a school starts from: the header and two rows that show every column. */
export const ROSTER_CSV_TEMPLATE = [
  'email;given_name;family_name;class;grade;kind;class_teacher_email',
  'sara.pfnaexthuber@schule.example.org;Sara;Pfnäxthuber;5A;9;student;anna.zwexmhofer@schule.example.org',
  'anna.zwexmhofer@schule.example.org;Anna;Zwexmhofer;;;teacher;',
  '',
].join('\r\n')

/** What is written in the `kind` column, in English or German, either case. */
const KINDS: Readonly<Record<string, PersonKind>> = {
  'student': 'student',
  'schüler': 'student',
  'schülerin': 'student',
  'schueler': 'student',
  'schuelerin': 'student',
  'schüler/in': 'student',
  'teacher': 'teacher',
  'lehrer': 'teacher',
  'lehrerin': 'teacher',
  'lehrer/in': 'teacher',
  'lehrkraft': 'teacher',
}

export const CSV_LIMITS = {
  /** Rows after the header. A school is smaller; a file beyond this is not a roster. */
  rows: 5000,
  /** Characters in one field. */
  field: 256,
} as const

export const CSV_PROBLEM_CODES = [
  /** No header line, or a header that names none of the columns. */
  'no_header',
  /** A required column is missing from the header. */
  'missing_column',
  /** A row has more or fewer fields than the header. */
  'field_count',
  /** A field is longer than CSV_LIMITS.field. */
  'field_too_long',
  /** More rows than CSV_LIMITS.rows. */
  'too_many_rows',
  /** A quote that does not close, or text after a closing quote. */
  'malformed_quote',
  /** The file holds no rows. */
  'empty',
] as const
export type CsvProblemCode = typeof CSV_PROBLEM_CODES[number]

/** A problem with the file itself, before its rows are looked at. */
export interface CsvProblem {
  code: CsvProblemCode
  /** The line, counted from 1. */
  line?: number
  /** The column a `missing_column` is about. */
  column?: Column
}

export interface RosterCsvResult {
  /** The rows as entries, when the file is well-formed; row problems (checkEntry's) are in `problems`. */
  entries: RosterEntry[]
  /** Problems of the file's shape; with any of these, `entries` is empty. */
  fileProblems: CsvProblem[]
  /** Problems of single rows, each with its line. */
  problems: RosterProblem[]
}

/**
 * Parses a roster CSV into entries. The entries still go through
 * checkRoster: this reads the rows; that one judges the batch.
 */
export function parseRosterCsv(text: string): RosterCsvResult {
  const parsed = parseCsv(text)
  if (parsed.problem) return { entries: [], fileProblems: [parsed.problem], problems: [] }
  const [header, ...rows] = parsed.records
  if (header === undefined) return { entries: [], fileProblems: [{ code: 'no_header' }], problems: [] }
  const columns = header.map((name) => name.trim().toLowerCase().replace(/^﻿/, ''))
  const index = (column: Column) => columns.indexOf(column)
  const known = columns.filter((name): name is Column => (CSV_COLUMNS as readonly string[]).includes(name))
  if (known.length === 0) return { entries: [], fileProblems: [{ code: 'no_header' }], problems: [] }
  const fileProblems: CsvProblem[] = []
  const required: Column[] = ['given_name', 'family_name', 'class', 'grade', 'kind']
  for (const column of required) if (index(column) === -1) fileProblems.push({ code: 'missing_column', column })
  if (index('email') === -1 && index('upn') === -1) fileProblems.push({ code: 'missing_column', column: 'email' })
  // A blank line, as a spreadsheet leaves at the end, is not a row; a file
  // of blank lines holds nobody and is refused like one without lines.
  const filled = rows.filter((row) => !isBlank(row))
  if (filled.length === 0) fileProblems.push({ code: 'empty' })
  if (filled.length > CSV_LIMITS.rows) fileProblems.push({ code: 'too_many_rows' })
  rows.forEach((row, i) => {
    const line = i + 2
    if (row.length !== header.length && !isBlank(row)) fileProblems.push({ code: 'field_count', line })
    if (row.some((field) => field.length > CSV_LIMITS.field)) fileProblems.push({ code: 'field_too_long', line })
  })
  if (fileProblems.length > 0) return { entries: [], fileProblems, problems: [] }

  const entries: RosterEntry[] = []
  const problems: RosterProblem[] = []
  rows.forEach((row, i) => {
    if (isBlank(row)) return
    const line = i + 2
    const field = (column: Column) => {
      const at = index(column)
      return at === -1 ? '' : (row[at] ?? '').trim()
    }
    const kindText = field('kind').toLowerCase()
    const kind = KINDS[kindText]
    if (kind === undefined) {
      problems.push({ code: 'invalid_kind', line })
      return
    }
    // Something other than a small whole number in the grade column is this
    // row's problem; the entry then has no grade, which checkEntry reports
    // for a student as well.
    const gradeText = field('grade')
    if (gradeText !== '' && !/^\d{1,2}$/.test(gradeText)) problems.push({ code: 'invalid_grade', line })
    const entry: RosterEntry = {
      kind,
      displayName: [field('given_name'), field('family_name')].filter(Boolean).join(' '),
    }
    const mail = field('email')
    const upn = field('upn')
    const className = field('class')
    const classTeacher = field('class_teacher_email')
    if (mail !== '') entry.mail = mail
    if (upn !== '') entry.upn = upn
    if (className !== '') entry.className = className
    if (/^\d{1,2}$/.test(gradeText)) entry.grade = Number(gradeText)
    if (classTeacher !== '') entry.classTeacherMail = classTeacher
    entries.push(entry)
  })
  return { entries, fileProblems: [], problems }
}

/** A record with nothing in it: an empty line, or one of separators and spaces alone. */
function isBlank(row: readonly string[]): boolean {
  return row.every((field) => field.trim() === '')
}

interface ParsedCsv {
  records: string[][]
  problem?: CsvProblem
}

/**
 * The records of a CSV text, each a list of fields. The separator is the
 * one the header line has more of, semicolon or comma. Returns the problem
 * instead when a quote does not close or is followed by text.
 */
export function parseCsv(text: string): ParsedCsv {
  const input = text.startsWith('﻿') ? text.slice(1) : text
  const firstLine = input.slice(0, input.search(/\r?\n|$/))
  const separator = count(firstLine, ';') >= count(firstLine, ',') ? ';' : ','
  const records: string[][] = []
  let fields: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let i = 0
  while (i < input.length) {
    const c = input[i] as string
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        // After the closing quote only a separator or the end of the record may follow.
        const next = input[i]
        if (next !== undefined && next !== separator && next !== '\n' && next !== '\r') {
          return { records, problem: { code: 'malformed_quote', line } }
        }
        continue
      }
      if (c === '\n') line += 1
      field += c
      i += 1
      continue
    }
    if (c === '"' && field === '') {
      quoted = true
      i += 1
      continue
    }
    if (c === separator) {
      fields.push(field)
      field = ''
      i += 1
      continue
    }
    if (c === '\r' || c === '\n') {
      fields.push(field)
      records.push(fields)
      fields = []
      field = ''
      i += c === '\r' && input[i + 1] === '\n' ? 2 : 1
      line += 1
      continue
    }
    field += c
    i += 1
  }
  if (quoted) return { records, problem: { code: 'malformed_quote', line } }
  if (field !== '' || fields.length > 0) {
    fields.push(field)
    records.push(fields)
  }
  return { records }
}

function count(text: string, char: string): number {
  let n = 0
  for (const c of text) if (c === char) n += 1
  return n
}
