// Missing-choice reports, export and campaign mail history.

import { missingReport } from '../services/choices.ts'
import { campaignMailHistory } from '../services/mail.ts'

import * as endpoints from '@school-allocation/api-contracts/choice-reports-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import { type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { schoolWords } from '../lib/i18n.ts'
import { missingWorkbook } from '../lib/xlsx.ts'

export interface ChoiceReportsRoutesOptions {
  db: Database
  guards: Guards
}

export async function choiceReportsRoutes(app: FastifyInstance, { db, guards }: ChoiceReportsRoutesOptions): Promise<void> {
  const auditor = { preHandler: guards.requireRole('campaign_organizer', 'school_admin', 'read_only_auditor') }

  registerEndpoint(app, endpoints.getAdminCampaignsByIdMissing, { ...auditor }, async (request) => {
    const { students } = await missingReport(db, request.params.id)
    return { students }
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdExportMissingXlsx, { ...auditor, exposeHeadRoute: false }, async (request, reply) => {
    const { campaign, students } = await missingReport(db, request.params.id)
    const words = await schoolWords(db)
    const bytes = await missingWorkbook(words, students)
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${words.t.files.missing(campaign.schoolYear.replace('/', '-'))}"`)
      .send(bytes)
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdMail, { ...auditor }, async (request) => {
    return campaignMailHistory(db, request.params.id)
  })
}
