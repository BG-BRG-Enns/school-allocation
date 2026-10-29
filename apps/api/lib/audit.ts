// Writing the administrative audit log: one event per privileged action, in
// the same transaction as the change it records, chained to the scope's
// previous event (lib/audit-chain.ts). The scope is the campaign the action
// belongs to, or the fixed school scope for what is nobody's campaign: a
// role grant, a roster import, an administrator's block.

import { AUDIT_ACTION, MAX_ACTION, auditEventHash, type AuditActor, type AuditEvent, type AuditMetadata } from './audit-chain.ts'
import { canonicalJson } from './canonical-json.ts'
import type { Queryable } from './db.ts'

/** The scope of events that belong to no campaign. */
export const SCHOOL_SCOPE = '00000000-0000-0000-0000-000000000000'

/**
 * Every action the log can hold, so a typo cannot become a new kind of
 * event. Grouped by what they are about; each gets its metadata fields
 * where it is written.
 */
export const AUDIT_ACTIONS = [
  'admin.bootstrapped',
  'role.granted',
  'role.revoked',
  'user.blocked',
  'user.unblocked',
  // The roster: the labelled groups changed; a batch committed (it is the
  // roster now) or discarded.
  'roster.groups-changed',
  'roster.imported',
  'roster.discarded',
  // A person's identity: bound (by the import, at a first sign-in, or by an
  // administrator) and closed.
  'identity.bound',
  'identity.unbound',
  // A campaign: created (school scope), its settings changed and its state
  // moved (campaign scope).
  'campaign.created',
  'campaign.changed',
  'campaign.transitioned',
  // An activity, in its campaign's scope: an organizer's review, and what
  // an organizer does by that right alone (creating on behalf, changing an
  // item past drafting). A teacher's own drafting is not privileged and not
  // recorded here.
  'item.created',
  'item.approved',
  'item.returned',
  'item.withdrawn',
  'item.changed',
] as const

export type AuditAction = typeof AUDIT_ACTIONS[number]

/** Metadata is small: a few ids and words, never a document. */
export const MAX_METADATA_CHARS = 4096

export interface AuditInput {
  scopeId: string
  actor: AuditActor
  action: AuditAction
  metadata?: AuditMetadata
}

/**
 * Appends an event to its scope's chain, inside the caller's transaction.
 * The scope's chain is locked for the transaction, so two events written
 * at once get distinct predecessors and the chain stays linear; the table's
 * constraints refuse it anyway should the lock ever be bypassed.
 */
export async function appendAudit(client: Queryable, input: AuditInput): Promise<AuditEvent> {
  const { scopeId, actor, action } = input
  const metadata = input.metadata ?? {}
  if (!(AUDIT_ACTIONS as readonly string[]).includes(action) || !AUDIT_ACTION.test(action) || action.length > MAX_ACTION) {
    throw new Error(`not an audit action: ${action}`)
  }
  if (canonicalJson(metadata).length > MAX_METADATA_CHARS) throw new Error(`audit metadata of ${action} is too large`)

  await lockScope(client, scopeId)
  const { rows: [previous] } = await client.query<{ seq: string, hash: string }>(
    // Ordered by the column, not by the text alias: "9" would sort after "10".
    'select seq::text, hash from audit_event where scope_id = $1 order by audit_event.seq desc limit 1',
    [scopeId],
  )
  const at = new Date().toISOString()
  const prevHash = previous?.hash ?? null
  const hash = auditEventHash({ scopeId, at, actor, action, metadata, prevHash })
  const { rows: [row] } = await client.query<{ seq: string }>(
    `insert into audit_event (scope_id, at, actor_tid, actor_oid, actor_name, action, metadata, prev_seq, prev_hash, hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning seq::text`,
    [scopeId, at, actor.tid, actor.oid, actor.name, action, JSON.stringify(metadata), previous?.seq ?? null, prevHash, hash],
  )
  if (!row) throw new Error('audit_event insert returned no row')
  return { seq: Number(row.seq), scopeId, at, actor, action, metadata, prevHash, hash }
}

/** Serialises the writers of one scope's chain for the rest of the transaction. */
export async function lockScope(client: Queryable, scopeId: string): Promise<void> {
  // Two keys: a namespace for audit chains, and the scope. Advisory locks
  // are the application's own; nothing else on this database uses this
  // namespace.
  await client.query('select pg_advisory_xact_lock(1, hashtext($1::text))', [scopeId])
}

/** A scope's events in chain order, as lib/audit-chain.ts verifies them. */
export async function readAudit(db: Queryable, scopeId: string): Promise<AuditEvent[]> {
  const { rows } = await db.query<{
    seq: string
    at: Date
    actor_tid: string
    actor_oid: string
    actor_name: string
    action: string
    metadata: AuditMetadata
    prev_hash: string | null
    hash: string
  }>(
    `select seq::text, at, actor_tid, actor_oid, actor_name, action, metadata, prev_hash, hash
       from audit_event where scope_id = $1 order by audit_event.seq`,
    [scopeId],
  )
  return rows.map((row) => ({
    seq: Number(row.seq),
    scopeId,
    at: row.at.toISOString(),
    actor: { tid: row.actor_tid, oid: row.actor_oid, name: row.actor_name },
    action: row.action,
    metadata: row.metadata,
    prevHash: row.prev_hash,
    hash: row.hash,
  }))
}
