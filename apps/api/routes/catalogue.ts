// Catalogue, demand, class status and printable export.

import { catalogueExport } from '../services/catalogue.ts'

import * as endpoints from '@school-allocation/api-contracts/catalogue-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { t } from '../lib/i18n.ts'
import { catalogueWorkbook } from '../lib/xlsx.ts'
import { placeStudent } from '../services/assignment-changes.ts'
import { catalogueView, classOptions, classStatus, demandView, itemsView, teacherOptions, visibleCampaign } from '../services/catalogue.ts'

export interface CatalogueRoutesOptions {
  db: Database
  guards: Guards
  /** Where the link in a placed student's notice points. */
  baseUrl: string
  /** Told after a placement, so the notice goes out without waiting for the next poll. */
  wakeSender?: () => void
}

export async function catalogueRoutes(app: FastifyInstance, { db, guards, baseUrl, wakeSender }: CatalogueRoutesOptions): Promise<void> {
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

  // The class teacher places a student of their class who is short of minutes; the class as it is afterwards.
  registerEndpoint(app, endpoints.postCampaignsByIdClassesByClassNamePlace, { ...signedIn }, async (request, _reply) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    await placeStudent(db, { baseUrl }, campaign, callerOf(request), request.params.className, request.body.personId, request.body.itemId, request.body.reason)
    wakeSender?.()
    return classStatus(db, campaign, callerOf(request), request.params.className)
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
    const { campaign, items } = await catalogueExport(db, request.params.id)
    const bytes = await catalogueWorkbook(items)
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${t.files.catalogue(campaign.schoolYear.replace('/', '-'))}"`)
      .send(bytes)
  })
}
