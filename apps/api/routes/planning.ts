// Planning with teachers:
//   GET  /api/my-availability                                  a teacher's own days, those of the registrations taking proposals
//   PUT  /api/my-availability/:date                            { status }: a teacher sets their own status on such a day
//   GET  /api/campaigns/:id/availability                       who is not plainly available on the registration's days, for whoever proposes
//   GET  /api/admin/campaigns/:id/planning                     per teacher and day: availability, what they lead and accompany
//   PUT  /api/admin/campaigns/:id/availability/:personId/:date { status }: an organizer sets anyone's, until the archive, audited
//   GET  /api/admin/campaigns/:id/export/planning.xlsx         the overview as a workbook, one row per teacher and day

import * as endpoints from '@school-allocation/api-contracts/planning-endpoints'
import type { FastifyInstance } from 'fastify'
import { actorOf } from '../lib/actor.ts'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { registerEndpoint } from '../lib/endpoint.ts'
import { schoolWords } from '../lib/i18n.ts'
import { planningWorkbook } from '../lib/xlsx.ts'
import { visibleCampaign } from '../services/catalogue.ts'
import { campaignAvailability, myAvailability, planning, setAvailabilityFor, setMyAvailability } from '../services/planning.ts'

export interface PlanningRoutesOptions {
  db: Database
  guards: Guards
}

export async function planningRoutes(app: FastifyInstance, { db, guards }: PlanningRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }
  const reader = { preHandler: guards.requireRole('campaign_organizer', 'school_admin', 'read_only_auditor') }

  registerEndpoint(app, endpoints.getMyAvailability, { ...signedIn }, async (request) => {
    return myAvailability(db, callerOf(request))
  })

  registerEndpoint(app, endpoints.putMyAvailabilityByDate, { ...signedIn }, async (request) => {
    return setMyAvailability(db, callerOf(request), request.params.date, request.body.status)
  })

  registerEndpoint(app, endpoints.getCampaignsByIdAvailability, { ...signedIn }, async (request) => {
    const caller = callerOf(request)
    return campaignAvailability(db, await visibleCampaign(db, caller, request.params.id), caller)
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdPlanning, { ...reader }, async (request) => {
    return (await planning(db, request.params.id)).planning
  })

  registerEndpoint(app, endpoints.putAdminCampaignsByIdAvailabilityByPersonIdByDate, { ...organizer }, async (request) => {
    const { id, personId, date } = request.params
    return setAvailabilityFor(db, id, personId, date, request.body.status, actorOf(callerOf(request)))
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdExportPlanningXlsx, { ...reader, exposeHeadRoute: false }, async (request, reply) => {
    const { campaign, planning: overview } = await planning(db, request.params.id)
    const words = await schoolWords(db)
    const bytes = await planningWorkbook(words, overview)
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${words.t.files.planning(campaign.schoolYear.replace('/', '-'))}"`)
      .send(bytes)
  })
}
