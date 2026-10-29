// Sends what the outbox holds: one session per mail, the server's reply
// recorded, a transient failure retried after a growing pause, a permanent
// one or the last attempt failed. A stop waits for the session in flight
// and opens no new one; a mail left in `sending` by a process that died is
// failed at the next start, since the server may or may not have taken
// it. The shape follows an internal mail service by the same author.

import { randomUUID } from 'node:crypto'
import type { FastifyBaseLogger } from 'fastify'
import type { MailConfig } from '../../config.ts'
import type { Database } from '../db.ts'
import { runJob } from '../jobs.ts'
import { domainOf, parseMailbox } from './mailbox.ts'
import { claimNextMail, recordFailed, recordRetry, recordSent, recoverInterruptedMails, type OutboxMail } from './outbox.ts'
import type { MailTransport } from './transport.ts'

export interface SenderOptions {
  db: Database
  transport: MailTransport
  config: MailConfig
  log: FastifyBaseLogger
  /** How often the queue is looked at when nothing woke the sender. */
  pollMs?: number
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
  private readonly retryDelayMs: number
  private readonly maxAttempts: number
  private timer: NodeJS.Timeout | null = null
  private running: Promise<void> | null = null
  private stopping = false
  private stopped: Promise<void> | null = null

  constructor(options: SenderOptions) {
    this.db = options.db
    this.transport = options.transport
    this.config = options.config
    this.log = options.log
    this.pollMs = options.pollMs ?? 5_000
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

  /** Sends until the queue holds nothing due, as a job while a session is open (the update gate waits for a job); returns how many were accepted. */
  async runOnce(): Promise<number> {
    if (this.stopping) return 0
    const first = await claimNextMail(this.db)
    if (!first) return 0
    return runJob(this.db, 'outbox_flush', null, async () => {
      let sent = await this.deliver(first) ? 1 : 0
      for (;;) {
        if (this.stopping) return sent
        const mail = await claimNextMail(this.db)
        if (!mail) return sent
        if (await this.deliver(mail)) sent += 1
      }
    })
  }

  /** Stops taking new work and waits for the session in flight; a second call waits for the first. */
  stop(): Promise<void> {
    this.stopped ??= (async () => {
      this.stopping = true
      if (this.timer !== null) clearInterval(this.timer)
      await this.running
      this.transport.close()
    })()
    return this.stopped
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
