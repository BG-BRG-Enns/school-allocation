// The publication of a run and what follows it: a student's result and their move in the swap window, an item's participants,
// the organizer's changes by hand with their log, the assignments workbook.

import * as endpoints from '@school-allocation/api-contracts/publication-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import { actorOf } from '../lib/actor.ts'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { runWorkbook } from '../lib/xlsx.ts'
import { runCampaign } from '../services/allocation.ts'
import { visibleCampaign } from '../services/catalogue.ts'
import { changeAssignment, changeLog, swap } from '../services/assignment-changes.ts'
import { myResult, participants, publishedReview, publishRun } from '../services/publication.ts'

export interface PublicationRoutesOptions {
  db: Database
  guards: Guards
  /** Where the links in notices point. */
  baseUrl: string
  /** Told after a publication, so the notices go out without waiting for the next poll. */
  wakeSender?: () => void
}

export async function publicationRoutes(app: FastifyInstance, { db, guards, baseUrl, wakeSender }: PublicationRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }
  const auditor = { preHandler: guards.requireRole('campaign_organizer', 'school_admin', 'read_only_auditor') }

  registerEndpoint(app, endpoints.postAdminCampaignsByIdRunsByRunIdPublish, { ...organizer }, async (request) => {
    const campaign = await runCampaign(db, request.params.id)
    const published = await publishRun(db, { baseUrl }, campaign, request.params.runId, request.body.cancelledItemIds, actorOf(callerOf(request)))
    wakeSender?.()
    return { campaign: published.campaign, run: published.run }
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdExportAssignmentsXlsx, { ...auditor, exposeHeadRoute: false }, async (request, reply) => {
    const { campaign, review, changes } = await publishedReview(db, request.params.id, (c) => changeLog(db, c))
    const bytes = await runWorkbook(review, changes)
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="zuteilung-${campaign.schoolYear.replace('/', '-')}.xlsx"`)
      .send(bytes)
  })

  registerEndpoint(app, endpoints.getCampaignsByIdMyResult, { ...signedIn }, async (request) => {
    return myResult(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request))
  })

  registerEndpoint(app, endpoints.getCampaignsByIdItemsByItemIdParticipants, { ...signedIn }, async (request) => {
    return participants(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request), request.params.itemId)
  })

  // The student's move in the swap window; the result as it is afterwards.
  registerEndpoint(app, endpoints.postCampaignsByIdSwap, { ...signedIn }, async (request) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    await swap(db, { baseUrl }, campaign, callerOf(request), request.body.itemId)
    wakeSender?.()
    return myResult(db, campaign, callerOf(request))
  })

  // The organizer's change by hand, and the log of every change since publication.
  registerEndpoint(app, endpoints.postAdminCampaignsByIdAssignments, { ...organizer }, async (request) => {
    const change = await changeAssignment(db, { baseUrl }, await runCampaign(db, request.params.id), callerOf(request), request.body)
    wakeSender?.()
    return { change }
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdAssignments, { ...auditor }, async (request) => {
    return { changes: await changeLog(db, await runCampaign(db, request.params.id)) }
  })
}
