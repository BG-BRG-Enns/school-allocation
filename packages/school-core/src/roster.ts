// The roster: who takes part, in which class, as one import batch holds it
// (docs/data-sources.md §2–3). An entry comes from an Entra group through
// Microsoft Graph, carrying the member's object id, or from a CSV upload,
// carrying the school address. The checks a batch must pass before it is
// stored, and the diff between two batches, are here, pure, so the API
// and the browser compute the same thing.

export const PERSON_KINDS = ['student', 'teacher'] as const
export type PersonKind = typeof PERSON_KINDS[number]

export function isPersonKind(value: unknown): value is PersonKind {
  return typeof value === 'string' && (PERSON_KINDS as readonly string[]).includes(value)
}

/** A class name as a school writes it: "5A", "1 B", "4.C"; short, nothing a list would not show. */
export const CLASS_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._/-]{0,15}$/u
/** Schulstufe: 1 (first year of primary school) to 13. */
export const GRADES = { min: 1, max: 13 } as const

/** A class as a school names its groups: a digit and one or two letters or digits, "5A", "1B", "7AB". */
const CLASS_TOKEN = /^\p{N}[\p{L}\p{N}]{1,2}$/u

/**
 * The class a group's name denotes, when it does: the name itself ("5A")
 * or one word of it ("Klasse 5A", "5A Schüler/innen"); undefined when no
 * word or more than one is a class.
 */
export function classNameOf(groupName: string): string | undefined {
  const classes = groupName.split(/[\s,;:()[\]]+/u).filter((word) => CLASS_TOKEN.test(word))
  return classes.length === 1 ? classes[0] : undefined
}

/** Whether a group's name is nothing but a class, "5A": the groups the bulk search takes. */
export function isClassGroupName(groupName: string): boolean {
  return CLASS_TOKEN.test(groupName)
}

/**
 * The Schulstufe a class name suggests, as a default to edit: the leading
 * number plus four, the convention of the Mittelschule and the AHS, whose
 * 1. Klasse is the 5. Schulstufe. Undefined outside the grades, as for a
 * BHS's 1. Jahrgang (9. Schulstufe), which has to be entered.
 */
export function gradeOfClass(className: string): number | undefined {
  const leading = /^(\d{1,2})/.exec(className.trim())
  if (!leading) return undefined
  const grade = Number(leading[1]) + 4
  return grade >= GRADES.min && grade <= GRADES.max && Number(leading[1]) <= 8 ? grade : undefined
}

/** One row of a roster, as imported; keyed by `oid` (Graph) or, without one, by the address (CSV). */
export interface RosterEntry {
  kind: PersonKind
  /** The Entra object id, lower-case; present for entries from Graph. */
  oid?: string
  /** The user principal name, as Entra has it. */
  upn?: string
  /** The address notifications go to. */
  mail?: string
  displayName: string
  /** Students only. */
  className?: string
  /** Students only: the Schulstufe. */
  grade?: number
  /** The class teacher's address, from a CSV column; nothing is derived from it yet. */
  classTeacherMail?: string
}

/**
 * What identifies an entry across batches: the object id when the source
 * knows it, otherwise the address, in lower case. The same key in two
 * batches is the same person; nothing is matched by name.
 */
export function rosterKey(entry: Pick<RosterEntry, 'oid' | 'mail' | 'upn'>): string | undefined {
  if (entry.oid) return entry.oid.toLowerCase()
  const address = entry.mail ?? entry.upn
  return address === undefined ? undefined : address.toLowerCase()
}

export const ROSTER_PROBLEM_CODES = [
  /** Nobody in the batch: committing it would remove everyone. */
  'empty_roster',
  /** Neither an object id nor an address. */
  'no_key',
  /** The same person twice. */
  'duplicate_key',
  /** Two entries with one address: the address could bind either, so neither is taken. */
  'duplicate_address',
  /** The same person as a student and as a teacher. */
  'both_kinds',
  /** A student without a class or a grade. */
  'student_without_class',
  /** A teacher with a class or a grade, which the roster does not hold for teachers. */
  'teacher_with_class',
  'invalid_class_name',
  'invalid_grade',
  'invalid_address',
  'invalid_name',
  'invalid_kind',
] as const
export type RosterProblemCode = typeof ROSTER_PROBLEM_CODES[number]

/** Why a batch, or a row of a CSV, is refused: the rule, the key or line it is about. Never a value of the row. */
export interface RosterProblem {
  code: RosterProblemCode
  /** The entry's key, where it has one. */
  key?: string
  /** The CSV line, counted from 1 with the header; absent for entries from Graph. */
  line?: number
}

// The domain as one character, the rest up to the next dot, then the rest: the addresses `…+\.…+` takes,
// without trying every dot as the one that splits the domain.
const ADDRESS = /^[^\s@\p{Cc}\p{Cs}]+@[^\s@\p{Cc}\p{Cs}][^\s@.\p{Cc}\p{Cs}]*\.[^\s@\p{Cc}\p{Cs}]+$/u
const NAME = /^(?=.*\S)[^\p{Cc}\p{Cs}\p{Zl}\p{Zp}]{1,256}$/u
const MAX_ADDRESS = 254

/** Whether `text` is an e-mail address as the roster accepts one. */
export function isAddress(text: string): boolean {
  return text.length <= MAX_ADDRESS && ADDRESS.test(text)
}

/** The problems of one entry, without regard to the others. */
export function checkEntry(entry: RosterEntry): RosterProblem[] {
  const key = rosterKey(entry)
  const problems: RosterProblem[] = []
  const problem = (code: RosterProblemCode) => problems.push(key === undefined ? { code } : { code, key })
  if (!isPersonKind(entry.kind)) problem('invalid_kind')
  if (key === undefined) problem('no_key')
  for (const address of [entry.mail, entry.upn, entry.classTeacherMail]) {
    if (address !== undefined && (address.length > MAX_ADDRESS || !ADDRESS.test(address))) {
      problem('invalid_address')
      break
    }
  }
  if (!NAME.test(entry.displayName)) problem('invalid_name')
  if (entry.className !== undefined && !CLASS_NAME.test(entry.className)) problem('invalid_class_name')
  if (entry.grade !== undefined && (!Number.isInteger(entry.grade) || entry.grade < GRADES.min || entry.grade > GRADES.max)) problem('invalid_grade')
  if (entry.kind === 'student' && (entry.className === undefined || entry.grade === undefined)) problem('student_without_class')
  if (entry.kind === 'teacher' && (entry.className !== undefined || entry.grade !== undefined)) problem('teacher_with_class')
  return problems
}

/**
 * The problems of a batch: each entry's own, and the same person twice,
 * or as a student and as a teacher (docs/data-sources.md §3: such a batch
 * is rejected whole). Empty when the batch may be stored.
 */
export function checkRoster(entries: readonly RosterEntry[]): RosterProblem[] {
  if (entries.length === 0) return [{ code: 'empty_roster' }]
  const problems = entries.flatMap(checkEntry)
  const kindsByKey = new Map<string, Set<PersonKind>>()
  const seen = new Set<string>()
  const addressOwner = new Map<string, string>()
  for (const entry of entries) {
    const key = rosterKey(entry)
    if (key === undefined) continue
    const kinds = kindsByKey.get(key) ?? new Set()
    kinds.add(entry.kind)
    kindsByKey.set(key, kinds)
    if (seen.has(key)) problems.push({ code: kinds.size > 1 ? 'both_kinds' : 'duplicate_key', key })
    seen.add(key)
    for (const address of addressesOf(entry)) {
      const owner = addressOwner.get(address)
      if (owner !== undefined && owner !== key) problems.push({ code: 'duplicate_address', key })
      addressOwner.set(address, owner ?? key)
    }
  }
  return problems
}

/** The addresses an entry carries, lower-cased, without repeats. */
export function addressesOf(entry: Pick<RosterEntry, 'mail' | 'upn'>): string[] {
  return [...new Set([entry.mail, entry.upn].filter((a): a is string => a !== undefined).map((a) => a.toLowerCase()))]
}

/**
 * Finds, for an entry of a new batch, the entry of the previous batch that
 * is the same person: by key, or, when the source changed and the key with
 * it (a CSV roster keyed by address replaced by a Graph roster keyed by
 * object id, or the other way round), by an address both carry and only
 * one previous entry has. Never by name, and never across two object ids:
 * a new account at an old address is a new person until an administrator
 * says otherwise.
 */
export function previousOf<E extends RosterEntry>(previous: readonly E[]): (entry: RosterEntry) => E | undefined {
  const byKey = new Map<string, E>()
  const byAddress = new Map<string, E[]>()
  for (const entry of previous) {
    const key = rosterKey(entry)
    if (key !== undefined) byKey.set(key, entry)
    for (const address of addressesOf(entry)) byAddress.set(address, [...(byAddress.get(address) ?? []), entry])
  }
  return (entry) => {
    const key = rosterKey(entry)
    if (key !== undefined && byKey.has(key)) return byKey.get(key)
    for (const address of addressesOf(entry)) {
      const candidates = byAddress.get(address)
      if (candidates?.length !== 1) continue
      const candidate = candidates[0] as E
      if (entry.oid !== undefined && candidate.oid !== undefined && candidate.oid.toLowerCase() !== entry.oid.toLowerCase()) return undefined
      return candidate
    }
    return undefined
  }
}

/** How an entry changed between two batches: the fields that differ. The user principal name is an identity hint, not roster content, and is not compared. */
export const ROSTER_CHANGED_FIELDS = ['kind', 'displayName', 'className', 'grade', 'mail', 'classTeacherMail'] as const
export type ChangedField = typeof ROSTER_CHANGED_FIELDS[number]
const COMPARED = ROSTER_CHANGED_FIELDS

export interface RosterChange<E extends RosterEntry = RosterEntry> {
  key: string
  before: E
  after: E
  fields: ChangedField[]
}

/** Generic in the entry, so a diff of stored entries keeps their ids. */
export interface RosterDiff<E extends RosterEntry = RosterEntry> {
  added: E[]
  removed: E[]
  changed: RosterChange<E>[]
  unchanged: number
}

export interface RosterDiffSummary {
  added: number
  removed: number
  changed: number
  unchanged: number
}

/**
 * The difference between the roster in force and a new batch: who is new,
 * who is gone, whose class, grade, kind, name or address changed. Entries
 * are the same person as previousOf() finds them. Entries without a key
 * are counted as added; checkRoster refuses them before a batch is stored.
 */
export function diffRoster<E extends RosterEntry>(previous: readonly E[], next: readonly E[]): RosterDiff<E> {
  const find = previousOf(previous)
  const diff: RosterDiff<E> = { added: [], removed: [], changed: [], unchanged: 0 }
  const seen = new Set<E>()
  for (const entry of next) {
    const key = rosterKey(entry)
    const old = find(entry)
    if (key === undefined || old === undefined || seen.has(old)) {
      diff.added.push(entry)
      continue
    }
    seen.add(old)
    const fields = COMPARED.filter((field) => comparable(old[field]) !== comparable(entry[field]))
    if (fields.length === 0) diff.unchanged += 1
    else diff.changed.push({ key, before: old, after: entry, fields })
  }
  for (const entry of previous) {
    if (!seen.has(entry)) diff.removed.push(entry)
  }
  return diff
}

// Addresses differ in case between sources and between exports of one
// source, and the case of an address means nothing; the other fields are
// compared as they are.
function comparable(value: string | number | undefined): string | number | undefined {
  return typeof value === 'string' && value.includes('@') ? value.toLowerCase() : value
}

export function summarizeDiff(diff: RosterDiff<RosterEntry>): RosterDiffSummary {
  return { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length, unchanged: diff.unchanged }
}
