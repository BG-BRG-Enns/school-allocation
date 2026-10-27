// Accounts, bindings and roles, for school administrators
// (docs/identity-and-roles.md §4–5):
//
//   GET  /api/admin/users?q=&unbound=         accounts with their person, roles and block state
//   POST /api/admin/users/:id/block           { reason }
//   POST /api/admin/users/:id/unblock         { reason }
//   POST /api/admin/bindings                  { userId, personId, reason }: bind an account to a roster person
//   GET  /api/admin/roles                     the school-wide grants in force
//   POST /api/admin/roles                     { userId, role, reason }
//   POST /api/admin/roles/:id/revoke          { reason }
//   GET  /api/admin/audit                     the school scope's audit log; administrators and auditors
//
// Every change is audited in its own transaction (lib/admin-users.ts,
// lib/bindings.ts). An administrator can neither block themselves nor
// revoke their own administration.

import type { FastifyInstance, FastifyReply } from 'fastify'
import { Type, type Static } from 'typebox'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { blockAccount, grantRole, listAccounts, listGrants, revokeGrant, unblockAccount } from '../lib/admin-users.ts'
import type { Guards } from '../lib/auth.ts'
import { bindByAdmin } from '../lib/bindings.ts'
import type { Database } from '../lib/db.ts'
import { ROLES } from '../lib/roles.ts'
import { RosterConflict } from '../lib/roster.ts'
import { ErrorResponse, Reason, StrictObject, Uuid } from '../lib/schemas/common.ts'
import { actorOf } from './admin-roster.ts'

export interface AdminUsersOptions {
  db: Database
  guards: Guards
}

const UsersQuery = StrictObject({
  q: Type.Optional(Type.String({ maxLength: 100 })),
  unbound: Type.Optional(Type.Union([Type.Literal('true'), Type.Literal('false')])),
})
const IdParams = StrictObject({ id: Uuid })
const ReasonBody = StrictObject({ reason: Reason })
const BindingBody = StrictObject({ userId: Uuid, personId: Uuid, reason: Reason })
const GrantBody = StrictObject({ userId: Uuid, role: Type.Union(ROLES.map((role) => Type.Literal(role))), reason: Reason })

export async function adminUsersRoutes(app: FastifyInstance, { db, guards }: AdminUsersOptions): Promise<void> {
  const admin = { preHandler: guards.requireRole('school_admin') }

  app.get<{ Querystring: Static<typeof UsersQuery> }>('/api/admin/users', { ...admin, schema: { querystring: UsersQuery, response: { '4xx': ErrorResponse } } }, async (request) => {
    return { users: await listAccounts(db, request.query.q?.trim() ?? '', request.query.unbound === 'true', 500) }
  })

  app.post<{ Params: Static<typeof IdParams>, Body: Static<typeof ReasonBody> }>('/api/admin/users/:id/block', { ...admin, schema: { params: IdParams, body: ReasonBody, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    return done(reply, () => blockAccount(db, request.params.id, request.body.reason, actorOf(request)))
  })

  app.post<{ Params: Static<typeof IdParams>, Body: Static<typeof ReasonBody> }>('/api/admin/users/:id/unblock', { ...admin, schema: { params: IdParams, body: ReasonBody, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    return done(reply, () => unblockAccount(db, request.params.id, request.body.reason, actorOf(request)))
  })

  app.post<{ Body: Static<typeof BindingBody> }>('/api/admin/bindings', { ...admin, schema: { body: BindingBody, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    return done(reply, () => bindByAdmin(db, request.body, actorOf(request)))
  })

  app.get('/api/admin/roles', { ...admin, schema: { response: { '4xx': ErrorResponse } } }, async () => {
    return { grants: await listGrants(db) }
  })

  app.post<{ Body: Static<typeof GrantBody> }>('/api/admin/roles', { ...admin, schema: { body: GrantBody, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    try {
      const grant = await grantRole(db, request.body.userId, request.body.role, request.body.reason, actorOf(request))
      if (!grant) return reply.code(404).send({ error: 'not_found' })
      return reply.code(201).send(grant)
    } catch (err) {
      if (err instanceof RosterConflict) return reply.code(409).send({ error: err.code })
      throw err
    }
  })

  app.post<{ Params: Static<typeof IdParams>, Body: Static<typeof ReasonBody> }>('/api/admin/roles/:id/revoke', { ...admin, schema: { params: IdParams, body: ReasonBody, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    return done(reply, () => revokeGrant(db, request.params.id, request.body.reason, actorOf(request)))
  })

  app.get('/api/admin/audit', { preHandler: guards.requireRole('school_admin', 'read_only_auditor'), schema: { response: { '4xx': ErrorResponse } } }, async () => {
    return { events: await readAudit(db, SCHOOL_SCOPE) }
  })
}

/** 204 when the change was made, 404 when its subject does not exist, 409 with the code when the state refuses it. */
async function done(reply: FastifyReply, fn: () => Promise<boolean>) {
  try {
    if (!await fn()) return reply.code(404).send({ error: 'not_found' })
    return reply.code(204).send()
  } catch (err) {
    if (err instanceof RosterConflict) return reply.code(409).send({ error: err.code })
    throw err
  }
}
