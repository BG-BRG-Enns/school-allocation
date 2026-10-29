// Organizer ranking changes and pre-assignment exemptions.

import { ChoiceViewSchema } from '@school-allocation/api-contracts'
import { ErrorResponse } from '@school-allocation/api-contracts/common'
import { ExemptBody, ExemptParams, OnBehalfBody, PersonParams, RankingInvalidResponse } from '@school-allocation/api-contracts/window'
import type { FastifyInstance } from 'fastify'
import type { Static } from 'typebox'
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

  app.get<{ Params: Static<typeof PersonParams> }>('/api/admin/campaigns/:id/choices/:personId', { ...organizer, schema: { params: PersonParams, response: { '200': ChoiceViewSchema, '4xx': ErrorResponse } } }, async (request) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const student = await namedStudent(db, campaign, request.params.personId)
    return { campaign, ...await choiceView(db, campaign, student) }
  })

  app.put<{ Params: Static<typeof PersonParams>, Body: Static<typeof OnBehalfBody> }>('/api/admin/campaigns/:id/choices/:personId', {
    ...organizer, schema: { params: PersonParams, body: OnBehalfBody, response: { '200': ChoiceViewSchema, '422': RankingInvalidResponse, '4xx': ErrorResponse } },
  }, async (request) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const student = await namedStudent(db, campaign, request.params.personId)
    return ({ campaign, ...await saveRanking(db, campaign, student.personId, request.body.ranking, { caller: callerOf(request), reason: request.body.reason }) })
  })

  app.post<{ Params: Static<typeof ExemptParams>, Body: Static<typeof ExemptBody> }>('/api/admin/campaigns/:id/preassignments/:personId/:itemId/exempt', {
    ...organizer, schema: { params: ExemptParams, body: ExemptBody, response: { '200': ChoiceViewSchema, '4xx': ErrorResponse } },
  }, async (request, reply) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const student = await namedStudent(db, campaign, request.params.personId)
    const done = await exemptPreAssignment(db, campaign, student.personId, request.params.itemId.toLowerCase(), request.body.reason, callerOf(request))
    if (!done) return reply.code(404).send({ error: 'not_found' })
    return { campaign, ...await choiceView(db, campaign, student) }
  })
}
