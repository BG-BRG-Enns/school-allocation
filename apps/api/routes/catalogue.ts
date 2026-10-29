// Catalogue, demand, class status and printable export.

import { CatalogueResponse, ClassStatusSchema, DemandResponse, ItemsResponse, RosterClassesResponse, TeachersResponse } from '@school-allocation/api-contracts'
import { ClassParams, TeachersQuery } from '@school-allocation/api-contracts/catalogue'
import { ErrorResponse, IdParams, StrictObject } from '@school-allocation/api-contracts/common'
import type { FastifyInstance } from 'fastify'
import { type Static } from 'typebox'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { catalogueWorkbook } from '../lib/xlsx.ts'
import { readCampaign } from '../services/campaigns.ts'
import { catalogueView, classOptions, classStatus, demandView, itemsView, teacherOptions, visibleCampaign } from '../services/catalogue.ts'
import { catalogueItems } from '../services/items.ts'

export interface CatalogueRoutesOptions {
  db: Database
  guards: Guards
}

export async function catalogueRoutes(app: FastifyInstance, { db, guards }: CatalogueRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }

  app.get<{ Params: Static<typeof IdParams> }>('/api/campaigns/:id/demand', { ...signedIn, schema: { params: IdParams, response: { '200': DemandResponse, '4xx': ErrorResponse } } }, async (request, _reply) => {
    return demandView(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request))
  })

  // A class as its class teacher sees it in this campaign: its students, and
  // the class activities that take the class on which days. What the window
  // adds (who has chosen) comes with it.
  app.get<{ Params: Static<typeof IdParams> & Static<typeof ClassParams> }>('/api/campaigns/:id/classes/:className/status', {
    ...signedIn,
    schema: { params: StrictObject({ ...IdParams.properties, ...ClassParams.properties }), response: { '200': ClassStatusSchema, '4xx': ErrorResponse } },
  }, async (request, _reply) => {
    return classStatus(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request), request.params.className)
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/campaigns/:id/items', { ...signedIn, schema: { params: IdParams, response: { '200': ItemsResponse, '4xx': ErrorResponse } } }, async (request, _reply) => {
    return itemsView(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request))
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/campaigns/:id/catalogue', { ...signedIn, schema: { params: IdParams, response: { '200': CatalogueResponse, '4xx': ErrorResponse } } }, async (request, _reply) => {
    return catalogueView(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request))
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/campaigns/:id/classes', { ...signedIn, schema: { params: IdParams, response: { '200': RosterClassesResponse, '4xx': ErrorResponse } } }, async (request, _reply) => {
    return classOptions(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request))
  })

  app.get<{ Params: Static<typeof IdParams>, Querystring: Static<typeof TeachersQuery> }>('/api/campaigns/:id/teachers', { ...signedIn, schema: { params: IdParams, querystring: TeachersQuery, response: { '200': TeachersResponse, '4xx': ErrorResponse } } }, async (request, _reply) => {
    return teacherOptions(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request), request.query.q?.trim() ?? '')
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/admin/campaigns/:id/export/catalogue.xlsx', {
    preHandler: guards.requireRole('campaign_organizer', 'school_admin', 'read_only_auditor'),
    exposeHeadRoute: false,
    schema: { params: IdParams, response: { '4xx': ErrorResponse } },
  }, async (request, reply) => {
    const campaign = await readCampaign(db, request.params.id)
    if (!campaign) return reply.code(404).send({ error: 'not_found' })
    const bytes = await catalogueWorkbook(await catalogueItems(db, campaign.id))
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="katalog-${campaign.schoolYear.replace('/', '-')}.xlsx"`)
      .send(bytes)
  })
}
