// Student choice reads and saves.

import { ChoiceViewSchema } from '@school-allocation/api-contracts'
import { ErrorResponse, IdParams } from '@school-allocation/api-contracts/common'
import { RankingBody, RankingInvalidResponse } from '@school-allocation/api-contracts/window'
import type { FastifyInstance } from 'fastify'
import type { Static } from 'typebox'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { redactChoices } from '../lib/policies.ts'
import { visibleCampaign } from '../services/catalogue.ts'
import { callerStudent, choiceView, saveRanking } from '../services/choices.ts'

export interface WindowRoutesOptions {
  db: Database
  guards: Guards
}

export async function windowRoutes(app: FastifyInstance, { db, guards }: WindowRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }

  const rankingSchema = { params: IdParams, body: RankingBody, response: { '422': RankingInvalidResponse, '4xx': ErrorResponse } }

  app.get<{ Params: Static<typeof IdParams> }>('/api/campaigns/:id/my-choice', { ...signedIn, schema: { params: IdParams, response: { '200': ChoiceViewSchema, '4xx': ErrorResponse } } }, async (request) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const caller = callerOf(request)
    const student = await callerStudent(db, campaign, caller)
    return { campaign, ...redactChoices(campaign, caller, await choiceView(db, campaign, student)) }
  })

  app.put<{ Params: Static<typeof IdParams>, Body: Static<typeof RankingBody> }>('/api/campaigns/:id/my-choice', { ...signedIn, schema: { ...rankingSchema, response: { ...rankingSchema.response, 200: ChoiceViewSchema } } }, async (request) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const caller = callerOf(request)
    const student = await callerStudent(db, campaign, caller)
    return ({ campaign, ...redactChoices(campaign, caller, await saveRanking(db, campaign, student.personId, request.body.ranking, { caller })) })
  })
}
