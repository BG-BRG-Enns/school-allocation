// Catalogue, demand, class status and printable export.

import * as endpoints from '@school-allocation/api-contracts/catalogue-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import { callerOf,type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { catalogueWorkbook } from '../lib/xlsx.ts'
import { readCampaign } from '../services/campaigns.ts'
import { catalogueView,classOptions,classStatus,demandView,itemsView,teacherOptions,visibleCampaign } from '../services/catalogue.ts'
import { catalogueItems } from '../services/items.ts'

export interface CatalogueRoutesOptions {
  db: Database
  guards: Guards
}

export async function catalogueRoutes(app: FastifyInstance, { db, guards }: CatalogueRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }

  registerEndpoint(app, endpoints.getCampaignsByIdDemand, { ...signedIn }, async (request, _reply) => {
    return demandView(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request))
  })

  // A class as its class teacher sees it in this campaign: its students, and
  // the class activities that take the class on which days. What the window
  // adds (who has chosen) comes with it.
  registerEndpoint(app, endpoints.getCampaignsByIdClassesByClassNameStatus, { ...signedIn }, async (request, _reply) => {
    return classStatus(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request), request.params.className)
  })

  registerEndpoint(app, endpoints.getCampaignsByIdItems, { ...signedIn }, async (request, _reply) => {
    return itemsView(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request))
  })

  registerEndpoint(app, endpoints.getCampaignsByIdCatalogue, { ...signedIn }, async (request, _reply) => {
    return catalogueView(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request))
  })

  registerEndpoint(app, endpoints.getCampaignsByIdClasses, { ...signedIn }, async (request, _reply) => {
    return classOptions(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request))
  })

  registerEndpoint(app, endpoints.getCampaignsByIdTeachers, { ...signedIn }, async (request, _reply) => {
    return teacherOptions(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request), request.query.q?.trim() ?? '')
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdExportCatalogueXlsx, { preHandler: guards.requireRole('campaign_organizer', 'school_admin', 'read_only_auditor'), exposeHeadRoute: false }, async (request, reply) => {
    const campaign = await readCampaign(db, request.params.id)
    if (!campaign) return reply.code(404).send({ error: 'not_found' })
    const bytes = await catalogueWorkbook(await catalogueItems(db, campaign.id))
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="katalog-${campaign.schoolYear.replace('/', '-')}.xlsx"`)
      .send(bytes)
  })
}
