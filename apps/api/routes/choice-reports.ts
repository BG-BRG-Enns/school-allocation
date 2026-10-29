// Missing-choice reports, export and campaign mail history.

import * as endpoints from '@school-allocation/api-contracts/choice-reports-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import { type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { listCampaignMails } from '../lib/mail/outbox.ts'
import { missingWorkbook } from '../lib/xlsx.ts'
import { readCampaign } from '../services/campaigns.ts'
import { missingStudents } from '../services/choices.ts'

export interface WindowRoutesOptions {
  db: Database
  guards: Guards
}

export async function choiceReportsRoutes(app: FastifyInstance, { db, guards }: WindowRoutesOptions): Promise<void> {
  const auditor = { preHandler: guards.requireRole('campaign_organizer', 'school_admin', 'read_only_auditor') }

  registerEndpoint(app, endpoints.getAdminCampaignsByIdMissing, { ...auditor }, async (request, reply) => {
    const campaign = await readCampaign(db, request.params.id)
    if (!campaign) return reply.code(404).send({ error: 'not_found' })
    return { students: await missingStudents(db, campaign) }
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdExportMissingXlsx, { ...auditor, exposeHeadRoute: false }, async (request, reply) => {
    const campaign = await readCampaign(db, request.params.id)
    if (!campaign) return reply.code(404).send({ error: 'not_found' })
    const bytes = await missingWorkbook(await missingStudents(db, campaign))
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="wahlstand-${campaign.schoolYear.replace('/', '-')}.xlsx"`)
      .send(bytes)
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdMail, { ...auditor }, async (request, reply) => {
    const campaign = await readCampaign(db, request.params.id)
    if (!campaign) return reply.code(404).send({ error: 'not_found' })
    // The protocol: what was sent to whom and whether it left; the texts, subject included, stay in the outbox.
    const mails = (await listCampaignMails(db, campaign.id)).map(({ body: _body, subject: _subject, ...rest }) => rest)
    return { mails }
  })
}
