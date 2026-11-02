import type { DiscardBody, MailKind, MailQueueQuery, MailQueueResponse, QueueMail } from '@school-allocation/api-contracts/mail'
import type { Actor, Caller } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import { lockedCampaign } from '../lib/dao/campaigns.ts'
import { readMailPaused, updateMailPaused } from '../lib/dao/settings.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { copyMailForRetry, countMails, discardMails as discardInOutbox, enqueueMail, listCampaignMails, listMails, queueStatus, spacingOf } from '../lib/mail/outbox.ts'
import { canonicalId, requireCampaign } from './campaigns.ts'
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

/** The queue as the page lists it: the mails matching the filter, newest first up to the limit, and how many match in all. */
export async function listMailQueue(db: Database, query: MailQueueQuery): Promise<MailQueueResponse> {
  const filter = { ...(query.state === undefined ? {} : { state: query.state }), ...(query.kind === undefined ? {} : { kind: query.kind }), ...(query.campaignId === undefined ? {} : { campaignId: canonicalId(query.campaignId) }) }
  const mails = await listMails(db, filter, Number(query.limit ?? '200'))
  const total = await countMails(db, filter)
  return { mails, total }
}

/**
 * Takes waiting mails out of the queue: an opening nobody meant, a text
 * with a mistake. Audited in the registration's chain when the mails are
 * one registration's (named as such, or every mail picked by id being
 * its), else the school's, with the counts by kind and the mails in a
 * session given their expiry; a selection that changes nothing records
 * nothing.
 */
export async function discardMails(db: Database, selection: DiscardBody, actor: Actor): Promise<{ discarded: number }> {
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    let campaignId: string | null = null
    let picked: Parameters<typeof discardInOutbox>[1]
    if ('ids' in selection) {
      const ids = selection.ids.map(canonicalId)
      const campaigns = new Set((await listMails(client, { ids }, ids.length)).map((mail) => mail.campaignId))
      const [only] = campaigns
      if (campaigns.size === 1 && only !== null && only !== undefined) campaignId = only
      picked = { ids }
    } else {
      const campaign = await requireCampaign(client, canonicalId(selection.campaignId))
      campaignId = campaign.id
      picked = { campaignId: campaign.id, ...(selection.kinds === undefined ? {} : { kinds: selection.kinds }) }
    }
    if (campaignId !== null) await lockScope(client, campaignId)
    const { discarded, inFlight, byKind } = await discardInOutbox(client, picked)
    if (discarded + inFlight === 0) return { discarded }
    await appendAudit(client, {
      scopeId: campaignId ?? SCHOOL_SCOPE, actor: { tid: actor.tid, oid: actor.oid, name: actor.name }, action: 'mail.discarded',
      metadata: { discarded, inFlight, byKind, ...(campaignId === null ? {} : { campaignId }) },
    })
    return { discarded }
  })
}

/** The states of a registration in which a mail of a window still has its meaning; a kind not listed keeps it in every state. */
const WINDOW_OF_KIND: Readonly<Partial<Record<string, readonly string[]>>> = {
  choice_invitation: ['open'],
  choice_reminder: ['open'],
  grace_invitation: ['grace'],
  grace_reminder: ['grace'],
}

/**
 * Queues a failed or discarded mail again, as a copy: the server was down,
 * the address wrong and corrected since, a discard one too many. The copy
 * takes its turn like a new mail; a mail of a window is sent again only
 * while the registration is in that window, judged under the
 * registration's lock (taken before the copy for every registration's
 * mail, as the insert touches the registration's row) so a close in
 * flight is seen (409 campaign_state); at the window's end the copy expires
 * like every queued reminder. One copy per original: a second retry of the
 * same mail is refused (409 mail_state), the copy is what fails or is
 * retried next. Audited with both ids. The caller wakes the sender afterwards.
 */
export async function retryMail(db: Database, rawId: string, actor: Actor): Promise<{ mail: QueueMail }> {
  const id = canonicalId(rawId)
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const [original] = await listMails(client, { id }, 1)
    if (original === undefined) throw new ApplicationError('not_found')
    if (original.state !== 'failed' && !(original.state === 'expired' && original.detail === 'discarded')) throw new ApplicationError('mail_state')
    const window = WINDOW_OF_KIND[original.kind]
    if (original.campaignId !== null) {
      await lockScope(client, original.campaignId)
      if (window !== undefined) {
        const campaign = await lockedCampaign(client, original.campaignId)
        if (!campaign || !window.includes(campaign.state)) throw new ApplicationError('campaign_state')
      }
    }
    // One copy per original: a second click, or two at once, finds the key taken and is refused; the copy itself can be sent again once it failed.
    const copyId = await copyMailForRetry(client, id, `retry:${id}`)
    if (copyId === undefined) throw new ApplicationError('mail_state')
    const [mail] = await listMails(client, { id: copyId }, 1)
    if (mail === undefined) throw new ApplicationError('not_found')
    await appendAudit(client, { scopeId: original.campaignId ?? SCHOOL_SCOPE, actor: { tid: actor.tid, oid: actor.oid, name: actor.name }, action: 'mail.retried', metadata: { id, retryId: copyId, kind: original.kind } })
    return { mail }
  })
}

/** Delivery history excludes message subjects and bodies for every caller. */
export async function campaignMailHistory(db: Database, id: string) {
  const campaign = await requireCampaign(db, id)
  const mails = (await listCampaignMails(db, campaign.id)).map(({ body: _body, subject: _subject, ...delivery }) => delivery)
  return { mails }
}
