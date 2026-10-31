import { MAX_ACTOR_NAME } from './audit-chain.ts'
import type { Queryable } from './db.ts'

/** A person as a verified ID token describes them. */
export interface EntraIdentity {
  tid: string
  oid: string
  displayName: string
  /** The email claim, or preferred_username without one; null without either. */
  email: string | null
  /** The preferred_username claim, which in a school tenant is the user principal name; null without one. */
  upn: string | null
}

export interface SignedInUser {
  /** app_user.id */
  id: string
  /** An administrator has blocked this person: the sign-in is refused. */
  blocked: boolean
}

/**
 * Records a sign-in: the person is found by (tid, oid) and nothing else,
 * never by e-mail address or oid alone, and their name, address and the
 * time of this sign-in are refreshed from the token.
 */
export async function upsertAppUser(db: Queryable, identity: EntraIdentity): Promise<SignedInUser> {
  const { rows } = await db.query<{ id: string, blocked: boolean }>(
    `insert into app_user (tid, oid, display_name, email) values ($1, $2, $3, $4)
     on conflict (tid, oid) do update set display_name = excluded.display_name, email = excluded.email, last_sign_in_at = app_now()
     returning id, blocked_at is not null as blocked`,
    [identity.tid, identity.oid, identity.displayName, identity.email],
  )
  const row = rows[0]
  if (row === undefined) throw new Error('app_user upsert returned no row')
  return { id: row.id, blocked: row.blocked }
}

/**
 * A name as it is shown and as the audit log names an actor: well-formed
 * text without NUL (PostgreSQL holds neither a lone surrogate nor NUL),
 * trimmed, at most MAX_ACTOR_NAME UTF-16 code units, cut between two
 * characters; undefined when nothing is left. Applied at sign-in, and again
 * wherever a stored name becomes an actor, since a row stored before this
 * bound existed may be longer.
 */
export function boundedName(value: unknown): string | undefined {
  const name = trimmed(value)?.toWellFormed().replaceAll('\0', '')
  if (name === undefined) return undefined
  let end = Math.min(name.length, MAX_ACTOR_NAME)
  // Not between the two halves of a surrogate pair.
  if (end < name.length && /[\uD800-\uDBFF]/.test(name.charAt(end - 1))) end -= 1
  return trimmed(name.slice(0, end))
}

function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}
