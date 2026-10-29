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
// Every change is audited in its own transaction (services/admin-users.ts,
// services/bindings.ts). An administrator can neither block themselves nor
// revoke their own administration.

import { accountDirectory, roleGrants, schoolAudit } from '../services/admin-users.ts'

import * as endpoints from '@school-allocation/api-contracts/admin-users-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance, FastifyReply } from 'fastify'
import { actorOf } from '../lib/actor.ts'
import type { Guards } from '../lib/auth.ts'
import { callerOf } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { blockAccount, grantRole, revokeGrant, unblockAccount } from '../services/admin-users.ts'
import { bindByAdmin } from '../services/bindings.ts'

export interface AdminUsersOptions {
  db: Database
  guards: Guards
}

export async function adminUsersRoutes(app: FastifyInstance, { db, guards }: AdminUsersOptions): Promise<void> {
  const admin = { preHandler: guards.requireRole('school_admin') }

  registerEndpoint(app, endpoints.getAdminUsers, { ...admin }, async (request) => {
    return accountDirectory(db, request.query)
  })

  registerEndpoint(app, endpoints.postAdminUsersByIdBlock, { ...admin }, async (request, reply) => {
    return done(reply, () => blockAccount(db, request.params.id, request.body.reason, actorOf(callerOf(request))))
  })

  registerEndpoint(app, endpoints.postAdminUsersByIdUnblock, { ...admin }, async (request, reply) => {
    return done(reply, () => unblockAccount(db, request.params.id, request.body.reason, actorOf(callerOf(request))))
  })

  registerEndpoint(app, endpoints.postAdminBindings, { ...admin }, async (request, reply) => {
    return done(reply, () => bindByAdmin(db, request.body, actorOf(callerOf(request))))
  })

  registerEndpoint(app, endpoints.getAdminRoles, { ...admin }, async () => {
    return roleGrants(db)
  })

  registerEndpoint(app, endpoints.postAdminRoles, { ...admin }, async (request, reply) => {
    try {
      const grant = await grantRole(db, request.body.userId, request.body.role, request.body.reason, actorOf(callerOf(request)))
      if (!grant) return reply.code(404).send({ error: 'not_found' })
      return reply.code(201).send(grant)
    } catch (err) {
      if (err instanceof ApplicationError) return reply.code(409).send({ error: err.code })
      throw err
    }
  })

  registerEndpoint(app, endpoints.postAdminRolesByIdRevoke, { ...admin }, async (request, reply) => {
    return done(reply, () => revokeGrant(db, request.params.id, request.body.reason, actorOf(callerOf(request))))
  })

  registerEndpoint(app, endpoints.getAdminAudit, { preHandler: guards.requireRole('school_admin', 'read_only_auditor') }, async () => {
    return schoolAudit(db)
  })
}

/** 204 when the change was made, 404 when its subject does not exist, 409 with the code when the state refuses it. */
async function done(reply: FastifyReply, fn: () => Promise<boolean>) {
  try {
    if (!await fn()) return reply.code(404).send({ error: 'not_found' })
    return reply.code(204).send()
  } catch (err) {
    if (err instanceof ApplicationError) return reply.code(409).send({ error: err.code })
    throw err
  }
}
