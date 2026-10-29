// Allocation runs: the solver's state, starting a run, the list and the review of one, its workbook.

import * as endpoints from '@school-allocation/api-contracts/allocation-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import { actorOf } from '../lib/actor.ts'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import type { SolverClient } from '../lib/solver-client.ts'
import { runWorkbook } from '../lib/xlsx.ts'
import { listRuns, runCampaign, runReview, solverStatus, startRun } from '../services/allocation.ts'

export interface AllocationRoutesOptions {
  db: Database
  guards: Guards
  /** null when SOLVER_URL is unset. */
  solver: SolverClient | null
}

export async function allocationRoutes(app: FastifyInstance, { db, guards, solver }: AllocationRoutesOptions): Promise<void> {
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }
  const auditor = { preHandler: guards.requireRole('campaign_organizer', 'school_admin', 'read_only_auditor') }
  const deps = { solver, log: app.log }

  registerEndpoint(app, endpoints.getAdminSolver, { ...auditor }, async () => solverStatus(deps))

  registerEndpoint(app, endpoints.postAdminCampaignsByIdRuns, { ...organizer }, async (request, reply) => {
    const campaign = await runCampaign(db, request.params.id)
    const { run } = await startRun(db, deps, campaign, request.body, actorOf(callerOf(request)))
    return reply.code(202).send({ run })
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdRuns, { ...auditor }, async (request) => {
    return listRuns(db, deps, await runCampaign(db, request.params.id))
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdRunsByRunId, { ...auditor }, async (request) => {
    return runReview(db, await runCampaign(db, request.params.id), request.params.runId)
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdRunsByRunIdExportXlsx, { ...auditor, exposeHeadRoute: false }, async (request, reply) => {
    const review = await runReview(db, await runCampaign(db, request.params.id), request.params.runId)
    const bytes = await runWorkbook(review)
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="zuteilung-lauf-${review.run.seq}.xlsx"`)
      .send(bytes)
  })
}
