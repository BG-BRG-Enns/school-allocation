import type { PersonKind } from '@school-allocation/school-core'

export interface RosterGroup {
  /** The Entra group's object id. */
  groupId: string
  /** What the administrator calls it, for the list. */
  label: string
  kind: PersonKind
  /** Student groups only. */
  className?: string
  grade?: number
}
