// Tying a sign-in to a person of the roster (docs/identity-and-roles.md §4).
// A person imported from Graph is bound by the import (lib/roster.ts). A
// person from a CSV is bound once, at their first sign-in, by an exact
// match of the token's address against the roster in force; anyone the
// roster does not match stays unbound and appears in the administrator's
// list, who binds them by hand, audited. Nothing is matched by name.

import { appendAudit, lockScope, SCHOOL_SCOPE } from './audit.ts'
import type { Database, Queryable } from './db.ts'
import { RosterConflict, type Actor } from './roster.ts'

/** What a sign-in brings to the match: the identity and the addresses the token carried. */
export interface SignedInIdentity {
  tid: string
  oid: string
  email: string | null
  upn: string | null
}

/**
 * At sign-in, inside the sign-in's transaction: when the identity is not
 * bound and exactly one unbound person of the roster in force carries one
 * of the token's addresses, that person is bound to this identity. Two
 * candidates bind nobody: the administrator decides. Returns the person
 * bound now, or undefined.
 */
export async function bindAtSignIn(client: Queryable, identity: SignedInIdentity, userId: string, displayName: string): Promise<string | undefined> {
  const addresses = [...new Set([identity.email, identity.upn].filter((a): a is string => a !== null).map((a) => a.toLowerCase()))]
  if (addresses.length === 0) return undefined
  const { rowCount: bound } = await client.query('select 1 from identity_binding where tid = $1 and oid = $2 and unbound_at is null', [identity.tid, identity.oid])
  if ((bound ?? 0) > 0) return undefined
  const { rows } = await client.query<{ person_id: string, batch_id: string }>(
    `select e.person_id, e.batch_id
       from roster_entry e
       join (select id from import_batch where state = 'committed' order by decided_at desc limit 1) c on c.id = e.batch_id
      where e.person_id is not null
        and (lower(e.mail) = any($1::text[]) or lower(e.upn) = any($1::text[]))
        and not exists (select 1 from identity_binding b where b.person_id = e.person_id and b.unbound_at is null)`,
    [addresses],
  )
  if (rows.length !== 1 || rows[0] === undefined) return undefined
  const { person_id: personId, batch_id: batchId } = rows[0]
  await client.query(
    `insert into identity_binding (person_id, tid, oid, method, bound_by, import_batch_id) values ($1, $2, $3, 'email_match', $4, $5)`,
    [personId, identity.tid, identity.oid, userId, batchId],
  )
  await appendAudit(client, {
    scopeId: SCHOOL_SCOPE,
    actor: { tid: identity.tid, oid: identity.oid, name: displayName },
    action: 'identity.bound',
    metadata: { personId, userId, method: 'email_match', batchId },
  })
  return personId
}

export interface AdminBinding {
  /** app_user.id of the account. */
  userId: string
  personId: string
  reason: string
}

/**
 * An administrator binds an account to a person: the person's current
 * binding, if any, and the account's current binding to another person, if
 * any, are closed first, each audited, and the new binding is audited with
 * the reason. Refused when the account is bound to that person already.
 * Returns false when the account or the person does not exist.
 */
export async function bindByAdmin(db: Database, input: AdminBinding, actor: Actor): Promise<boolean> {
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const { rows: [user] } = await client.query<{ tid: string, oid: string }>('select tid, oid from app_user where id = $1', [input.userId])
    const { rowCount: persons } = await client.query('select 1 from person where id = $1', [input.personId])
    if (!user || (persons ?? 0) === 0) return false
    const { rows: open } = await client.query<{ id: string, person_id: string, tid: string, oid: string }>(
      'select id, person_id, tid, oid from identity_binding where unbound_at is null and (person_id = $1 or (tid = $2 and oid = $3))',
      [input.personId, user.tid, user.oid],
    )
    if (open.some((binding) => binding.person_id === input.personId && binding.tid === user.tid && binding.oid === user.oid)) {
      throw new RosterConflict('already_bound')
    }
    const audit = { tid: actor.tid, oid: actor.oid, name: actor.name }
    for (const binding of open) {
      await client.query(
        'update identity_binding set unbound_at = now(), unbound_by = $2, unbind_reason = $3 where id = $1',
        [binding.id, actor.id, input.reason],
      )
      await appendAudit(client, {
        scopeId: SCHOOL_SCOPE, actor: audit, action: 'identity.unbound',
        metadata: { bindingId: binding.id, personId: binding.person_id, reason: input.reason },
      })
    }
    const { rows: [made] } = await client.query<{ id: string }>(
      `insert into identity_binding (person_id, tid, oid, method, bound_by, reason) values ($1, $2, $3, 'admin', $4, $5) returning id`,
      [input.personId, user.tid, user.oid, actor.id, input.reason],
    )
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE, actor: audit, action: 'identity.bound',
      metadata: { bindingId: made?.id ?? null, personId: input.personId, userId: input.userId, method: 'admin', reason: input.reason },
    })
    return true
  })
}
