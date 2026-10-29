import { PERSON_KINDS } from '@school-allocation/school-core'
import { Type, type TProperties } from 'typebox'

/**
 * An object schema that rejects unknown properties. Every request and
 * response schema uses it: request bodies are refused rather than silently
 * trimmed, and a response cannot carry a field nobody declared.
 */
export function StrictObject<P extends TProperties>(properties: P) {
  return Type.Object(properties, { additionalProperties: false })
}

export const ErrorResponse = StrictObject({
  error: Type.String(),
  message: Type.Optional(Type.String()),
})

export const HealthResponse = StrictObject({
  status: Type.Union([Type.Literal('ok'), Type.Literal('degraded')]),
  db: Type.Union([Type.Literal('up'), Type.Literal('down')]),
  /** Whether a job is executing (an allocation run, a roster import, an outbox flush): an update or a restart would interrupt it. False when the database cannot be asked. */
  busy: Type.Boolean(),
  /** The running release and commit, so an operator can confirm what a deploy started. */
  version: Type.String(),
  gitSha: Type.String(),
  /** The domain rules this server computes with (school-core CORE_VERSION). */
  coreVersion: Type.Integer(),
})

// Patterns run with the u flag: \p{Cc} are control characters, \p{Cs} lone
// surrogates, which PostgreSQL text and the audit log cannot hold as sent.
const PLAIN = String.raw`[^\p{Cc}\p{Cs}]`

/** One line of text, not blank: a title or a name. No line or paragraph separator (\p{Zl}, \p{Zp}) either. */
export function SingleLineText(maxLength: number) {
  return Type.String({ minLength: 1, maxLength, pattern: String.raw`^(?=.*\S)[^\p{Cc}\p{Cs}\p{Zl}\p{Zp}]+$` })
}

/** Text over several lines: no control characters but tab and line breaks; `minLength` where it must not be empty. */
export function MultiLineText(maxLength: number, minLength = 0) {
  return Type.String({ minLength, maxLength, pattern: String.raw`^(?:${PLAIN}|[\t\n\r])*$` })
}

/** An e-mail address as a school account has it: local@domain.tld, nothing to trim. */
export const EmailAddress = Type.String({
  minLength: 5,
  maxLength: 254,
  pattern: String.raw`^[^\s@\p{Cc}\p{Cs}]+@[^\s@\p{Cc}\p{Cs}]+\.[^\s@\p{Cc}\p{Cs}]+$`,
})

/** One of a fixed list of strings. */
export function Literals<T extends string>(values: readonly T[]) {
  return Type.Enum([...values])
}

/** A lowercase or uppercase UUID, as PostgreSQL accepts it. */
export const Uuid = Type.String({ pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' })

/** Why a change was made, as the audit log records it. */
export const Reason = SingleLineText(500)

// Keep the existing anyOf representation; domain-checks pins this tuple to PersonKind.
export const PersonKindSchema = Type.Union([Type.Literal(PERSON_KINDS[0]), Type.Literal(PERSON_KINDS[1])])

/** The roster person behind an account, as the roster in force has them; `kind` null when it does not list them. */
export const PersonSummary = StrictObject({
  id: Type.String(),
  kind: Type.Union([PersonKindSchema, Type.Null()]),
  className: Type.Union([Type.String(), Type.Null()]),
  grade: Type.Union([Type.Integer(), Type.Null()]),
})

export const IdParams = StrictObject({ id: Uuid })

export const ROLES = ['school_admin', 'campaign_organizer', 'read_only_auditor'] as const

export type Role = typeof ROLES[number]
