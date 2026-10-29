// CSV roster upload and template download.

import { BatchDetailSchema } from '@school-allocation/api-contracts'
import { ErrorResponse } from '@school-allocation/api-contracts/common'
import { CsvBody } from '@school-allocation/api-contracts/roster'
import { ROSTER_CSV_TEMPLATE } from '@school-allocation/school-core'
import type { FastifyInstance } from 'fastify'
import { type Static } from 'typebox'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { importCsvRoster } from '../services/roster-import.ts'

export interface RosterImportsOptions {
  db: Database
  guards: Guards
}

/** The JSON around a CSV of CSV_LIMITS.rows rows of long fields. */
const CSV_BODY_LIMIT = 12 * 1024 * 1024
export async function rosterImportsRoutes(app: FastifyInstance, { db, guards }: RosterImportsOptions): Promise<void> {
  const admin = { preHandler: guards.requireRole('school_admin') }

  app.post<{ Body: Static<typeof CsvBody> }>('/api/admin/roster/csv', {
    ...admin,
    bodyLimit: CSV_BODY_LIMIT,
    schema: { body: CsvBody, response: { '201': BatchDetailSchema, '4xx': ErrorResponse } },
  }, async (request, reply) => {
    const batch = await importCsvRoster(db, request.body.csv, request.body.schoolYear, callerOf(request).id)
    return reply.code(201).send(batch)
  })

  app.get('/api/admin/roster/csv/template', { ...admin, exposeHeadRoute: false }, (_request, reply) => {
    void reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="schulwahl-personen.csv"')
      .send(ROSTER_CSV_TEMPLATE)
  })
}
