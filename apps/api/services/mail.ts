import type { Caller } from '../lib/actor.ts'
import { appendAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { enqueueMail } from '../lib/mail/outbox.ts'
import { readTemplate, renderTemplate, SAMPLE_DATA, type MailKind } from './mail-templates.ts'

/** The test mail and its audit event commit together. The caller wakes the sender afterwards. */
export async function queueTestMail(db: Database, kind: MailKind, caller: Caller, enabled: boolean): Promise<void> {
  if (!enabled) throw new ApplicationError('mail_off')
  if (caller.email === null) throw new ApplicationError('no_address')
  const template = await readTemplate(db, kind)
  const { subject, body } = renderTemplate(template, SAMPLE_DATA)
  const dedupeKey = `test:${kind}:${caller.id}:${Date.now()}`
  const to = caller.email
  await db.tx(async (client) => {
    await enqueueMail(client, { kind, campaignId: null, personId: null, to, subject: `[TEST] ${subject}`, body, dedupeKey })
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: { tid: caller.tid, oid: caller.oid, name: caller.displayName }, action: 'mail.test-sent', metadata: { kind } })
  })
}
