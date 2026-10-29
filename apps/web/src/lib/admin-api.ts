// The administration's API, typed as the server answers it
// (apps/api/routes/admin-roster.ts, admin-users.ts).

import type { RosterDiff, RosterDiffSummary, RosterEntry, RosterProblem } from '@school-allocation/school-core'
import { apiGet, apiPost, apiPut } from './api.ts'

export type BatchState = 'pending' | 'committed' | 'discarded' | 'rejected'

export interface Batch {
  id: string
  source: 'graph:groups' | 'csv'
  state: BatchState
  schoolYear: string
  fetchedAt: string
  rowCount: number
  triggeredBy: string
  previousBatchId: string | null
  summary: RosterDiffSummary
  problems: RosterProblem[]
  warnings: { code: string, key: string }[]
  decidedAt: string | null
}

export interface StoredEntry extends RosterEntry {
  id: string
  personId: string | null
}

export interface BatchDetail extends Batch {
  diff: RosterDiff<StoredEntry>
}

export interface RosterGroup {
  groupId: string
  label: string
  kind: 'student' | 'teacher'
  className?: string
  grade?: number
}

export interface RosterOverview {
  current: Batch | null
  groups: RosterGroup[]
  batches: Batch[]
  suggestedSchoolYear: string
  graphScopes: string[]
}

export interface RosterPerson {
  personId: string
  displayName: string
  kind: 'student' | 'teacher'
  className: string | null
  grade: number | null
  mail: string | null
  account: string | null
}

export interface Account {
  id: string
  displayName: string
  email: string | null
  firstSignInAt: string
  lastSignInAt: string
  blocked: boolean
  roles: string[]
  person: { id: string, displayName: string | null, kind: string | null, className: string | null, grade: number | null } | null
}

export interface Grant {
  id: string
  userId: string
  displayName: string
  role: string
  grantedAt: string
  grantedBy: string
  reason: string
}

export const loadRoster = () => apiGet<RosterOverview>('/api/admin/roster')
export const saveGroups = (groups: RosterGroup[]) => apiPut<{ groups: RosterGroup[] }>('/api/admin/roster/groups', { groups })
export const uploadCsv = (csv: string, schoolYear: string) => apiPost<BatchDetail>('/api/admin/roster/csv', { csv, schoolYear })
export const loadBatch = (id: string) => apiGet<BatchDetail>(`/api/admin/roster/batches/${encodeURIComponent(id)}`)
export const commitBatch = (id: string) => apiPost<BatchDetail>(`/api/admin/roster/batches/${encodeURIComponent(id)}/commit`)
export const discardBatch = (id: string) => apiPost<BatchDetail>(`/api/admin/roster/batches/${encodeURIComponent(id)}/discard`)
export const searchPersons = (q: string) => apiGet<{ persons: RosterPerson[] }>(`/api/admin/roster/persons?q=${encodeURIComponent(q)}`)
/** Where a refresh from Entra groups starts: a navigation, as the authorization goes through Microsoft's pages. */
export const graphStartPath = (schoolYear: string) => `/api/admin/roster/graph/start?schoolYear=${encodeURIComponent(schoolYear)}`
export const csvTemplatePath = '/api/admin/roster/csv/template'

/** A group of the tenant as the picker lists it (Group.Read.All, D-23). */
export interface GraphGroup {
  id: string
  displayName: string
  description: string | null
}
export const searchGraphGroups = (q: string) => apiGet<{ groups: GraphGroup[] }>(`/api/admin/roster/graph/groups?q=${encodeURIComponent(q)}`)
/** Where the picker's authorization starts: a navigation through Microsoft's pages, back to the roster page with the search open. */
export const graphPickerStartPath = '/api/admin/roster/graph/start?purpose=picker'

export interface Period {
  period: number
  starts: string
  ends: string
}
export const loadPeriods = () => apiGet<{ periods: Period[] }>('/api/settings/periods')
export const savePeriods = (periods: Period[]) => apiPut<{ periods: Period[] }>('/api/admin/settings/periods', { periods })

export interface ClassTeacher {
  personId: string
  displayName: string
  /** `app` when assigned here, `roster` when the CSV roster names them by address. */
  source: 'app' | 'roster'
}
export interface ClassWithTeachers {
  className: string
  grade: number
  students: number
  teachers: ClassTeacher[]
}
export const loadClasses = () => apiGet<{ classes: ClassWithTeachers[] }>('/api/admin/classes')
export const saveClassTeachers = (className: string, teachers: string[]) => apiPut<{ classes: ClassWithTeachers[] }>(`/api/admin/classes/${encodeURIComponent(className)}/teachers`, { teachers })

export const loadAccounts = (q: string, unboundOnly: boolean) => apiGet<{ users: Account[] }>(`/api/admin/users?q=${encodeURIComponent(q)}${unboundOnly ? '&unbound=true' : ''}`)
export const blockAccount = (id: string, reason: string) => apiPost<undefined>(`/api/admin/users/${encodeURIComponent(id)}/block`, { reason })
export const unblockAccount = (id: string, reason: string) => apiPost<undefined>(`/api/admin/users/${encodeURIComponent(id)}/unblock`, { reason })
export const bindAccount = (userId: string, personId: string, reason: string) => apiPost<undefined>('/api/admin/bindings', { userId, personId, reason })
export const loadGrants = () => apiGet<{ grants: Grant[] }>('/api/admin/roles')
export const grantRole = (userId: string, role: string, reason: string) => apiPost<Grant>('/api/admin/roles', { userId, role, reason })
export const revokeGrant = (id: string, reason: string) => apiPost<undefined>(`/api/admin/roles/${encodeURIComponent(id)}/revoke`, { reason })
