import type { PersonKind } from '@school-allocation/school-core'
import { type Role } from '../roles.ts'

/** An account as the administration lists it. */
export interface AccountRow {
  id: string
  displayName: string
  email: string | null
  firstSignInAt: string
  lastSignInAt: string
  blocked: boolean
  roles: Role[]
  /** The bound person as the roster in force has them; `kind` null when the person is not in it. */
  person: { id: string, displayName: string | null, kind: PersonKind | null, className: string | null, grade: number | null } | null
}

export interface AccountQueryRow {
  id: string
  display_name: string
  email: string | null
  first_sign_in_at: Date
  last_sign_in_at: Date
  blocked: boolean
  roles: string[]
  person_id: string | null
  person_name: string | null
  kind: PersonKind | null
  class_name: string | null
  grade: number | null
}

/** A school-wide grant as the administration lists it. */
export interface GrantRow {
  id: string
  userId: string
  displayName: string
  role: Role
  grantedAt: string
  grantedBy: string
  reason: string
}
