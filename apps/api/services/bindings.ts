// Tying a sign-in to a person of the roster (docs/identity-and-roles.md §4).
// A person imported from Graph is bound by the import (services/roster.ts). A
// person from a CSV is bound once, at their first sign-in, by an exact
// match of the token's address against the roster in force; anyone the
// roster does not match stays unbound and appears in the administrator's
// list, who binds them by hand, audited. Nothing is matched by name.

import { type Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import * as store from '../lib/dao/bindings.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { AdminBinding, SignedInIdentity } from '../lib/models/bindings.ts'

export type { AdminBinding, SignedInIdentity } from '../lib/models/bindings.ts'

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
  const { rowCount: bound } = await store.findIdentityBinding(client, identity)
  if ((bound ?? 0) > 0) return undefined
  const { rows } = await store.findUnboundCandidates(client, addresses)
  if (rows.length !== 1 || rows[0] === undefined) return undefined
  const { person_id: personId, batch_id: batchId } = rows[0]
  await store.bindByAddress(client, personId, identity, userId, batchId)
  await appendAudit(client, {
    scopeId: SCHOOL_SCOPE,
    actor: { tid: identity.tid, oid: identity.oid, name: displayName },
    action: 'identity.bound',
    metadata: { personId, userId, method: 'email_match', batchId },
  })
  return personId
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
    const { rows: [user] } = await store.findAccount(client, input)
    const { rowCount: persons } = await store.findPerson(client, input)
    if (!user || (persons ?? 0) === 0) return false
    const { rows: open } = await store.findOpenBindings(client, input, user)
    if (open.some((binding) => binding.person_id === input.personId && binding.tid === user.tid && binding.oid === user.oid)) {
      throw new ApplicationError('already_bound')
    }
    const audit = { tid: actor.tid, oid: actor.oid, name: actor.name }
    for (const binding of open) {
      await store.closeBinding(client, binding, actor, input)
      await appendAudit(client, {
        scopeId: SCHOOL_SCOPE, actor: audit, action: 'identity.unbound',
        metadata: { bindingId: binding.id, personId: binding.person_id, reason: input.reason },
      })
    }
    const { rows: [made] } = await store.insertAdminBinding(client, input, user, actor)
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE, actor: audit, action: 'identity.bound',
      metadata: { bindingId: made?.id ?? null, personId: input.personId, userId: input.userId, method: 'admin', reason: input.reason },
    })
    return true
  })
}
