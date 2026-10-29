// Shared HTTP shapes. Types are derived from the schemas used by Fastify.

import { Type,type Static } from 'typebox'
import { Reason,ROLES,StrictObject,Uuid } from './common.ts'

export const AccountSchema = StrictObject({
  id: Type.String(),
  displayName: Type.String(),
  email: Type.Union([Type.String(), Type.Null()]),
  firstSignInAt: Type.String(),
  lastSignInAt: Type.String(),
  blocked: Type.Boolean(),
  roles: Type.Array(Type.String()),
  person: Type.Union([StrictObject({
    id: Type.String(),
    displayName: Type.Union([Type.String(), Type.Null()]),
    kind: Type.Union([Type.String(), Type.Null()]),
    className: Type.Union([Type.String(), Type.Null()]),
    grade: Type.Union([Type.Number(), Type.Null()]),
  }), Type.Null()]),
})
export type Account = Static<typeof AccountSchema>

export const GrantSchema = StrictObject({
  id: Type.String(),
  userId: Type.String(),
  displayName: Type.String(),
  role: Type.String(),
  grantedAt: Type.String(),
  grantedBy: Type.String(),
  reason: Type.String(),
})
export type Grant = Static<typeof GrantSchema>

export const AccountsResponse = StrictObject({ users: Type.Array(AccountSchema) })
export type AccountsResponse = Static<typeof AccountsResponse>

export const GrantsResponse = StrictObject({ grants: Type.Array(GrantSchema) })
export type GrantsResponse = Static<typeof GrantsResponse>

export const AuditEventSchema = StrictObject({ seq: Type.Number(), scopeId: Type.String(), at: Type.String(), actor: StrictObject({ tid: Type.String(), oid: Type.String(), name: Type.String() }), action: Type.String(), metadata: Type.Record(Type.String(), Type.Unknown()), prevHash: Type.Union([Type.String(), Type.Null()]), hash: Type.String() })
export const AuditResponse = StrictObject({ events: Type.Array(AuditEventSchema) })
export type AuditResponse = Static<typeof AuditResponse>

export const UsersQuery = StrictObject({
  q: Type.Optional(Type.String({ maxLength: 100 })),
  unbound: Type.Optional(Type.Union([Type.Literal('true'), Type.Literal('false')])),
})

export const BindingBody = StrictObject({ userId: Uuid, personId: Uuid, reason: Reason })

export const GrantBody = StrictObject({ userId: Uuid, role: Type.Union([Type.Literal(ROLES[0]), Type.Literal(ROLES[1]), Type.Literal(ROLES[2])]), reason: Reason })
