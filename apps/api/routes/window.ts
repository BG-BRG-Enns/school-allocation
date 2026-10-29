// Student choice reads and saves.

import * as endpoints from '@school-allocation/api-contracts/window-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
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

  registerEndpoint(app, endpoints.getCampaignsByIdMyChoice, { ...signedIn }, async (request) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const caller = callerOf(request)
    const student = await callerStudent(db, campaign, caller)
    return { campaign, ...redactChoices(campaign, caller, await choiceView(db, campaign, student)) }
  })

  registerEndpoint(app, endpoints.putCampaignsByIdMyChoice, { ...signedIn }, async (request) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const caller = callerOf(request)
    const student = await callerStudent(db, campaign, caller)
    return ({ campaign, ...redactChoices(campaign, caller, await saveRanking(db, campaign, student.personId, request.body.ranking, { caller })) })
  })
}
