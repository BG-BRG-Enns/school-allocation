import type { PersonKind } from '@school-allocation/school-core'

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
