// Campaign reads, administration and lifecycle transitions.

import * as endpoints from '@school-allocation/api-contracts/campaigns-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
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

  registerEndpoint(app, endpoints.getCampaigns, { ...signedIn }, async (request) => {
    return { campaigns: await listCampaigns(db, callerOf(request)) }
  })

  registerEndpoint(app, endpoints.getCampaignsById, { ...signedIn }, async (request, _reply) => {
    return campaignView(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request))
  })

  // Organizers.

  registerEndpoint(app, endpoints.postAdminCampaigns, { ...organizer }, async (request, reply) => {
    const days = projectDays(request.body.projectDays)
    if (typeof days === 'string') return reply.code(422).send({ error: days })
    return reply.code(201).send(await createCampaign(db, { ...request.body, projectDays: days }, actorOf(callerOf(request))))
  })

  registerEndpoint(app, endpoints.patchAdminCampaignsById, { ...organizer }, async (request, reply) => {
    const days = projectDays(request.body.projectDays)
    if (typeof days === 'string') return reply.code(422).send({ error: days })
    const campaign = await updateCampaign(db, request.params.id, { ...request.body, projectDays: days }, actorOf(callerOf(request)))
    return campaign ?? reply.code(404).send({ error: 'not_found' })
  })

  registerEndpoint(app, endpoints.postAdminCampaignsByIdTransition, { ...organizer }, async (request, reply) => {
    const campaign = await transitionCampaign(db, request.params.id, request.body.to, actorOf(callerOf(request)), { baseUrl })
    if (campaign) wakeSender?.()
    return campaign ?? reply.code(404).send({ error: 'not_found' })
  })
}
