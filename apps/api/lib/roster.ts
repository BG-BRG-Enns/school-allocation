// The roster in the database: import batches and their entries, the persons
// they resolve to, and the one batch in force (docs/data-sources.md). A
// batch is written as pending with its diff against the roster in force; an
// administrator commits it, and it is the roster, or discards it. A batch
// whose rows do not form a roster is stored as rejected, with the problems,
// so the administrator can see why. The rules themselves (what a batch must
// satisfy, what a diff is) are school-core's.

import { createHash } from 'node:crypto'
import { addressesOf, checkRoster, diffRoster, rosterKey, summarizeDiff, type PersonKind, type RosterDiff, type RosterDiffSummary, type RosterEntry, type RosterProblem } from '@school-allocation/school-core'
import { appendAudit, lockScope, SCHOOL_SCOPE } from './audit.ts'
import type { AuditActor } from './audit-chain.ts'
import { canonicalJson } from './canonical-json.ts'
import type { Database, Queryable } from './db.ts'

export const BATCH_SOURCES = ['graph:groups', 'csv'] as const
export type BatchSource = typeof BATCH_SOURCES[number]
export const BATCH_STATES = ['pending', 'committed', 'discarded', 'rejected'] as const
export type BatchState = typeof BATCH_STATES[number]

/** Something an accepted batch should be looked at for; `key` names the entry. */
export interface RosterWarning {
  code: 'no_address'
  key: string
}

/** A batch as the administration lists it. */
export interface Batch {
  id: string
  source: BatchSource
  state: BatchState
  schoolYear: string
  fetchedAt: string
  rowCount: number
  /** The name of the app_user who triggered it. */
  triggeredBy: string
  previousBatchId: string | null
  summary: RosterDiffSummary
  problems: RosterProblem[]
  warnings: RosterWarning[]
  decidedAt: string | null
}

/** A batch with what changed, entry by entry; the entries carry their person once the batch is committed. */
export interface BatchDetail extends Batch {
  diff: RosterDiff<StoredEntry>
}

/** An entry with its row's ids. */
export interface StoredEntry extends RosterEntry {
  id: string
  personId: string | null
}

export interface NewBatch {
  source: BatchSource
  schoolYear: string
  entries: RosterEntry[]
  /** Problems found before the batch check, such as a CSV row that could not be read. */
  problems?: RosterProblem[]
  warnings?: RosterWarning[]
  /** app_user.id */
  triggeredBy: string
}

/** The actor of an administrative change: the caller's identity and app_user id. */
export interface Actor extends AuditActor {
  /** app_user.id */
  id: string
}

/** A change the current state refuses; `code` is the answer's error code. */
export class RosterConflict extends Error {
  override name = 'RosterConflict'
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

const EMPTY_SUMMARY: RosterDiffSummary = { added: 0, removed: 0, changed: 0, unchanged: 0 }

/** The batch in force: the committed one decided last. */
export async function currentBatch(db: Queryable): Promise<Batch | undefined> {
  const { rows } = await db.query<BatchRow>(`${BATCH_SELECT} where b.state = 'committed' order by b.decided_at desc limit 1`)
  return rows[0] === undefined ? undefined : toBatch(rows[0])
}

export async function readBatch(db: Queryable, id: string): Promise<BatchDetail | undefined> {
  const { rows } = await db.query<BatchRow>(`${BATCH_SELECT} where b.id = $1`, [id])
  const row = rows[0]
  if (row === undefined) return undefined
  const batch = toBatch(row)
  const diff: RosterDiff<StoredEntry> = batch.state === 'rejected'
    ? { added: [], removed: [], changed: [], unchanged: 0 }
    : diffRoster(
        batch.previousBatchId === null ? [] : await entriesOf(db, batch.previousBatchId),
        await entriesOf(db, batch.id),
      )
  return { ...batch, diff }
}

/** The latest batches, newest first. */
export async function listBatches(db: Queryable, limit = 30): Promise<Batch[]> {
  const { rows } = await db.query<BatchRow>(`${BATCH_SELECT} order by b.fetched_at desc limit $1`, [limit])
  return rows.map(toBatch)
}

/** The entries of a batch, in a stable order. */
export async function entriesOf(db: Queryable, batchId: string): Promise<StoredEntry[]> {
  const { rows } = await db.query<EntryRow>(
    `select id, person_id, kind, oid::text as oid, upn, mail, display_name, class_name, grade, class_teacher_mail
       from roster_entry where batch_id = $1 order by kind, class_name nulls last, display_name, entry_key`,
    [batchId],
  )
  return rows.map(toEntry)
}

/**
 * Stores a batch: pending with its diff against the roster in force when
 * its rows form a roster, rejected with the problems when they do not.
 * Nothing about persons changes until the batch is committed.
 */
export async function createBatch(db: Database, input: NewBatch): Promise<BatchDetail> {
  const problems = [...(input.problems ?? []), ...checkRoster(input.entries)]
  const warnings = input.warnings ?? []
  const payload = canonicalJson([...input.entries].sort((a, b) => (rosterKey(a) ?? '').localeCompare(rosterKey(b) ?? '')))
  const hash = createHash('sha256').update(payload).digest('hex')
  const id = await db.tx(async (client) => {
    const current = await currentBatch(client)
    const previous = current === undefined ? [] : await entriesOf(client, current.id)
    const summary = problems.length > 0 ? EMPTY_SUMMARY : summarizeDiff(diffRoster(previous, input.entries))
    const rejected = problems.length > 0
    const { rows: [row] } = await client.query<{ id: string }>(
      `insert into import_batch (source, state, school_year, payload_sha256, row_count, triggered_by, previous_batch_id, diff_summary, problems, warnings, decided_at, decided_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [
        input.source, rejected ? 'rejected' : 'pending', input.schoolYear, hash, input.entries.length, input.triggeredBy,
        current?.id ?? null, JSON.stringify(summary), JSON.stringify(problems), JSON.stringify(warnings),
        rejected ? new Date() : null, rejected ? input.triggeredBy : null,
      ],
    )
    if (!row) throw new Error('import_batch insert returned no row')
    if (!rejected) {
      for (const chunk of chunks(input.entries, 200)) {
        const values: unknown[] = []
        const tuples = chunk.map((entry, i) => {
          values.push(row.id, entry.kind, entry.oid ?? null, entry.upn ?? null, entry.mail ?? null, entry.displayName, entry.className ?? null, entry.grade ?? null, entry.classTeacherMail ?? null)
          const n = i * 9
          return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7}, $${n + 8}, $${n + 9})`
        })
        await client.query(
          `insert into roster_entry (batch_id, kind, oid, upn, mail, display_name, class_name, grade, class_teacher_mail) values ${tuples.join(', ')}`,
          values,
        )
      }
    }
    return row.id
  })
  const batch = await readBatch(db, id)
  if (!batch) throw new Error('the batch just written is gone')
  return batch
}

/**
 * Makes a pending batch the roster in force: every entry is resolved to a
 * person, an existing one where the key is known (the identity bound to the
 * member's object id, or the previous batch's entry with the same key), a
 * new one otherwise; a new person from Graph is bound to their identity at
 * once. Refused when the batch is not pending, or when another batch was
 * committed since this one's diff was taken (its diff is stale).
 */
export async function commitBatch(db: Database, batchId: string, actor: Actor, tid: string): Promise<BatchDetail | undefined> {
  const found = await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const { rows: [batch] } = await client.query<{ state: string, previous_batch_id: string | null, source: string, school_year: string, row_count: number, diff_summary: RosterDiffSummary }>(
      'select state, previous_batch_id, source, school_year, row_count, diff_summary from import_batch where id = $1 for update',
      [batchId],
    )
    if (!batch) return false
    if (batch.state !== 'pending') throw new RosterConflict('batch_not_pending')
    const current = await currentBatch(client)
    if ((current?.id ?? null) !== batch.previous_batch_id) throw new RosterConflict('batch_superseded')

    // The previous batch's persons, as previousOf() finds them: by key, or
    // by an address only one previous entry carries.
    const previousPerson = new Map<string, string>()
    const previousByAddress = new Map<string, string[]>()
    if (current !== undefined) {
      const { rows } = await client.query<{ entry_key: string, mail: string | null, upn: string | null, person_id: string }>(
        'select entry_key, mail, upn, person_id from roster_entry where batch_id = $1 and person_id is not null', [current.id],
      )
      for (const row of rows) {
        previousPerson.set(row.entry_key, row.person_id)
        for (const address of addressesOf({ mail: row.mail ?? undefined, upn: row.upn ?? undefined })) {
          previousByAddress.set(address, [...(previousByAddress.get(address) ?? []), row.person_id])
        }
      }
    }
    const byAddress = (entry: { mail: string | null, upn: string | null }): string | undefined => {
      for (const address of addressesOf({ mail: entry.mail ?? undefined, upn: entry.upn ?? undefined })) {
        const candidates = previousByAddress.get(address)
        if (candidates?.length === 1) return candidates[0]
      }
      return undefined
    }
    const { rows: entries } = await client.query<{ id: string, oid: string | null, mail: string | null, upn: string | null, entry_key: string }>(
      'select id, oid::text as oid, mail, upn, entry_key from roster_entry where batch_id = $1 order by entry_key', [batchId],
    )
    const oids = entries.map((entry) => entry.oid).filter((oid): oid is string => oid !== null)
    const boundPerson = new Map<string, string>()
    if (oids.length > 0) {
      const { rows } = await client.query<{ oid: string, person_id: string }>(
        'select oid::text as oid, person_id from identity_binding where tid = $1 and unbound_at is null and oid = any($2::uuid[])', [tid, oids],
      )
      for (const row of rows) boundPerson.set(row.oid, row.person_id)
    }

    let created = 0
    const taken = new Set<string>()
    for (const entry of entries) {
      let personId = (entry.oid === null ? undefined : boundPerson.get(entry.oid)) ?? previousPerson.get(entry.entry_key) ?? byAddress(entry)
      // A person is one entry of a batch; a second entry that resolves to
      // the same person (the index would refuse it) is somebody new.
      if (personId !== undefined && taken.has(personId)) personId = undefined
      if (personId === undefined) {
        const { rows: [person] } = await client.query<{ id: string }>('insert into person default values returning id')
        if (!person) throw new Error('person insert returned no row')
        personId = person.id
        created += 1
        if (entry.oid !== null) {
          await client.query(
            `insert into identity_binding (person_id, tid, oid, method, bound_by, import_batch_id) values ($1, $2, $3, 'graph', $4, $5)`,
            [personId, tid, entry.oid, actor.id, batchId],
          )
        }
      }
      taken.add(personId)
      await client.query('update roster_entry set person_id = $2 where id = $1', [entry.id, personId])
    }
    await client.query(`update import_batch set state = 'committed', decided_at = now(), decided_by = $2 where id = $1`, [batchId, actor.id])
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'roster.imported',
      metadata: { batchId, source: batch.source, schoolYear: batch.school_year, rowCount: batch.row_count, ...batch.diff_summary, personsCreated: created },
    })
    return true
  })
  return found ? readBatch(db, batchId) : undefined
}

/** Sets a pending batch aside; the roster in force stays as it is. */
export async function discardBatch(db: Database, batchId: string, actor: Actor): Promise<BatchDetail | undefined> {
  const found = await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const { rows: [batch] } = await client.query<{ state: string, source: string }>('select state, source from import_batch where id = $1 for update', [batchId])
    if (!batch) return false
    if (batch.state !== 'pending') throw new RosterConflict('batch_not_pending')
    await client.query(`update import_batch set state = 'discarded', decided_at = now(), decided_by = $2 where id = $1`, [batchId, actor.id])
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'roster.discarded',
      metadata: { batchId, source: batch.source },
    })
    return true
  })
  return found ? readBatch(db, batchId) : undefined
}

/** A person of the roster in force, for the administration's lists: who they are, and whether an account is bound to them. */
export interface RosterPerson {
  personId: string
  displayName: string
  kind: PersonKind
  className: string | null
  grade: number | null
  mail: string | null
  /** The display name of the bound account, or null without a binding. */
  account: string | null
}

/**
 * The persons of the roster in force whose name, class or address contains
 * `q`; everyone with an empty `q`, up to `limit`.
 */
export async function searchPersons(db: Queryable, q: string, limit: number): Promise<RosterPerson[]> {
  const pattern = `%${q.replaceAll(/[\\%_]/g, (c) => `\\${c}`)}%`
  const { rows } = await db.query<{ person_id: string, display_name: string, kind: PersonKind, class_name: string | null, grade: number | null, mail: string | null, account: string | null }>(
    `select e.person_id, e.display_name, e.kind, e.class_name, e.grade, e.mail, u.display_name as account
       from roster_entry e
       join (select id from import_batch where state = 'committed' order by decided_at desc limit 1) c on c.id = e.batch_id
       left join identity_binding b on b.person_id = e.person_id and b.unbound_at is null
       left join app_user u on u.tid = b.tid and u.oid = b.oid
      where e.person_id is not null
        and ($1 = '' or e.display_name ilike $2 or e.class_name ilike $2 or e.mail ilike $2 or e.upn ilike $2)
      order by e.kind, e.class_name nulls last, e.display_name
      limit $3`,
    [q, pattern, limit],
  )
  return rows.map((row) => ({
    personId: row.person_id,
    displayName: row.display_name,
    kind: row.kind,
    className: row.class_name,
    grade: row.grade,
    mail: row.mail,
    account: row.account,
  }))
}

interface BatchRow {
  id: string
  source: BatchSource
  state: BatchState
  school_year: string
  fetched_at: Date
  row_count: number
  triggered_by: string
  previous_batch_id: string | null
  diff_summary: RosterDiffSummary
  problems: RosterProblem[]
  warnings: RosterWarning[]
  decided_at: Date | null
}

const BATCH_SELECT = `
  select b.id, b.source, b.state, b.school_year, b.fetched_at, b.row_count, u.display_name as triggered_by,
         b.previous_batch_id, b.diff_summary, b.problems, b.warnings, b.decided_at
    from import_batch b join app_user u on u.id = b.triggered_by`

function toBatch(row: BatchRow): Batch {
  return {
    id: row.id,
    source: row.source,
    state: row.state,
    schoolYear: row.school_year,
    fetchedAt: row.fetched_at.toISOString(),
    rowCount: row.row_count,
    triggeredBy: row.triggered_by,
    previousBatchId: row.previous_batch_id,
    summary: row.diff_summary,
    problems: row.problems,
    warnings: row.warnings,
    decidedAt: row.decided_at?.toISOString() ?? null,
  }
}

interface EntryRow {
  id: string
  person_id: string | null
  kind: PersonKind
  oid: string | null
  upn: string | null
  mail: string | null
  display_name: string
  class_name: string | null
  grade: number | null
  class_teacher_mail: string | null
}

function toEntry(row: EntryRow): StoredEntry {
  const entry: StoredEntry = { id: row.id, personId: row.person_id, kind: row.kind, displayName: row.display_name }
  if (row.oid !== null) entry.oid = row.oid
  if (row.upn !== null) entry.upn = row.upn
  if (row.mail !== null) entry.mail = row.mail
  if (row.class_name !== null) entry.className = row.class_name
  if (row.grade !== null) entry.grade = row.grade
  if (row.class_teacher_mail !== null) entry.classTeacherMail = row.class_teacher_mail
  return entry
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}
