// The mail templates and the test mail (docs/domain-and-api.md §4):
//
//   GET  /api/admin/mail-templates             every kind with its text and placeholders
//   PUT  /api/admin/mail-templates/:kind       { subject, body }: checked against the subset and the kind's placeholders, audited
//   POST /api/admin/mail-templates/:kind/test  the kind with sample values, to the caller's own address, audited
//   GET  /api/admin/mail/status                whether mail is set up, and what waits in the outbox
//
// Organizers and administrators; the texts are the school's, not a campaign's.

import * as endpoints from '@school-allocation/api-contracts/mail-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.ts'
import { actorOf } from '../lib/actor.ts'
import { callerOf,type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { countQueued } from '../lib/mail/outbox.ts'
import { readTemplates,saveTemplate,TemplateInvalid } from '../services/mail-templates.ts'
import { queueTestMail } from '../services/mail.ts'

export interface MailRoutesOptions {
  config: Config
  db: Database
  guards: Guards
  /** Told when a mail was queued, so it goes out without waiting for the next poll. */
  wakeSender?: () => void
}

export async function mailRoutes(app: FastifyInstance, { config, db, guards, wakeSender }: MailRoutesOptions): Promise<void> {
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }

  registerEndpoint(app, endpoints.getAdminMailTemplates, { ...organizer }, async () => {
    return { templates: await readTemplates(db), mailEnabled: config.mail !== null }
  })

  registerEndpoint(app, endpoints.putAdminMailTemplatesByKind, { ...organizer }, async (request, reply) => {
    try {
      return { template: await saveTemplate(db, request.params.kind, request.body.subject, request.body.body, actorOf(callerOf(request))) }
    } catch (err) {
      if (err instanceof TemplateInvalid) return reply.code(422).send({ error: 'template_invalid', problems: err.problems })
      throw err
    }
  })

  // The template as it stands, with sample values, to the caller's own
  // address: what a recipient will get, through the real outbox and server.
  registerEndpoint(app, endpoints.postAdminMailTemplatesByKindTest, { ...organizer }, async (request, reply) => {
    await queueTestMail(db, request.params.kind, callerOf(request), config.mail !== null)
    wakeSender?.()
    return reply.code(202).send({ queued: true })
  })

  registerEndpoint(app, endpoints.getAdminMailStatus, { ...organizer }, async () => {
    return { mailEnabled: config.mail !== null, queued: await countQueued(db) }
  })
}
