// Roster configuration, batch decisions and person search.

import { personDirectory, rosterOverview } from '../services/roster.ts'

import * as endpoints from '@school-allocation/api-contracts/admin-roster-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.ts'
import { actorOf } from '../lib/actor.ts'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { replaceGroups } from '../services/roster-groups.ts'
import { commitBatch, discardBatch, readBatch } from '../services/roster.ts'

export interface AdminRosterOptions {
  config: Config
  db: Database
  guards: Guards
}

export async function adminRosterRoutes(app: FastifyInstance, { config, db, guards }: AdminRosterOptions): Promise<void> {
  const admin = { preHandler: guards.requireRole('school_admin') }

  registerEndpoint(app, endpoints.getAdminRoster, { ...admin }, async () => {
    return rosterOverview(db, config.graphScopes)
  })

  registerEndpoint(app, endpoints.putAdminRosterGroups, { ...admin }, async (request) => {
    const groups = await replaceGroups(db, request.body.groups, actorOf(callerOf(request)))
    return { groups }
  })

  registerEndpoint(app, endpoints.getAdminRosterBatchesById, { ...admin }, async (request) => {
    const batch = await readBatch(db, request.params.id)
    return batch
  })

  registerEndpoint(app, endpoints.postAdminRosterBatchesByIdCommit, { ...admin }, async (request) => {
    const batch = await commitBatch(db, request.params.id, actorOf(callerOf(request)), config.entra.tenantId)
    return batch
  })

  registerEndpoint(app, endpoints.postAdminRosterBatchesByIdDiscard, { ...admin }, async (request) => {
    const batch = await discardBatch(db, request.params.id, actorOf(callerOf(request)))
    return batch
  })

  registerEndpoint(app, endpoints.getAdminRosterPersons, { ...admin }, async (request) => {
    return personDirectory(db, request.query.q)
  })
}
