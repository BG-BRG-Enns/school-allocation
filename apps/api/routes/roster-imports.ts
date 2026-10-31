// CSV roster upload and template download.

import * as endpoints from '@school-allocation/api-contracts/roster-imports-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import { ROSTER_CSV_TEMPLATE } from '@school-allocation/school-core'
import type { FastifyInstance } from 'fastify'
import { actorOf } from '../lib/actor.ts'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { schoolWords } from '../lib/i18n.ts'
import { importCsvRoster } from '../services/roster-import.ts'

export interface RosterImportsOptions {
  db: Database
  guards: Guards
}

/** The JSON around a CSV of CSV_LIMITS.rows rows of long fields. */
const CSV_BODY_LIMIT = 12 * 1024 * 1024
export async function rosterImportsRoutes(app: FastifyInstance, { db, guards }: RosterImportsOptions): Promise<void> {
  const admin = { preHandler: guards.requireRole('school_admin') }

  registerEndpoint(app, endpoints.postAdminRosterCsv, { ...admin, bodyLimit: CSV_BODY_LIMIT }, async (request, reply) => {
    const batch = await importCsvRoster(db, request.body.csv, request.body.schoolYear, actorOf(callerOf(request)))
    return reply.code(201).send(batch)
  })

  registerEndpoint(app, endpoints.getAdminRosterCsvTemplate, { ...admin, exposeHeadRoute: false }, async (_request, reply) => {
    const { t } = await schoolWords(db)
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${t.files.rosterTemplate}"`)
      .send(ROSTER_CSV_TEMPLATE)
  })
}
