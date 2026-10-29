// Organizer ranking changes and pre-assignment exemptions.

import * as endpoints from '@school-allocation/api-contracts/choice-admin-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { visibleCampaign } from '../services/catalogue.ts'
import { choiceView, exemptPreAssignment, namedStudent, saveRanking } from '../services/choices.ts'

export interface WindowRoutesOptions {
  db: Database
  guards: Guards
}

export async function choiceAdminRoutes(app: FastifyInstance, { db, guards }: WindowRoutesOptions): Promise<void> {
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }

  registerEndpoint(app, endpoints.getAdminCampaignsByIdChoicesByPersonId, { ...organizer }, async (request) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const student = await namedStudent(db, campaign, request.params.personId)
    return { campaign, ...await choiceView(db, campaign, student) }
  })

  registerEndpoint(app, endpoints.putAdminCampaignsByIdChoicesByPersonId, { ...organizer }, async (request) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const student = await namedStudent(db, campaign, request.params.personId)
    return ({ campaign, ...await saveRanking(db, campaign, student.personId, request.body.ranking, { caller: callerOf(request), reason: request.body.reason }) })
  })

  registerEndpoint(app, endpoints.postAdminCampaignsByIdPreassignmentsByPersonIdByItemIdExempt, { ...organizer }, async (request) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const student = await namedStudent(db, campaign, request.params.personId)
    await exemptPreAssignment(db, campaign, student.personId, request.params.itemId.toLowerCase(), request.body.reason, callerOf(request))
    return { campaign, ...await choiceView(db, campaign, student) }
  })
}
