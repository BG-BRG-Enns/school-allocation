// What the pages know about the API's answers, free of the DOM so that
// node:test can check it: how a refusal is represented, and where a
// signed-out person is sent.

import { getAuthLogin } from '@school-allocation/api-contracts/endpoint-metadata'
import { endpointPath } from '@school-allocation/api-contracts/client-endpoint'
import { t } from './i18n.ts'

/** A refused request: the API's error code, for a validation error its message, and the whole body for a refusal that says more. */
export class ApiError extends Error {
  override name = 'ApiError'
  readonly status: number
  readonly code: string
  readonly body: Record<string, unknown>

  constructor(status: number, code: string, message?: string, body: Record<string, unknown> = {}) {
    super(message ?? code)
    this.status = status
    this.code = code
    this.body = body
  }
}

/** The API's error body, as every refusal carries it. */
export function problemOf(status: number, payload: unknown): ApiError {
  const body = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
  const code = typeof body.error === 'string' && body.error !== '' ? body.error : 'request_failed'
  const message = typeof body.message === 'string' ? body.message : undefined
  return new ApiError(status, code, message, body)
}

/** A path of this app, or the start page for anything else. */
export function ownPath(returnTo: string): string {
  return returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
}

/** The sign-in page, which comes back to `returnTo` once signed in. */
export function signInUrl(returnTo: string): string {
  return `/anmelden?returnTo=${encodeURIComponent(ownPath(returnTo))}`
}

/** Where the sign-in page sends the browser: Entra, and back to `returnTo`. */
export function loginUrl(returnTo: string): string {
  return endpointPath(getAuthLogin, { query: { returnTo: ownPath(returnTo) } })
}

/** What a person is told when the API refuses, by its code (the catalogue's `errors`); the validation message names a field, never a value. */
export const ERROR_MESSAGES: Readonly<Record<string, string>> = t.errors

/** Refusals whose answer names what is wrong (the grades, say): the sentence carries it. */
const DETAILED = new Set(['daily_minimum_missing'])

/**
 * Whether a failed request may succeed when sent again unchanged: no answer
 * at all (the connection), or a server or proxy error. A refusal (4xx)
 * stays one.
 */
export function isTransient(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500
}

/** The sentence for a refusal: its code's, or the general one. */
export function errorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'request_failed'
  const sentence = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.request_failed ?? ''
  const detail = error instanceof ApiError && DETAILED.has(code) && typeof error.body.message === 'string' ? error.body.message : ''
  return detail === '' ? sentence : `${sentence} ${detail}`
}
