// Campaign reads, administration and lifecycle transitions.

import { CampaignListResponse, CampaignSchema, CampaignViewSchema } from '@school-allocation/api-contracts'
import { CampaignBody, CampaignChangesBody, TransitionBody } from '@school-allocation/api-contracts/catalogue'
import { ErrorResponse, IdParams } from '@school-allocation/api-contracts/common'
import type { FastifyInstance } from 'fastify'
import { type Static } from 'typebox'
import { actorOf } from '../lib/actor.ts'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { createCampaign, listCampaigns, transitionCampaign, updateCampaign } from '../services/campaigns.ts'
import { projectDays } from '../services/catalogue-input.ts'
import { campaignView, visibleCampaign } from '../services/catalogue.ts'

export interface CampaignRoutesOptions {
  db: Database
  guards: Guards
  /** Where the links in notices point. */
  baseUrl: string
  /** Told after a transition, so queued notices go out without waiting for the next poll. */
  wakeSender?: () => void
}

export async function campaignsRoutes(app: FastifyInstance, { db, guards, baseUrl, wakeSender }: CampaignRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }

  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }

  app.get('/api/campaigns', { ...signedIn, schema: { response: { '200': CampaignListResponse, '4xx': ErrorResponse } } }, async (request) => {
    return { campaigns: await listCampaigns(db, callerOf(request)) }
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/campaigns/:id', { ...signedIn, schema: { params: IdParams, response: { '200': CampaignViewSchema, '4xx': ErrorResponse } } }, async (request, _reply) => {
    return campaignView(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request))
  })

  // Organizers.

  app.post<{ Body: Static<typeof CampaignBody> }>('/api/admin/campaigns', { ...organizer, schema: { body: CampaignBody, response: { '201': CampaignSchema, '4xx': ErrorResponse } } }, async (request, reply) => {
    const days = projectDays(request.body.projectDays)
    if (typeof days === 'string') return reply.code(422).send({ error: days })
    return reply.code(201).send(await createCampaign(db, { ...request.body, projectDays: days }, actorOf(callerOf(request))))
  })

  app.patch<{ Params: Static<typeof IdParams>, Body: Static<typeof CampaignChangesBody> }>('/api/admin/campaigns/:id', { ...organizer, schema: { params: IdParams, body: CampaignChangesBody, response: { '200': CampaignSchema, '4xx': ErrorResponse } } }, async (request, reply) => {
    const days = projectDays(request.body.projectDays)
    if (typeof days === 'string') return reply.code(422).send({ error: days })
    const campaign = await updateCampaign(db, request.params.id, { ...request.body, projectDays: days }, actorOf(callerOf(request)))
    return campaign ?? reply.code(404).send({ error: 'not_found' })
  })

  app.post<{ Params: Static<typeof IdParams>, Body: Static<typeof TransitionBody> }>('/api/admin/campaigns/:id/transition', { ...organizer, schema: { params: IdParams, body: TransitionBody, response: { '200': CampaignSchema, '4xx': ErrorResponse } } }, async (request, reply) => {
    const campaign = await transitionCampaign(db, request.params.id, request.body.to, actorOf(callerOf(request)), { baseUrl })
    if (campaign) wakeSender?.()
    return campaign ?? reply.code(404).send({ error: 'not_found' })
  })
}
