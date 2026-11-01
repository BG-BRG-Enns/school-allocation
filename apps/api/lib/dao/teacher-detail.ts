// A teacher's abbreviation and note (teacher_detail), and the lookups a
// teacher list import needs against the roster in force.

import type { Queryable } from '../db.ts'
import { CURRENT_BATCH_ID } from './roster-selection.ts'

export interface TeacherDetail {
  shortName: string | null
  note: string | null
}

export interface RosterTeacherByAddress {
  personId: string
  displayName: string
}

/** The teachers of a roster (`batch`, a SQL fragment: the one in force unless given) whose mail or UPN is one of `addresses` (lower case), by that address. */
export async function findTeachersByAddress(db: Queryable, addresses: readonly string[], batch: string = CURRENT_BATCH_ID): Promise<Map<string, RosterTeacherByAddress>> {
  const { rows } = await db.query<{ person_id: string, display_name: string, mail: string | null, upn: string | null }>(
    `select e.person_id, e.display_name, lower(e.mail) as mail, lower(e.upn) as upn
       from roster_entry e
      where e.batch_id = ${batch} and e.kind = 'teacher' and e.person_id is not null
        and (lower(e.mail) = any($1::text[]) or lower(e.upn) = any($1::text[]))`,
    [addresses],
  )
  const found = new Map<string, RosterTeacherByAddress>()
  for (const row of rows) {
    for (const address of [row.mail, row.upn]) {
      if (address !== null && addresses.includes(address)) found.set(address, { personId: row.person_id, displayName: row.display_name })
    }
  }
  return found
}

/** The class names of the roster in force. */
export async function knownClasses(db: Queryable): Promise<Set<string>> {
  const { rows } = await db.query<{ class_name: string }>(
    `select distinct e.class_name from roster_entry e where e.batch_id = ${CURRENT_BATCH_ID} and e.kind = 'student' and e.class_name is not null`,
  )
  return new Set(rows.map((row) => row.class_name))
}

/** The details of the persons given, where a row exists. */
export async function readDetails(db: Queryable, personIds: readonly string[]): Promise<Map<string, TeacherDetail>> {
  const { rows } = await db.query<{ person_id: string, short_name: string | null, note: string | null }>(
    'select person_id, short_name, note from teacher_detail where person_id = any($1::uuid[])', [personIds],
  )
  return new Map(rows.map((row) => [row.person_id, { shortName: row.short_name, note: row.note }]))
}

/** Who holds each of the abbreviations given (lower case), among everyone. */
export async function shortNameOwners(db: Queryable, shortNames: readonly string[]): Promise<Map<string, string>> {
  const { rows } = await db.query<{ short_name: string, person_id: string }>(
    'select lower(short_name) as short_name, person_id from teacher_detail where lower(short_name) = any($1::text[])', [shortNames],
  )
  return new Map(rows.map((row) => [row.short_name, row.person_id]))
}

/** Writes a person's details as given, whole. */
export async function writeDetail(db: Queryable, personId: string, detail: TeacherDetail): Promise<void> {
  await db.query(
    `insert into teacher_detail (person_id, short_name, note) values ($1, $2, $3)
       on conflict (person_id) do update set short_name = excluded.short_name, note = excluded.note, updated_at = app_now()`,
    [personId, detail.shortName, detail.note],
  )
}

export interface RosterTeacherAddress {
  personId: string
  displayName: string
  /** The mail, else the UPN: the address the roster binds the teacher by. */
  address: string
  shortName: string | null
}

/** Every teacher of a roster (`batch`, a SQL fragment: the one in force unless given) with an address, by name, with the abbreviation known. */
export async function rosterTeacherAddresses(db: Queryable, batch: string = CURRENT_BATCH_ID): Promise<RosterTeacherAddress[]> {
  const { rows } = await db.query<{ person_id: string, display_name: string, address: string, short_name: string | null }>(
    `select e.person_id, e.display_name, lower(coalesce(e.mail, e.upn)) as address, d.short_name
       from roster_entry e left join teacher_detail d on d.person_id = e.person_id
      where e.batch_id = ${batch} and e.kind = 'teacher' and e.person_id is not null and coalesce(e.mail, e.upn) is not null
      order by e.display_name, e.person_id`,
  )
  return rows.map((row) => ({ personId: row.person_id, displayName: row.display_name, address: row.address, shortName: row.short_name }))
}

/** The persons holding each of the abbreviations given (lower case), with the abbreviation as stored. */
export async function findByShortName(db: Queryable, shortNames: readonly string[]): Promise<Map<string, { personId: string, shortName: string }>> {
  const { rows } = await db.query<{ short_name: string, person_id: string }>(
    'select short_name, person_id from teacher_detail where lower(short_name) = any($1::text[])', [shortNames],
  )
  return new Map(rows.map((row) => [row.short_name.toLowerCase(), { personId: row.person_id, shortName: row.short_name }]))
}
