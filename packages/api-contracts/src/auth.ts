// Shared HTTP shapes. Types are derived from the schemas used by Fastify.

import { Type, type Static } from 'typebox'
import { Literals, PersonSummary, ROLES, StrictObject } from './common.ts'

export const MePersonSchema = StrictObject({
  id: Type.String(),
  kind: Type.Union([Type.Literal('student'), Type.Literal('teacher'), Type.Null()]),
  className: Type.Union([Type.String(), Type.Null()]),
  grade: Type.Union([Type.Number(), Type.Null()]),
})
export type MePerson = Static<typeof MePersonSchema>

export // Not strict: when single sign-on cannot complete silently, Entra sends the
// browser back here with sso_reload=true, and possibly parameters of its own.
// Only these are read.
const LoginQuery = Type.Object({
  returnTo: Type.Optional(Type.String({ maxLength: 2048 })),
  sso_reload: Type.Optional(Type.String({ maxLength: 64 })),
})

export // Not strict: Entra adds parameters of its own (session_state, iss, ...).
// Only these are read.
const CallbackQuery = Type.Object({
  code: Type.Optional(Type.String({ maxLength: 8192 })),
  state: Type.Optional(Type.String({ maxLength: 512 })),
  error: Type.Optional(Type.String({ maxLength: 512 })),
})

export const MeResponse = StrictObject({
  id: Type.String(),
  displayName: Type.String(),
  roles: Type.Array(Literals(ROLES)),
  /** The roster person this account is bound to; null until the roster knows the account. */
  person: Type.Union([PersonSummary, Type.Null()]),
})

export type Me = Static<typeof MeResponse>
