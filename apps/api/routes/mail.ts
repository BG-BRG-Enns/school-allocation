// The mail templates and the test mail (docs/domain-and-api.md §4):
//
//   GET  /api/admin/mail-templates             every kind with its text and placeholders
//   PUT  /api/admin/mail-templates/:kind       { subject, body }: checked against the subset and the kind's placeholders, audited
//   POST /api/admin/mail-templates/:kind/test  the kind with sample values, to the caller's own address, audited
//   GET  /api/admin/mail/status                whether mail is set up, and what waits in the outbox
//
// Organizers and administrators; the texts are the school's, not a campaign's.

import type { FastifyInstance } from 'fastify'
import type { Static } from 'typebox'
import type { Config } from '../config.ts'
import { appendAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { countQueued, enqueueMail } from '../lib/mail/outbox.ts'
import { readTemplate, readTemplates, renderTemplate, SAMPLE_DATA, saveTemplate, TemplateInvalid } from '../lib/mail/templates.ts'
import { ErrorResponse } from '../lib/schemas/common.ts'
import { KindParams, TemplateBody, TemplateInvalidResponse } from '../lib/schemas/window.ts'
import { actorOf } from './admin-roster.ts'

export interface MailRoutesOptions {
  config: Config
  db: Database
  guards: Guards
  /** Told when a mail was queued, so it goes out without waiting for the next poll. */
  wakeSender?: () => void
}

export async function mailRoutes(app: FastifyInstance, { config, db, guards, wakeSender }: MailRoutesOptions): Promise<void> {
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }

  app.get('/api/admin/mail-templates', { ...organizer, schema: { response: { '4xx': ErrorResponse } } }, async () => {
    return { templates: await readTemplates(db), mailEnabled: config.mail !== null }
  })

  app.put<{ Params: Static<typeof KindParams>, Body: Static<typeof TemplateBody> }>('/api/admin/mail-templates/:kind', {
    ...organizer, schema: { params: KindParams, body: TemplateBody, response: { '422': TemplateInvalidResponse, '4xx': ErrorResponse } },
  }, async (request, reply) => {
    try {
      return { template: await saveTemplate(db, request.params.kind, request.body.subject, request.body.body, actorOf(request)) }
    } catch (err) {
      if (err instanceof TemplateInvalid) return reply.code(422).send({ error: 'template_invalid', problems: err.problems })
      throw err
    }
  })

  // The template as it stands, with sample values, to the caller's own
  // address: what a recipient will get, through the real outbox and server.
  app.post<{ Params: Static<typeof KindParams> }>('/api/admin/mail-templates/:kind/test', { ...organizer, schema: { params: KindParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    if (config.mail === null) return reply.code(409).send({ error: 'mail_off' })
    const caller = callerOf(request)
    if (caller.email === null) return reply.code(409).send({ error: 'no_address' })
    const template = await readTemplate(db, request.params.kind)
    const { subject, body } = renderTemplate(template, SAMPLE_DATA)
    const dedupeKey = `test:${request.params.kind}:${caller.id}:${Date.now()}`
    await db.tx(async (client) => {
      await enqueueMail(client, { kind: request.params.kind, campaignId: null, personId: null, to: caller.email as string, subject: `[TEST] ${subject}`, body, dedupeKey })
      await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: { tid: caller.tid, oid: caller.oid, name: caller.displayName }, action: 'mail.test-sent', metadata: { kind: request.params.kind } })
    })
    wakeSender?.()
    return reply.code(202).send({ queued: true })
  })

  app.get('/api/admin/mail/status', { ...organizer, schema: { response: { '4xx': ErrorResponse } } }, async () => {
    return { mailEnabled: config.mail !== null, queued: await countQueued(db) }
  })
}
