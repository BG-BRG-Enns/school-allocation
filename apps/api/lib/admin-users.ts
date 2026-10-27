// What an administrator does with accounts: list them with their binding
// and roles, block and unblock, grant and revoke the privileged roles
// (docs/identity-and-roles.md §5). Every change writes its audit event in
// the same transaction.

import type { PersonKind } from '@school-allocation/school-core'
import { appendAudit, lockScope, SCHOOL_SCOPE } from './audit.ts'
import type { Database, Queryable } from './db.ts'
import { SQLSTATE, sqlState } from './pg-errors.ts'
import { isRole, type Role } from './roles.ts'
import { RosterConflict, type Actor } from './roster.ts'

/** An account as the administration lists it. */
export interface AccountRow {
  id: string
  displayName: string
  email: string | null
  firstSignInAt: string
  lastSignInAt: string
  blocked: boolean
  roles: Role[]
  /** The bound person as the roster in force has them; `kind` null when the person is not in it. */
  person: { id: string, displayName: string | null, kind: PersonKind | null, className: string | null, grade: number | null } | null
}

interface AccountQueryRow {
  id: string
  display_name: string
  email: string | null
  first_sign_in_at: Date
  last_sign_in_at: Date
  blocked: boolean
  roles: string[]
  person_id: string | null
  person_name: string | null
  kind: PersonKind | null
  class_name: string | null
  grade: number | null
}

/**
 * The accounts whose name or address contains `q`, newest sign-in first;
 * `unboundOnly` keeps those without a person, the administrator's queue.
 */
export async function listAccounts(db: Queryable, q: string, unboundOnly: boolean, limit: number): Promise<AccountRow[]> {
  const pattern = `%${q.replaceAll(/[\\%_]/g, (c) => `\\${c}`)}%`
  const { rows } = await db.query<AccountQueryRow>(
    `select u.id, u.display_name, u.email, u.first_sign_in_at, u.last_sign_in_at, u.blocked_at is not null as blocked,
            coalesce((select array_agg(g.role order by g.role) from role_grant g where g.user_id = u.id and g.campaign_id is null and g.revoked_at is null), '{}') as roles,
            b.person_id, e.display_name as person_name, e.kind, e.class_name, e.grade
       from app_user u
       left join identity_binding b on b.tid = u.tid and b.oid = u.oid and b.unbound_at is null
       left join roster_entry e on e.person_id = b.person_id
            and e.batch_id = (select id from import_batch where state = 'committed' order by decided_at desc limit 1)
      where ($1 = '' or u.display_name ilike $2 or u.email ilike $2)
        and (not $3 or b.person_id is null)
      order by u.last_sign_in_at desc
      limit $4`,
    [q, pattern, unboundOnly, limit],
  )
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    firstSignInAt: row.first_sign_in_at.toISOString(),
    lastSignInAt: row.last_sign_in_at.toISOString(),
    blocked: row.blocked,
    roles: row.roles.filter(isRole),
    person: row.person_id === null
      ? null
      : { id: row.person_id, displayName: row.person_name, kind: row.kind, className: row.class_name, grade: row.grade },
  }))
}

/**
 * The school must keep an administrator who can sign in: whoever this
 * change would take that from (a block, a revoked administration) is not
 * taken while nobody else is left. Checked under the scope's lock, so two
 * administrators who remove each other at the same moment lose one, not
 * both; the guard in front of the route cannot see the other transaction.
 */
async function assertAnotherAdminRemains(client: Queryable, withoutUserId: string): Promise<void> {
  const { rows: [row] } = await client.query<{ n: string }>(
    `select count(*)::text as n from role_grant g join app_user u on u.id = g.user_id
      where g.role = 'school_admin' and g.campaign_id is null and g.revoked_at is null and u.blocked_at is null and u.id <> $1`,
    [withoutUserId],
  )
  if (Number(row?.n ?? 0) === 0) throw new RosterConflict('last_admin')
}

/** Blocks an account; its running session ends with the next request. An administrator cannot block themselves, nor the last other administrator. */
export async function blockAccount(db: Database, userId: string, reason: string, actor: Actor): Promise<boolean> {
  // PostgreSQL hands ids out in lower case; the route accepts either.
  if (userId.toLowerCase() === actor.id.toLowerCase()) throw new RosterConflict('cannot_block_self')
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const { rowCount: admin } = await client.query(
      `select 1 from role_grant where user_id = $1 and role = 'school_admin' and campaign_id is null and revoked_at is null`, [userId],
    )
    if ((admin ?? 0) > 0) await assertAnotherAdminRemains(client, userId)
    const { rowCount } = await client.query('update app_user set blocked_at = now(), blocked_by = $2 where id = $1 and blocked_at is null', [userId, actor.id])
    if ((rowCount ?? 0) === 0) {
      const { rowCount: exists } = await client.query('select 1 from app_user where id = $1', [userId])
      if ((exists ?? 0) === 0) return false
      throw new RosterConflict('already_blocked')
    }
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'user.blocked', metadata: { userId, reason } })
    return true
  })
}

export async function unblockAccount(db: Database, userId: string, reason: string, actor: Actor): Promise<boolean> {
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const { rowCount } = await client.query('update app_user set blocked_at = null, blocked_by = null where id = $1 and blocked_at is not null', [userId])
    if ((rowCount ?? 0) === 0) {
      const { rowCount: exists } = await client.query('select 1 from app_user where id = $1', [userId])
      if ((exists ?? 0) === 0) return false
      throw new RosterConflict('not_blocked')
    }
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'user.unblocked', metadata: { userId, reason } })
    return true
  })
}

/** A school-wide grant as the administration lists it. */
export interface GrantRow {
  id: string
  userId: string
  displayName: string
  role: Role
  grantedAt: string
  grantedBy: string
  reason: string
}

export async function listGrants(db: Queryable): Promise<GrantRow[]> {
  const { rows } = await db.query<{ id: string, user_id: string, display_name: string, role: string, granted_at: Date, granted_by: string, reason: string }>(
    `select g.id, g.user_id, u.display_name, g.role, g.granted_at, a.display_name as granted_by, g.reason
       from role_grant g join app_user u on u.id = g.user_id join app_user a on a.id = g.granted_by
      where g.campaign_id is null and g.revoked_at is null
      order by u.display_name, g.role`,
  )
  return rows.flatMap((row) => isRole(row.role)
    ? [{ id: row.id, userId: row.user_id, displayName: row.display_name, role: row.role, grantedAt: row.granted_at.toISOString(), grantedBy: row.granted_by, reason: row.reason }]
    : [])
}

/** Grants a school-wide role, audited; refused when the person holds it already. Returns false when the account does not exist. */
export async function grantRole(db: Database, userId: string, role: Role, reason: string, actor: Actor): Promise<GrantRow | undefined> {
  const id = await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const { rowCount: exists } = await client.query('select 1 from app_user where id = $1', [userId])
    if ((exists ?? 0) === 0) return undefined
    let grant: { id: string } | undefined
    try {
      const { rows } = await client.query<{ id: string }>(
        'insert into role_grant (user_id, role, campaign_id, granted_by, reason) values ($1, $2, null, $3, $4) returning id',
        [userId, role, actor.id, reason],
      )
      grant = rows[0]
    } catch (err) {
      if (sqlState(err) === SQLSTATE.uniqueViolation) throw new RosterConflict('already_granted')
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
    const { rows: [grant] } = await client.query<{ user_id: string, role: string, revoked: boolean }>(
      'select user_id, role, revoked_at is not null as revoked from role_grant where id = $1 and campaign_id is null for update', [grantId],
    )
    if (!grant) return false
    if (grant.revoked) throw new RosterConflict('already_revoked')
    if (grant.role === 'school_admin') {
      if (grant.user_id === actor.id) throw new RosterConflict('cannot_revoke_self')
      await assertAnotherAdminRemains(client, grant.user_id)
    }
    await client.query('update role_grant set revoked_at = now(), revoked_by = $2 where id = $1', [grantId, actor.id])
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'role.revoked', metadata: { grantId, userId: grant.user_id, role: grant.role, reason } })
    return true
  })
}

function auditActor(actor: Actor) {
  return { tid: actor.tid, oid: actor.oid, name: actor.name }
}
