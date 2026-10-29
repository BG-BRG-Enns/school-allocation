// Roster configuration, batch decisions and person search.

import { BatchDetailSchema, GroupsResponse, PersonsResponse, RosterOverviewSchema } from '@school-allocation/api-contracts'
import { ErrorResponse, IdParams } from '@school-allocation/api-contracts/common'
import { GroupsBody, PersonsQuery } from '@school-allocation/api-contracts/roster'
import { schoolYearOf } from '@school-allocation/school-core'
import type { FastifyInstance } from 'fastify'
import { type Static } from 'typebox'
import type { Config } from '../config.ts'
import { actorOf } from '../lib/actor.ts'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { readGroups, replaceGroups } from '../services/roster-groups.ts'
import { commitBatch, currentBatch, discardBatch, listBatches, readBatch, searchPersons } from '../services/roster.ts'

export interface AdminRosterOptions {
  config: Config
  db: Database
  guards: Guards
}

/** The school year today falls in, by the school's clock. */
function suggestedSchoolYear(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Vienna', year: 'numeric', month: 'numeric' }).formatToParts(now)
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return schoolYearOf(part('year'), part('month'))
}

export async function adminRosterRoutes(app: FastifyInstance, { config, db, guards }: AdminRosterOptions): Promise<void> {
  const admin = { preHandler: guards.requireRole('school_admin') }

  app.get('/api/admin/roster', { ...admin, schema: { response: { '200': RosterOverviewSchema, '4xx': ErrorResponse } } }, async () => {
    const [current, groups, batches] = await Promise.all([currentBatch(db), readGroups(db), listBatches(db)])
    return { current: current ?? null, groups, batches, suggestedSchoolYear: suggestedSchoolYear(), graphScopes: config.graphScopes }
  })

  app.put<{ Body: Static<typeof GroupsBody> }>('/api/admin/roster/groups', { ...admin, schema: { body: GroupsBody, response: { '200': GroupsResponse, '4xx': ErrorResponse } } }, async (request) => {
    const groups = await replaceGroups(db, request.body.groups, actorOf(callerOf(request)))
    return { groups }
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/admin/roster/batches/:id', { ...admin, schema: { params: IdParams, response: { '200': BatchDetailSchema, '4xx': ErrorResponse } } }, async (request, reply) => {
    const batch = await readBatch(db, request.params.id)
    if (!batch) return reply.code(404).send({ error: 'not_found' })
    return batch
  })

  app.post<{ Params: Static<typeof IdParams> }>('/api/admin/roster/batches/:id/commit', { ...admin, schema: { params: IdParams, response: { '200': BatchDetailSchema, '4xx': ErrorResponse } } }, async (request, reply) => {
    const batch = await commitBatch(db, request.params.id, actorOf(callerOf(request)), config.entra.tenantId)
    return batch ?? reply.code(404).send({ error: 'not_found' })
  })

  app.post<{ Params: Static<typeof IdParams> }>('/api/admin/roster/batches/:id/discard', { ...admin, schema: { params: IdParams, response: { '200': BatchDetailSchema, '4xx': ErrorResponse } } }, async (request, reply) => {
    const batch = await discardBatch(db, request.params.id, actorOf(callerOf(request)))
    return batch ?? reply.code(404).send({ error: 'not_found' })
  })

  app.get<{ Querystring: Static<typeof PersonsQuery> }>('/api/admin/roster/persons', { ...admin, schema: { querystring: PersonsQuery, response: { '200': PersonsResponse, '4xx': ErrorResponse } } }, async (request) => {
    return { persons: await searchPersons(db, request.query.q?.trim() ?? '', 200) }
  })
}
