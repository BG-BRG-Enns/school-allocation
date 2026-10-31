// The privileged roles, and how the first administrators come to hold one.
// Kind (student or teacher) and eligibility come from the roster; these
// roles are granted in the application, audited, and never derived from
// Entra (docs/identity-and-roles.md §5).

import { ROLES } from '@school-allocation/api-contracts/common'
import { appendAudit, SCHOOL_SCOPE } from './audit.ts'
import type { Queryable } from './db.ts'

export { ROLES } from '@school-allocation/api-contracts/common'
export type Role = typeof ROLES[number]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/** The identity a bootstrap entry is matched against: the oid, or the address the token carried. */
export interface BootstrapIdentity {
  /** app_user.id */
  id: string
  tid: string
  oid: string
  displayName: string
  email: string | null
}

/**
 * Whether BOOTSTRAP_ADMINS names this person: by object id, or by the
 * address of the token, compared in lower case. An address is enough here
 * and nowhere else: whoever controls the deployment's configuration
 * controls the application anyway, and the grant is recorded in the audit
 * log with the identity it went to.
 */
export function isBootstrapAdmin(identity: Pick<BootstrapIdentity, 'oid' | 'email'>, bootstrapAdmins: readonly string[]): boolean {
  const email = identity.email?.toLowerCase()
  return bootstrapAdmins.some((entry) => entry === identity.oid || (email !== undefined && entry === email))
}

/**
 * At sign-in: a person BOOTSTRAP_ADMINS names and who holds no active
 * school_admin grant gets one, by their own hand, with an audit event in
 * the same transaction. True when a grant was made.
 */
export async function bootstrapAdmin(client: Queryable, identity: BootstrapIdentity, bootstrapAdmins: readonly string[]): Promise<boolean> {
  if (!isBootstrapAdmin(identity, bootstrapAdmins)) return false
  const roles = await activeRoles(client, identity.id)
  if (roles.includes('school_admin')) return false
  await client.query(
    `insert into role_grant (user_id, role, campaign_id, granted_by, reason)
     values ($1, 'school_admin', null, $1, 'listed in BOOTSTRAP_ADMINS at sign-in')`,
    [identity.id],
  )
  await appendAudit(client, {
    scopeId: SCHOOL_SCOPE,
    actor: { tid: identity.tid, oid: identity.oid, name: identity.displayName },
    action: 'admin.bootstrapped',
    metadata: { userId: identity.id, role: 'school_admin' },
  })
  return true
}

/** The school-wide roles a person holds now. */
export async function activeRoles(db: Queryable, userId: string): Promise<Role[]> {
  const { rows } = await db.query<{ role: string }>(
    'select role from role_grant where user_id = $1 and campaign_id is null and revoked_at is null order by role',
    [userId],
  )
  return rows.map((row) => row.role).filter(isRole)
}
