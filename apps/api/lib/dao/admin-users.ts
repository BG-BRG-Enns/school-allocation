import { type Actor } from '../actor.ts'
import type { Queryable } from '../db.ts'
import type { AccountQueryRow, AccountRow, GrantRow } from '../models/admin-users.ts'
import { isRole } from '../roles.ts'

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

export function countOtherAdmins(db: Queryable, withoutUserId: string) {
  return db.query<{ n: string }>(
    `select count(*)::text as n from role_grant g join app_user u on u.id = g.user_id
      where g.role = 'school_admin' and g.campaign_id is null and g.revoked_at is null and u.blocked_at is null and u.id <> $1`,
    [withoutUserId],
  )
}

export function findAdminGrant(db: Queryable, userId: string) {
  return db.query(
    `select 1 from role_grant where user_id = $1 and role = 'school_admin' and campaign_id is null and revoked_at is null`, [userId],
  )
}

export function blockUser(db: Queryable, userId: string, actor: Actor) {
  return db.query('update app_user set blocked_at = now(), blocked_by = $2 where id = $1 and blocked_at is null', [userId, actor.id])
}

export function findUserToBlock(db: Queryable, userId: string) {
  return db.query('select 1 from app_user where id = $1', [userId])
}

export function unblockUser(db: Queryable, userId: string) {
  return db.query('update app_user set blocked_at = null, blocked_by = null where id = $1 and blocked_at is not null', [userId])
}

export function findUserToUnblock(db: Queryable, userId: string) {
  return db.query('select 1 from app_user where id = $1', [userId])
}

export function findGrantRecipient(db: Queryable, userId: string) {
  return db.query('select 1 from app_user where id = $1', [userId])
}

export function insertGrant(db: Queryable, userId: string, role: string, actor: Actor, reason: string) {
  return db.query<{ id: string }>(
    'insert into role_grant (user_id, role, campaign_id, granted_by, reason) values ($1, $2, null, $3, $4) returning id',
    [userId, role, actor.id, reason],
  )
}

export function findGrant(db: Queryable, grantId: string) {
  return db.query<{ user_id: string, role: string, revoked: boolean }>(
    'select user_id, role, revoked_at is not null as revoked from role_grant where id = $1 and campaign_id is null for update', [grantId],
  )
}

export function revokeGrant(db: Queryable, grantId: string, actor: Actor) {
  return db.query('update role_grant set revoked_at = now(), revoked_by = $2 where id = $1', [grantId, actor.id])
}
