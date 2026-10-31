// Sends what the outbox holds: one session per mail, the server's reply
// recorded, a transient failure retried after a growing pause, a permanent
// one or the last attempt failed. One mail at a time, at most
// MAIL_PER_HOUR an hour, evenly spaced from the last claim the database
// holds (lib/mail/outbox.ts claimNextMail): never a burst, not after a
// restart either, and the people a bulk invites do not all click at once.
// A stop waits for the session in flight and opens no new one; a mail left
// in `sending` by a process that died is failed at the next start, since
// the server may or may not have taken it. The shape follows an internal
// mail service by the same author.

import { randomUUID } from 'node:crypto'
import type { FastifyBaseLogger } from 'fastify'
import type { MailConfig } from '../../config.ts'
import type { Database } from '../db.ts'
import { runJob } from '../jobs.ts'
import { domainOf, parseMailbox } from './mailbox.ts'
import { claimNextMail, recordFailed, recordRetry, recordSent, recoverInterruptedMails, spacingOf, type OutboxMail } from './outbox.ts'
import type { MailTransport } from './transport.ts'

export interface SenderOptions {
  db: Database
  transport: MailTransport
  config: MailConfig
  log: FastifyBaseLogger
  /** How often the queue is looked at when nothing woke the sender. */
  pollMs?: number
  /** The least time between two claims; 3600 s / MAIL_PER_HOUR unless given. */
  spacingMs?: number
  /** The pause before the first retry; doubled for each further one. */
  retryDelayMs?: number
  maxAttempts?: number
}

export class Sender {
  private readonly db: Database
  private readonly transport: MailTransport
  private readonly config: MailConfig
  private readonly log: FastifyBaseLogger
  private readonly pollMs: number
  private readonly spacingMs: number
  private readonly retryDelayMs: number
  private readonly maxAttempts: number
  private timer: NodeJS.Timeout | null = null
  /** The wake for the next mail's turn. */
  private next: NodeJS.Timeout | null = null
  private running: Promise<void> | null = null
  private stopping = false
  private stopped: Promise<void> | null = null

  constructor(options: SenderOptions) {
    this.db = options.db
    this.transport = options.transport
    this.config = options.config
    this.log = options.log
    this.pollMs = options.pollMs ?? 5_000
    this.spacingMs = options.spacingMs ?? spacingOf(options.config.perHour)
    this.retryDelayMs = options.retryDelayMs ?? 15_000
    this.maxAttempts = options.maxAttempts ?? 3
  }

  /** Fails what the previous process left in flight, then works the queue at every poll and whenever woken. */
  async start(): Promise<void> {
    const interrupted = await recoverInterruptedMails(this.db)
    if (interrupted > 0) this.log.warn({ interrupted }, 'mails left in sending by the previous process are failed')
    this.timer = setInterval(() => this.wake(), this.pollMs)
    this.timer.unref()
    this.wake()
  }

  /** Called after a mail was queued, so it goes out without waiting for the next poll. */
  wake(): void {
    if (this.stopping || this.running !== null) return
    this.running = this.runOnce().then(() => undefined, (err: unknown) => {
      this.log.error({ err }, 'the sender failed')
    }).finally(() => {
      this.running = null
    })
  }

  /**
   * Sends the mail whose turn it is, if any, as a job while its session is
   * open (the update gate waits for a job, not for the queue); returns 1
   * when the server accepted it. Once started, it wakes itself for the
   * next turn.
   */
  async runOnce(): Promise<number> {
    if (this.stopping) return 0
    const claim = await claimNextMail(this.db, this.spacingMs)
    if (claim.mail === undefined) {
      this.wakeIn(claim.retryInMs)
      return 0
    }
    const { mail } = claim
    const sent = await runJob(this.db, 'outbox_flush', null, () => this.deliver(mail))
    this.wakeIn(this.spacingMs)
    return sent ? 1 : 0
  }

  /** Stops taking new work and waits for the session in flight; a second call waits for the first. */
  stop(): Promise<void> {
    this.stopped ??= (async () => {
      this.stopping = true
      if (this.timer !== null) clearInterval(this.timer)
      if (this.next !== null) clearTimeout(this.next)
      await this.running
      this.transport.close()
    })()
    return this.stopped
  }

  /** The next look at the queue, `ms` from now, beside the poll; only once started, and not for `null` (until woken). */
  private wakeIn(ms: number | null): void {
    if (ms === null || this.timer === null || this.stopping) return
    if (this.next !== null) clearTimeout(this.next)
    this.next = setTimeout(() => this.wake(), ms)
    this.next.unref()
  }

  private async deliver(mail: OutboxMail): Promise<boolean> {
    const from = parseMailbox(this.config.from)
    const to = parseMailbox(mail.to)
    if (!from || !to) {
      await recordFailed(this.db, mail.id, 'not a mailbox')
      return false
    }
    const messageId = `<${randomUUID()}@${domainOf(from)}>`
    const result = await this.transport.send({
      from: this.config.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.body,
      messageId,
      ...(this.config.replyTo === null ? {} : { replyTo: this.config.replyTo }),
      envelope: { from: this.config.envelopeFrom ?? from.address, to: [to.address] },
    })
    if (result.ok) {
      await recordSent(this.db, mail.id, messageId, result.response)
      this.log.info({ mailId: mail.id, kind: mail.kind, attempts: mail.attempts }, 'mail sent')
      return true
    }
    if (result.permanent || mail.attempts >= this.maxAttempts) {
      await recordFailed(this.db, mail.id, result.detail)
      this.log.warn({ mailId: mail.id, kind: mail.kind, attempts: mail.attempts, permanent: result.permanent }, 'mail failed')
      return false
    }
    await recordRetry(this.db, mail.id, result.detail, this.retryDelayMs * 2 ** (mail.attempts - 1))
    this.log.info({ mailId: mail.id, kind: mail.kind, attempts: mail.attempts }, 'mail submission failed, retrying')
    return false
  }
}
