// SMTP submission through nodemailer (D-18): one connection per message,
// authenticated, over STARTTLS or implicit TLS as configured, with
// timeouts, and file and URL access inside messages disabled. A 5xx reply
// is permanent; a connection failure or a 4xx reply may succeed later.
// Ported from an internal mail service by the same author.

import { createTransport, type SendMailOptions } from 'nodemailer'
import type { MailConfig } from '../../config.ts'

export type SubmitResult
  = | { ok: true, response: string }
    | { ok: false, permanent: boolean, detail: string }

export interface MailTransport {
  send: (message: SendMailOptions) => Promise<SubmitResult>
  close: () => void
}

interface SmtpError {
  message?: string
  code?: string
  response?: string
  responseCode?: number
}

export const DETAIL_MAX = 2000

/** What the outbox keeps of a reply or an error: at most DETAIL_MAX characters. */
export function truncateDetail(value: string): string {
  return value.length > DETAIL_MAX ? value.slice(0, DETAIL_MAX) : value
}

/** 5xx replies are permanent; connection failures and 4xx replies may succeed later. */
export function classifyError(err: unknown): { permanent: boolean, detail: string } {
  const smtp = (typeof err === 'object' && err !== null ? err : {}) as SmtpError
  const detail = smtp.response ?? smtp.message ?? String(err)
  const permanent = typeof smtp.responseCode === 'number' && smtp.responseCode >= 500
  return { permanent, detail: truncateDetail(detail) }
}

const TIMEOUTS = { connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 120_000 }

export function createMailTransport(config: MailConfig): MailTransport {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTls,
    auth: { user: config.user, pass: config.password },
    disableFileAccess: true,
    disableUrlAccess: true,
    ...TIMEOUTS,
  })
  return {
    send: async (message) => {
      try {
        const info = await transport.sendMail(message)
        return { ok: true, response: truncateDetail(String(info.response ?? '')) }
      } catch (err) {
        return { ok: false, ...classifyError(err) }
      }
    },
    close: () => transport.close(),
  }
}
