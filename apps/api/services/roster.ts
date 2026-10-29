// The roster in the database: import batches and their entries, the persons
// they resolve to, and the one batch in force (docs/data-sources.md). A
// batch is written as pending with its diff against the roster in force; an
// administrator commits it, and it is the roster, or discards it. A batch
// whose rows do not form a roster is stored as rejected, with the problems,
// so the administrator can see why. The rules themselves (what a batch must
// satisfy, what a diff is) are school-core's.

import { addressesOf, checkRoster, diffRoster, rosterKey, summarizeDiff, type RosterDiff, type RosterDiffSummary, type RosterEntry, type RosterProblem } from '@school-allocation/school-core'
import { createHash } from 'node:crypto'
import { type Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import { canonicalJson, CanonicalJsonError } from '../lib/canonical-json.ts'
import * as store from '../lib/dao/roster.ts'
import { currentBatch, entriesOf, toBatch } from '../lib/dao/roster.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { BatchDetail, NewBatch, StoredEntry } from '../lib/models/roster.ts'
import { reconcileOpenCampaigns } from './pre-assignments.ts'

export { currentBatch, entriesOf, listBatches, searchPersons } from '../lib/dao/roster.ts'
export { BATCH_SOURCES, BATCH_STATES } from '../lib/models/roster.ts'
export type { Batch, BatchDetail, BatchRow, BatchSource, BatchState, EntryRow, NewBatch, RosterPerson, RosterWarning, StoredEntry } from '../lib/models/roster.ts'
const EMPTY_SUMMARY: RosterDiffSummary = { added: 0, removed: 0, changed: 0, unchanged: 0 }

export async function readBatch(db: Queryable, id: string): Promise<BatchDetail | undefined> {
  const { rows } = await store.findBatchRow(db, id)
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

/**
 * Stores a batch: pending with its diff against the roster in force when
 * its rows form a roster, rejected with the problems when they do not.
 * Nothing about persons changes until the batch is committed.
 */
export async function createBatch(db: Database, input: NewBatch): Promise<BatchDetail> {
  const problems = [...(input.problems ?? []), ...checkRoster(input.entries)].map(storableProblem)
  const warnings = input.warnings ?? []
  const hash = payloadHash([...input.entries].sort((a, b) => (rosterKey(a) ?? '').localeCompare(rosterKey(b) ?? '')))
  const id = await db.tx(async (client) => {
    const current = await currentBatch(client)
    const previous = current === undefined ? [] : await entriesOf(client, current.id)
    const summary = problems.length > 0 ? EMPTY_SUMMARY : summarizeDiff(diffRoster(previous, input.entries))
    const rejected = problems.length > 0
    // A rejected batch is decided as it is written, by the database's
    // clock like fetched_at, so the two are one instant whatever this
    // process's clock says.
    const { rows: [row] } = await store.insertBatch(client, input, hash, current, summary, problems, warnings, rejected)
    if (!row) throw new Error('import_batch insert returned no row')
    if (!rejected) {
      await store.insertEntries(client, row.id, input.entries)
    }
    return row.id
  })
  const batch = await readBatch(db, id)
  if (!batch) throw new Error('the batch just written is gone')
  return batch
}

/**
 * A problem as the batch's jsonb column holds it: its key, an address or
 * an object id from the row, made well-formed and without U+0000, which
 * jsonb refuses, and cut to an address's length. An address that needed
 * this is the problem's own reason (invalid_address).
 */
function storableProblem(problem: RosterProblem): RosterProblem {
  if (problem.key === undefined) return problem
  const key = problem.key.toWellFormed().replaceAll('\0', '').slice(0, 254)
  return key === '' ? { ...problem, key: undefined } : { ...problem, key }
}

/**
 * The hash a batch is recorded under: of the entries' canonical JSON. A
 * rejected batch may hold text no canonical form and no PostgreSQL column
 * takes (U+0000, a lone surrogate; checkEntry reports it as the row's
 * problem), and is hashed as JSON made well-formed instead. An accepted
 * batch never contains such text.
 */
function payloadHash(entries: readonly RosterEntry[]): string {
  let text: string
  try {
    text = canonicalJson(entries)
  } catch (err) {
    if (!(err instanceof CanonicalJsonError)) throw err
    text = JSON.stringify(entries).toWellFormed().replaceAll('\0', '')
  }
  return createHash('sha256').update(text).digest('hex')
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
    const { rows: [batch] } = await store.lockBatchForCommit(client, batchId)
    if (!batch) return false
    if (batch.state !== 'pending') throw new ApplicationError('batch_not_pending')
    const current = await currentBatch(client)
    if ((current?.id ?? null) !== batch.previous_batch_id) throw new ApplicationError('batch_superseded')

    // Who is already known, in the order the identity invariant wants it:
    // the person bound to the member's object id; else the person the key
    // named in any committed batch, the latest first, so someone missing
    // from one batch and back in the next is the same person; else, when
    // the source changed and the key with it, the person of the one entry
    // of the roster in force that carries the address. A known person who
    // is bound to another identity is somebody else: a new account at an
    // old address is a new person until an administrator says otherwise.
    const knownByKey = new Map<string, string>()
    {
      const { rows } = await store.listKnownPersons(client)
      for (const row of rows) knownByKey.set(row.entry_key, row.person_id)
    }
    const currentByAddress = new Map<string, string[]>()
    if (current !== undefined) {
      const { rows } = await store.listCurrentAddresses(client, current)
      for (const row of rows) {
        for (const address of addressesOf({ mail: row.mail ?? undefined, upn: row.upn ?? undefined })) {
          currentByAddress.set(address, [...(currentByAddress.get(address) ?? []), row.person_id])
        }
      }
    }
    const byAddress = (entry: { mail: string | null, upn: string | null }): string | undefined => {
      for (const address of addressesOf({ mail: entry.mail ?? undefined, upn: entry.upn ?? undefined })) {
        const candidates = currentByAddress.get(address)
        if (candidates?.length === 1) return candidates[0]
      }
      return undefined
    }
    const personByOid = new Map<string, string>()
    const oidByPerson = new Map<string, string>()
    {
      const { rows } = await store.listTenantBindings(client, tid)
      for (const row of rows) {
        personByOid.set(row.oid, row.person_id)
        oidByPerson.set(row.person_id, row.oid)
      }
    }
    const { rows: entries } = await store.listEntriesToBind(client, batchId)

    let created = 0
    let bound = 0
    const taken = new Set<string>()
    for (const entry of entries) {
      let personId = entry.oid === null ? undefined : personByOid.get(entry.oid)
      if (personId === undefined) {
        const candidate = knownByKey.get(entry.entry_key) ?? byAddress(entry)
        const boundElsewhere = candidate !== undefined && entry.oid !== null && oidByPerson.has(candidate) && oidByPerson.get(candidate) !== entry.oid
        if (candidate !== undefined && !boundElsewhere) personId = candidate
      }
      // A person is one entry of a batch; a second entry that resolves to
      // the same person (the index would refuse it) is somebody new.
      if (personId !== undefined && taken.has(personId)) personId = undefined
      if (personId === undefined) {
        const { rows: [person] } = await store.insertPerson(client)
        if (!person) throw new Error('person insert returned no row')
        personId = person.id
        created += 1
      }
      // A member's identity is known now, whether the person is new or was
      // known by address or key alone; the binding makes the next sign-in
      // find them without any matching. The import's audit event counts
      // these bindings, and each row names the batch that made it: the
      // event per binding is written where a binding is an action of its
      // own, at a sign-in or by an administrator (services/bindings.ts).
      if (entry.oid !== null && !oidByPerson.has(personId)) {
        await store.insertGraphBinding(client, personId, tid, entry, actor, batchId)
        personByOid.set(entry.oid, personId)
        oidByPerson.set(personId, entry.oid)
        bound += 1
      }
      taken.add(personId)
      await store.bindEntry(client, entry, personId)
    }
    await store.commitBatch(client, batchId, actor)
    // A window open on the roster in force follows it: the placements by class (D-24) are made true to the new roster, each campaign under its lock.
    await reconcileOpenCampaigns(client)
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'roster.imported',
      metadata: { batchId, source: batch.source, schoolYear: batch.school_year, rowCount: batch.row_count, ...batch.diff_summary, personsCreated: created, identitiesBound: bound },
    })
    return true
  })
  return found ? readBatch(db, batchId) : undefined
}

/** Sets a pending batch aside; the roster in force stays as it is. */
export async function discardBatch(db: Database, batchId: string, actor: Actor): Promise<BatchDetail | undefined> {
  const found = await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const { rows: [batch] } = await store.lockBatchForDiscard(client, batchId)
    if (!batch) return false
    if (batch.state !== 'pending') throw new ApplicationError('batch_not_pending')
    await store.discardBatch(client, batchId, actor)
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
