// Retention: the school years with their records, and an administrator's purge of one past its retention.

import * as endpoints from '@school-allocation/api-contracts/retention-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import { actorOf } from '../lib/actor.ts'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { purgeSchoolYear, retentionOverview } from '../services/retention.ts'

export interface RetentionRoutesOptions {
  db: Database
  guards: Guards
}

export async function retentionRoutes(app: FastifyInstance, { db, guards }: RetentionRoutesOptions): Promise<void> {
  const admin = { preHandler: guards.requireRole('school_admin') }
  const reader = { preHandler: guards.requireRole('school_admin', 'read_only_auditor') }

  registerEndpoint(app, endpoints.getAdminRetention, { ...reader }, async () => {
    return { years: await retentionOverview(db) }
  })

  registerEndpoint(app, endpoints.postAdminPurge, { ...admin }, async (request) => {
    const removed = await purgeSchoolYear(db, request.body.schoolYear, request.body.reason, actorOf(callerOf(request)))
    return { schoolYear: request.body.schoolYear, removed }
  })
}
