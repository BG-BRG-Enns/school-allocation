// Who is calling, and the guards protected routes put in front of their
// handler (`preHandler: guards.requireSession` or
// `preHandler: guards.requireRole('school_admin')`).
//
// The cookie says who signed in and when; the database says what they may
// do now. Every guarded request reads the person and their roles again,
// so an administrator's block or a revoked role takes effect with the next
// request, not when the cookie expires.
//
// Status codes for refused requests, the same on every route:
//
//   401  no valid session: signed out, expired, blocked, or a cookie that
//        does not decrypt;
//   403  signed in, but no role allows the action;
//   404  not in the caller's scope: to the caller it does not exist, so
//        guessing ids reveals nothing (campaign routes, later);
//   409  allowed, but not in the campaign's current state.

import type { FastifyReply, FastifyRequest } from 'fastify'
import type { PersonKind } from '@school-allocation/school-core'
import { SESSION_SECONDS, type SessionUser } from '../plugins/session.ts'
import type { Queryable } from './db.ts'
import { isRole, type Role } from './roles.ts'

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

/** The signed-in caller as the cookie has it, or undefined. A session past its lifetime, or without a sign-in time, counts as none. */
export function currentUser(request: FastifyRequest, now = Date.now()): SessionUser | undefined {
  const user = request.userSession.get('user')
  if (!user || !withinSeconds(user.issuedAt, SESSION_SECONDS, now)) return undefined
  return user
}

/** Whether `since` (a Date.now() value) lies less than `seconds` back; false for anything that is not a time. */
export function withinSeconds(since: unknown, seconds: number, now = Date.now()): boolean {
  if (typeof since !== 'number' || !Number.isFinite(since)) return false
  return now - since < seconds * 1000
}

// The caller a guard let through, per request. The handler works with this
// snapshot: reading the session and the database again could find the
// session expired a moment later, and fail a request already authorized.
const authorized = new WeakMap<FastifyRequest, Caller>()

/** For handlers behind a guard: the caller it authorized. */
export function callerOf(request: FastifyRequest): Caller {
  const caller = authorized.get(request)
  if (!caller) throw new Error('callerOf() used on a route without a guard')
  return caller
}

/**
 * The person behind a session as the database has them now, with their
 * school-wide roles and their roster person; undefined when the row is gone
 * or the person is blocked, which ends the session.
 */
interface CallerRow {
  tid: string
  oid: string
  display_name: string
  email: string | null
  blocked: boolean
  roles: string[]
  person_id: string | null
  kind: PersonKind | null
  class_name: string | null
  grade: number | null
  classes: string[]
}

export async function loadCaller(db: Queryable, userId: string): Promise<Caller | undefined> {
  const { rows: [row] } = await db.query<CallerRow>(
    `with current as (select id, school_year from import_batch where state = 'committed' order by decided_at desc limit 1)
     select u.tid, u.oid, u.display_name, u.email, u.blocked_at is not null as blocked,
            coalesce((select array_agg(g.role order by g.role) from role_grant g where g.user_id = u.id and g.campaign_id is null and g.revoked_at is null), '{}') as roles,
            b.person_id, e.kind, e.class_name, e.grade,
            case when e.kind = 'teacher' then coalesce((
              select array_agg(distinct c order by c) from (
                select a.class_name as c from class_teacher a, current
                 where a.person_id = e.person_id and a.school_year = current.school_year and a.revoked_at is null
                union
                select s.class_name from roster_entry s, current
                 where s.batch_id = current.id and s.kind = 'student' and s.class_name is not null
                   and lower(s.class_teacher_mail) in (lower(e.mail), lower(e.upn))
              ) k), '{}') else '{}' end as classes
       from app_user u
       left join identity_binding b on b.tid = u.tid and b.oid = u.oid and b.unbound_at is null
       left join roster_entry e on e.person_id = b.person_id and e.batch_id = (select id from current)
      where u.id = $1`,
    [userId],
  )
  if (!row || row.blocked) return undefined
  return {
    id: userId,
    tid: row.tid,
    oid: row.oid,
    displayName: row.display_name,
    email: row.email,
    roles: row.roles.filter(isRole),
    person: row.person_id === null ? null : { id: row.person_id, kind: row.kind, className: row.class_name, grade: row.grade },
    classTeacherOf: row.classes,
  }
}

export interface Guards {
  /** 401 without a live session or for a blocked person; records the caller for callerOf(). */
  requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  /** requireSession, then 403 unless the caller holds one of `roles` school-wide. */
  requireRole: (...roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
}

// A guard that replies ends the request; Fastify stops before the handler.
export function createGuards(db: Queryable): Guards {
  const requireSession = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = currentUser(request)
    const caller = user ? await loadCaller(db, user.id) : undefined
    if (!caller) {
      // A session whose person is blocked or gone is dropped, so the
      // browser does not keep sending it.
      if (user) request.userSession.delete()
      await reply.code(401).send({ error: 'unauthenticated' })
      return
    }
    authorized.set(request, caller)
  }
  return {
    requireSession,
    requireRole: (...roles) => async (request, reply) => {
      await requireSession(request, reply)
      if (reply.sent) return
      if (!roles.some((role) => callerOf(request).roles.includes(role))) {
        await reply.code(403).send({ error: 'forbidden' })
      }
    },
  }
}
