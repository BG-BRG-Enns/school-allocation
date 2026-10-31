import { type MailKind } from '@school-allocation/api-contracts/mail'
import type { Caller } from '../lib/actor.ts'
import { appendAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { countQueued, enqueueMail, listCampaignMails } from '../lib/mail/outbox.ts'
import { requireCampaign } from './campaigns.ts'
import { sampleMail } from './mail-templates.ts'

/**
 * The test mail and its audit event commit together, the text and its
 * sample values in the school's language as that transaction reads it.
 * The caller wakes the sender afterwards.
 */
export async function queueTestMail(db: Database, kind: MailKind, caller: Caller, enabled: boolean): Promise<void> {
  if (!enabled) throw new ApplicationError('mail_off')
  if (caller.email === null) throw new ApplicationError('no_address')
  const dedupeKey = `test:${kind}:${caller.id}:${Date.now()}`
  const to = caller.email
  await db.tx(async (client) => {
    const { subject, body } = await sampleMail(client, kind)
    await enqueueMail(client, { kind, campaignId: null, personId: null, to, subject: `[TEST] ${subject}`, body, dedupeKey })
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: { tid: caller.tid, oid: caller.oid, name: caller.displayName }, action: 'mail.test-sent', metadata: { kind } })
  })
}

export async function mailStatus(db: Database, enabled: boolean) {
  return { mailEnabled: enabled, queued: await countQueued(db) }
}

/** Delivery history excludes message subjects and bodies for every caller. */
export async function campaignMailHistory(db: Database, id: string) {
  const campaign = await requireCampaign(db, id)
  const mails = (await listCampaignMails(db, campaign.id)).map(({ body: _body, subject: _subject, ...delivery }) => delivery)
  return { mails }
}
