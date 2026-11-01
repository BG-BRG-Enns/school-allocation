// The CSV a school uploads about its teachers, so nobody types what the
// school already has in a list: the abbreviation every teacher goes by
// (the Kürzel) and the class each is class teacher of. Read here, pure, as
// the roster CSV is; the API matches the addresses against the roster and
// judges the rest.
//
// The columns are the school's own words where it has them: a staff list
// exported from a school's system says "Address Email", "Name" for the
// abbreviation and "Kv Von" for the class, and such a file is read as it
// is. Other columns (a long name, subjects) are ignored and named as
// ignored, so a column nobody meant to drop is seen.

import { CSV_LIMITS, parseCsv, type CsvProblem } from './roster-csv.ts'
import { isAddress } from './roster.ts'

/** The columns, by their canonical header names; `email` is required. */
export const TEACHER_CSV_COLUMNS = ['email', 'short_name', 'class'] as const
export type TeacherCsvColumn = typeof TEACHER_CSV_COLUMNS[number]

/** A header's spellings, lower case, as a school's export or a hand-made file writes them. */
const ALIASES: Readonly<Record<string, TeacherCsvColumn>> = {
  'email': 'email',
  'e-mail': 'email',
  'mail': 'email',
  'address email': 'email',
  'short_name': 'short_name',
  'kürzel': 'short_name',
  'kuerzel': 'short_name',
  'name': 'short_name',
  'class': 'class',
  'klasse': 'class',
  'class_name': 'class',
  'kv von': 'class',
  'kv': 'class',
}

/** The most letters an abbreviation has. */
export const SHORT_NAME_MAX = 8

/** An abbreviation: letters, digits, a dot or a hyphen, starting with a letter or digit, up to SHORT_NAME_MAX; nothing a spreadsheet would read as a formula, nothing a database refuses. */
export const SHORT_NAME = /^[\p{L}\p{N}][\p{L}\p{N}.-]{0,7}$/u

/**
 * A cell as read: trimmed, and without the apostrophe the template puts
 * before a value a spreadsheet would read as a formula (an address may
 * start with "+" or "-"), so a template comes back as it went out.
 */
export function readCell(raw: string | undefined): string | undefined {
  const value = raw?.trim().replace(/^'(?=[=+\-@\t\r])/, '')
  return value === undefined || value === '' ? undefined : value
}

/** A table's own entry for `key`, never one inherited from Object (a header saying "constructor" is no column). */
export function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined
}

/** The file a school starts from: the header and rows that show every column. */
export const TEACHER_CSV_TEMPLATE = [
  'email;short_name;class',
  'anna.zwexmhofer@schule.example.org;ZwA;',
  'bernd.pfnoexlhofer@schule.example.org;PfB;5A',
  '',
].join('\r\n')

export const TEACHER_CSV_PROBLEM_CODES = [
  /** The e-mail field is empty or no address. */
  'email_invalid',
  /** An abbreviation that is not one: longer than SHORT_NAME_MAX, or with characters other than letters, digits, dot and hyphen. */
  'short_name_invalid',
  /** One teacher with two different abbreviations in the file (judged by the API, by identity). */
  'short_name_inconsistent',
  /** One abbreviation for two different teachers in the file (judged by the API, by identity). */
  'short_name_taken',
  /** A class name the roster could not have. */
  'class_invalid',
] as const
export type TeacherCsvProblemCode = typeof TEACHER_CSV_PROBLEM_CODES[number]

export interface TeacherCsvProblem {
  code: TeacherCsvProblemCode
  /** The line, counted from 1 with the header. */
  line: number
  /** The address or abbreviation the problem is about. */
  key?: string
}

/** One row as read: the address lower-cased, the rest trimmed; an empty field is absent. */
export interface TeacherCsvRow {
  line: number
  email: string
  shortName?: string
  className?: string
}

export interface TeacherCsvResult {
  /** The rows, when the file is well-formed; a row with a problem is left out. */
  rows: TeacherCsvRow[]
  /** Problems of the file's shape; with any of these, `rows` is empty. */
  fileProblems: CsvProblem[]
  /** Problems of single rows, each with its line. */
  problems: TeacherCsvProblem[]
  /** Header names the file has and this import does not read, as written. */
  ignoredColumns: string[]
  /** Which of the optional columns the file has. */
  columns: TeacherCsvColumn[]
}

const CLASS_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._/-]{0,15}$/u

/** Reads the header: each column's index, the unknown names, and the shape problems. */
export function readHeader(header: readonly string[], required: readonly TeacherCsvColumn[]): { index: Map<TeacherCsvColumn, number>, ignored: string[], problems: CsvProblem[] } {
  const index = new Map<TeacherCsvColumn, number>()
  const ignored: string[] = []
  header.forEach((name, i) => {
    const column = own(ALIASES, name.trim().toLowerCase())
    if (column !== undefined && !index.has(column)) index.set(column, i)
    else if (name.trim() !== '') ignored.push(name.trim())
  })
  const problems: CsvProblem[] = []
  if (index.size === 0) return { index, ignored, problems: [{ code: 'no_header' }] }
  for (const column of required) if (!index.has(column)) problems.push({ code: 'missing_column', column })
  return { index, ignored, problems }
}

/** A record a spreadsheet leaves behind: no field with anything in it. Skipped, with its line number kept for the rest. */
export function isBlank(fields: readonly string[]): boolean {
  return fields.every((field) => field.trim() === '')
}

/** The shape problems every row-based file shares: the count of rows and fields, the length of a field; blank records do not count. */
export function checkRows(rows: readonly (readonly string[])[], width: number): CsvProblem[] {
  const filled = rows.filter((fields) => !isBlank(fields))
  if (filled.length === 0) return [{ code: 'empty' }]
  if (filled.length > CSV_LIMITS.rows) return [{ code: 'too_many_rows' }]
  const problems: CsvProblem[] = []
  rows.forEach((fields, i) => {
    if (isBlank(fields)) return
    const line = i + 2
    if (fields.length !== width) problems.push({ code: 'field_count', line })
    else if (fields.some((field) => field.length > CSV_LIMITS.field)) problems.push({ code: 'field_too_long', line })
  })
  return problems
}

/**
 * Parses the teacher list. A row names a teacher by address; what else it
 * says is optional: the abbreviation, the class. The same teacher may come
 * again with another class (a class teacher of two classes). Whether the
 * abbreviations agree per teacher and are each one teacher's is judged
 * after the addresses are resolved (a teacher may be named by mail and by
 * UPN), so by the API, with this module's codes.
 */
export function parseTeacherCsv(text: string): TeacherCsvResult {
  const none = (fileProblems: CsvProblem[]): TeacherCsvResult => ({ rows: [], fileProblems, problems: [], ignoredColumns: [], columns: [] })
  const parsed = parseCsv(text)
  if (parsed.problem) return none([parsed.problem])
  const [header, ...records] = parsed.records
  if (header === undefined) return none([{ code: 'no_header' }])
  const { index, ignored, problems: headerProblems } = readHeader(header, ['email'])
  if (headerProblems.length > 0) return { ...none(headerProblems), ignoredColumns: ignored }
  const shapeProblems = checkRows(records, header.length)
  if (shapeProblems.length > 0) return { ...none(shapeProblems), ignoredColumns: ignored }
  const field = (fields: readonly string[], column: TeacherCsvColumn): string | undefined => {
    const i = index.get(column)
    return i === undefined ? undefined : readCell(fields[i])
  }
  const rows: TeacherCsvRow[] = []
  const problems: TeacherCsvProblem[] = []
  records.forEach((fields, i) => {
    if (isBlank(fields)) return
    const line = i + 2
    const email = field(fields, 'email')?.toLowerCase()
    if (email === undefined || !isAddress(email)) {
      problems.push({ code: 'email_invalid', line, ...(email === undefined ? {} : { key: email }) })
      return
    }
    const shortName = field(fields, 'short_name')
    const className = field(fields, 'class')
    let sound = true
    if (shortName !== undefined && !SHORT_NAME.test(shortName)) {
      problems.push({ code: 'short_name_invalid', line, key: shortName })
      sound = false
    }
    if (className !== undefined && !CLASS_NAME.test(className)) {
      problems.push({ code: 'class_invalid', line, key: className })
      sound = false
    }
    if (!sound) return
    rows.push({ line, email, ...(shortName === undefined ? {} : { shortName }), ...(className === undefined ? {} : { className }) })
  })
  return { rows, fileProblems: [], problems, ignoredColumns: ignored, columns: [...index.keys()].filter((c) => c !== 'email') }
}
