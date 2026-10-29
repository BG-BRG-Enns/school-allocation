import { type PersonKind, type RosterDiffSummary, type RosterProblem } from '@school-allocation/school-core'
import { type Actor } from '../actor.ts'
import type { Queryable } from '../db.ts'
import type { Batch, NewBatch, RosterPerson, RosterWarning, StoredEntry } from '../models/roster.ts'
import type { BatchRow, EntryRow } from './roster-rows.ts'
import { CURRENT_BATCH_ID } from './roster-selection.ts'

/** The batch in force: the committed one decided last. */
export async function currentBatch(db: Queryable): Promise<Batch | undefined> {
  const { rows } = await db.query<BatchRow>(`${BATCH_SELECT} where b.id = ${CURRENT_BATCH_ID}`)
  return rows[0] === undefined ? undefined : toBatch(rows[0])
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
 * The persons of the roster in force whose name, class or address contains
 * `q`; everyone with an empty `q`, up to `limit`.
 */
export async function searchPersons(db: Queryable, q: string, limit: number): Promise<RosterPerson[]> {
  const pattern = `%${q.replaceAll(/[\\%_]/g, (c) => `\\${c}`)}%`
  const { rows } = await db.query<{ person_id: string, display_name: string, kind: PersonKind, class_name: string | null, grade: number | null, mail: string | null, account: string | null }>(
    `select e.person_id, e.display_name, e.kind, e.class_name, e.grade, e.mail, u.display_name as account
       from roster_entry e
       join ${CURRENT_BATCH_ID} c on c.id = e.batch_id
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

export async function findBatch(db: Queryable, id: string) {
  const { rows } = await db.query<BatchRow>(`${BATCH_SELECT} where b.id = $1`, [id])
  return rows.map((row) => toBatch(row))
}

export async function insertBatch(db: Queryable, input: NewBatch, hash: string, current: Batch | undefined, summary: RosterDiffSummary, problems: RosterProblem[], warnings: RosterWarning[], rejected: boolean) {
  const { rows: [row] } = await db.query<{ id: string }>(
    `insert into import_batch (source, state, school_year, payload_sha256, row_count, triggered_by, previous_batch_id, diff_summary, problems, warnings, decided_at, decided_by)
       values ($1, case when $10::boolean then 'rejected' else 'pending' end, $2, $3, $4, $5::uuid, $6, $7, $8, $9,
               case when $10::boolean then now() end, case when $10::boolean then $5::uuid end) returning id`,
    [
      input.source, input.schoolYear, hash, input.entries.length, input.triggeredBy,
      current?.id ?? null, JSON.stringify(summary), JSON.stringify(problems), JSON.stringify(warnings),
      rejected,
    ],
  )
  return row === undefined ? undefined : ({ id: row.id })
}

async function insertEntryRows(db: Queryable, tuples: string[], values: unknown[]) {
  await db.query(
    `insert into roster_entry (batch_id, kind, oid, upn, mail, display_name, class_name, grade, class_teacher_mail) values ${tuples.join(', ')}`,
    values,
  )
}

export async function lockBatchForCommit(db: Queryable, batchId: string) {
  const { rows: [row] } = await db.query<{ state: string, previous_batch_id: string | null, source: string, school_year: string, row_count: number, diff_summary: RosterDiffSummary }>(
    'select state, previous_batch_id, source, school_year, row_count, diff_summary from import_batch where id = $1 for update',
    [batchId],
  )
  return row === undefined ? undefined : ({ state: row.state, previousBatchId: row.previous_batch_id, source: row.source, schoolYear: row.school_year, rowCount: row.row_count, diffSummary: row.diff_summary })
}

export async function listKnownPersons(db: Queryable) {
  const { rows } = await db.query<{ entry_key: string, person_id: string }>(
    `select distinct on (e.entry_key) e.entry_key, e.person_id
           from roster_entry e join import_batch b on b.id = e.batch_id
          where b.state = 'committed' and e.person_id is not null
          order by e.entry_key, b.decided_at desc`,
  )
  return rows.map((row) => ({ entryKey: row.entry_key, personId: row.person_id }))
}

export async function listCurrentAddresses(db: Queryable, current: Batch) {
  const { rows } = await db.query<{ mail: string | null, upn: string | null, person_id: string }>(
    'select mail, upn, person_id from roster_entry where batch_id = $1 and person_id is not null', [current.id],
  )
  return rows.map((row) => ({ mail: row.mail, upn: row.upn, personId: row.person_id }))
}

export async function listTenantBindings(db: Queryable, tid: string) {
  const { rows } = await db.query<{ oid: string, person_id: string }>(
    'select oid::text as oid, person_id from identity_binding where tid = $1 and unbound_at is null', [tid],
  )
  return rows.map((row) => ({ oid: row.oid, personId: row.person_id }))
}

export async function listEntriesToBind(db: Queryable, batchId: string) {
  const { rows } = await db.query<{ id: string, oid: string | null, mail: string | null, upn: string | null, entry_key: string }>(
    'select id, oid::text as oid, mail, upn, entry_key from roster_entry where batch_id = $1 order by entry_key', [batchId],
  )
  return rows.map((row) => ({ id: row.id, oid: row.oid, mail: row.mail, upn: row.upn, entryKey: row.entry_key }))
}

export async function insertPerson(db: Queryable) {
  const { rows: [row] } = await db.query<{ id: string }>('insert into person default values returning id')
  return row === undefined ? undefined : ({ id: row.id })
}

export async function insertGraphBinding(db: Queryable, personId: string, tid: string, entry: { id: string, oid: string | null, mail: string | null, upn: string | null, entryKey: string }, actor: Actor, batchId: string) {
  await db.query(
    `insert into identity_binding (person_id, tid, oid, method, bound_by, import_batch_id) values ($1, $2, $3, 'graph', $4, $5)`,
    [personId, tid, entry.oid, actor.id, batchId],
  )
}

export async function bindEntry(db: Queryable, entry: { id: string, oid: string | null, mail: string | null, upn: string | null, entryKey: string }, personId: string) {
  await db.query('update roster_entry set person_id = $2 where id = $1', [entry.id, personId])
}

export async function commitBatch(db: Queryable, batchId: string, actor: Actor) {
  await db.query(`update import_batch set state = 'committed', decided_at = now(), decided_by = $2 where id = $1`, [batchId, actor.id])
}

export async function lockBatchForDiscard(db: Queryable, batchId: string) {
  const { rows: [row] } = await db.query<{ state: string, source: string }>('select state, source from import_batch where id = $1 for update', [batchId])
  return row === undefined ? undefined : ({ state: row.state, source: row.source })
}

export async function discardBatch(db: Queryable, batchId: string, actor: Actor) {
  await db.query(`update import_batch set state = 'discarded', decided_at = now(), decided_by = $2 where id = $1`, [batchId, actor.id])
}

export async function insertEntries(client: Queryable, batchId: string, entries: readonly import('@school-allocation/school-core').RosterEntry[]): Promise<void> {
  for (const chunk of chunks(entries, 200)) {
    const values: unknown[] = []
    const tuples = chunk.map((entry, i) => {
      values.push(batchId, entry.kind, entry.oid ?? null, entry.upn ?? null, entry.mail ?? null, entry.displayName, entry.className ?? null, entry.grade ?? null, entry.classTeacherMail ?? null)
      const n = i * 9
      return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7}, $${n + 8}, $${n + 9})`
    })
    await insertEntryRows(client, tuples, values)
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}
