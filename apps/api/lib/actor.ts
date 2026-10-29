import type { PersonKind } from '@school-allocation/school-core'
import type { AuditActor } from './audit-chain.ts'
import type { Role } from './roles.ts'

/**
 * The person of the roster the caller's identity is bound to, as the
 * roster in force has them; `kind` null when the roster in force does not
 * list them (any more).
 */
export interface CallerPerson {
  id: string
  kind: PersonKind | null
  className: string | null
  grade: number | null
}

/** The caller a guard let through: the identity, the school-wide roles held now, and the roster person. */
export interface Caller {
  /** app_user.id */
  id: string
  tid: string
  oid: string
  displayName: string
  /** The address the token carried at sign-in; null when it carried none. */
  email: string | null
  roles: Role[]
  /** null until a roster entry is bound to this identity. */
  person: CallerPerson | null
  /** The classes the caller is class teacher of in the roster's school year: assigned in the app, or named by the roster's class-teacher address. */
  classTeacherOf: string[]
}

/** The actor of an administrative change: the caller's identity and app_user id. */
export interface Actor extends AuditActor {
  /** app_user.id */
  id: string
}
/** The authenticated caller as the actor of an application operation. */
export function actorOf(caller: Caller): Actor {
  return { id: caller.id, tid: caller.tid, oid: caller.oid, name: caller.displayName }
}
