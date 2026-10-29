// What an administrator does with accounts: list them with their binding
// and roles, block and unblock, grant and revoke the privileged roles
// (docs/identity-and-roles.md §5). Every change writes its audit event in
// the same transaction.

import { type Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import * as store from '../lib/dao/admin-users.ts'
import { listGrants } from '../lib/dao/admin-users.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { Grant } from '../lib/models/admin-users.ts'
import { SQLSTATE, sqlState } from '../lib/pg-errors.ts'
import { type Role } from '../lib/roles.ts'

export { listAccounts, listGrants } from '../lib/dao/admin-users.ts'
export type { Account, Grant } from '../lib/models/admin-users.ts'

/**
 * The school must keep an administrator who can sign in: whoever this
 * change would take that from (a block, a revoked administration) is not
 * taken while nobody else is left. Checked under the scope's lock, so two
 * administrators who remove each other at the same moment lose one, not
 * both; the guard in front of the route cannot see the other transaction.
 */
async function assertAnotherAdminRemains(client: Queryable, withoutUserId: string): Promise<void> {
  const row = await store.countOtherAdmins(client, withoutUserId)
  if (row === 0) throw new ApplicationError('last_admin')
}

/** Blocks an account; its running session ends with the next request. An administrator cannot block themselves, nor the last other administrator. */
export async function blockAccount(db: Database, userId: string, reason: string, actor: Actor): Promise<boolean> {
  // PostgreSQL hands ids out in lower case; the route accepts either.
  if (userId.toLowerCase() === actor.id.toLowerCase()) throw new ApplicationError('cannot_block_self')
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const admin = await store.findAdminGrant(client, userId)
    if ((admin ?? 0) > 0) await assertAnotherAdminRemains(client, userId)
    const affected = await store.blockUser(client, userId, actor)
    if (affected === 0) {
      const exists = await store.findUserToBlock(client, userId)
      if ((exists ?? 0) === 0) return false
      throw new ApplicationError('already_blocked')
    }
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'user.blocked', metadata: { userId, reason } })
    return true
  })
}

export async function unblockAccount(db: Database, userId: string, reason: string, actor: Actor): Promise<boolean> {
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const affected = await store.unblockUser(client, userId)
    if (affected === 0) {
      const exists = await store.findUserToUnblock(client, userId)
      if ((exists ?? 0) === 0) return false
      throw new ApplicationError('not_blocked')
    }
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'user.unblocked', metadata: { userId, reason } })
    return true
  })
}

/** Grants a school-wide role, audited; refused when the person holds it already. Returns false when the account does not exist. */
export async function grantRole(db: Database, userId: string, role: Role, reason: string, actor: Actor): Promise<Grant | undefined> {
  const id = await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const exists = await store.findGrantRecipient(client, userId)
    if ((exists ?? 0) === 0) return undefined
    let grant: { id: string } | undefined
    try {
      const rows = await store.insertGrant(client, userId, role, actor, reason)
      grant = rows[0]
    } catch (err) {
      if (sqlState(err) === SQLSTATE.uniqueViolation) throw new ApplicationError('already_granted')
      throw err
    }
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'role.granted', metadata: { grantId: grant?.id ?? null, userId, role, reason } })
    return grant?.id
  })
  if (id === undefined) return undefined
  return (await listGrants(db)).find((grant) => grant.id === id)
}

/** Revokes a grant, audited. An administrator can revoke neither their own administration nor the last other one, so nobody locks everyone out. */
export async function revokeGrant(db: Database, grantId: string, reason: string, actor: Actor): Promise<boolean> {
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const grant = await store.lockGrant(client, grantId)
    if (!grant) return false
    if (grant.revoked) throw new ApplicationError('already_revoked')
    if (grant.role === 'school_admin') {
      if (grant.userId === actor.id) throw new ApplicationError('cannot_revoke_self')
      await assertAnotherAdminRemains(client, grant.userId)
    }
    await store.revokeGrant(client, grantId, actor)
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'role.revoked', metadata: { grantId, userId: grant.userId, role: grant.role, reason } })
    return true
  })
}

function auditActor(actor: Actor) {
  return { tid: actor.tid, oid: actor.oid, name: actor.name }
}
