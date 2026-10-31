import { type MailKind } from '@school-allocation/api-contracts/mail'
import type { Actor, Caller } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import { readMailPaused, updateMailPaused } from '../lib/dao/settings.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { enqueueMail, listCampaignMails, queueStatus, spacingOf } from '../lib/mail/outbox.ts'
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
  const dedupeKey = `test:${kind}:${caller.id}:${db.now().getTime()}`
  const to = caller.email
  await db.tx(async (client) => {
    const { subject, body } = await sampleMail(client, kind)
    // Someone waits for it: first in line, before any bulk.
    await enqueueMail(client, { kind, campaignId: null, personId: null, to, subject: `[TEST] ${subject}`, body, dedupeKey, priority: 1 })
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: { tid: caller.tid, oid: caller.oid, name: caller.displayName }, action: 'mail.test-sent', metadata: { kind } })
  })
}

/**
 * What the outbox holds: the mails waiting by priority and one in a
 * session, whether sending is paused, the pace (`perHour`, null while mail
 * is off), and when the last waiting mail goes out at that pace, or when
 * the latest retry is due if that is later, if nothing changes; none while
 * mail is off or paused.
 */
export async function mailStatus(db: Database, perHour: number | null) {
  const status = await queueStatus(db)
  const waiting = status.waiting[1] + status.waiting[2] + status.waiting[3]
  let expectedEndAt: string | null = null
  if (perHour !== null && !status.paused && waiting > 0) {
    const spacing = spacingOf(perHour)
    const first = Math.max(db.now().getTime(), (status.lastClaimAt?.getTime() ?? 0) + spacing)
    expectedEndAt = new Date(Math.max(first + (waiting - 1) * spacing, status.lastDueAt?.getTime() ?? 0)).toISOString()
  }
  return {
    mailEnabled: perHour !== null,
    paused: status.paused,
    perHour,
    waiting: { personal: status.waiting[1], staff: status.waiting[2], students: status.waiting[3] },
    sending: status.sending,
    expectedEndAt,
  }
}

/**
 * Pauses or resumes sending, audited in the school's chain; queued mails
 * stay queued, and a session in flight finishes. Asking for the state it
 * has changes nothing and records nothing. The caller wakes the sender
 * after a resume.
 */
export async function setMailPaused(db: Database, paused: boolean, actor: Actor): Promise<void> {
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    if (await readMailPaused(client) === paused) return
    await updateMailPaused(client, paused, actor)
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: { tid: actor.tid, oid: actor.oid, name: actor.name }, action: paused ? 'mail.paused' : 'mail.resumed', metadata: {} })
  })
}

/** Delivery history excludes message subjects and bodies for every caller. */
export async function campaignMailHistory(db: Database, id: string) {
  const campaign = await requireCampaign(db, id)
  const mails = (await listCampaignMails(db, campaign.id)).map(({ body: _body, subject: _subject, ...delivery }) => delivery)
  return { mails }
}
