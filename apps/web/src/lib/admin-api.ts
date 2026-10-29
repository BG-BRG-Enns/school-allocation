import type { Period } from '@school-allocation/school-core'
export type { Period } from '@school-allocation/school-core'
// The administration's API, typed as the server answers it
// (apps/api/routes/admin-roster.ts, admin-users.ts).

import type { Account, BatchDetail, ClassWithTeachers, Grant, GraphGroup, MailTemplate, RosterGroup, RosterOverview, RosterPerson } from '@school-allocation/api-contracts'
import { apiGet, apiPost, apiPut } from './api.ts'

export type { Account, Batch, BatchDetail, BatchState, ClassTeacher, ClassWithTeachers, Grant, GraphGroup, MailTemplate, RosterGroup, RosterOverview, RosterPerson, StoredEntry, TemplateInvalidBody } from '@school-allocation/api-contracts'
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
export const searchGraphGroups = (q: string) => apiGet<{ groups: GraphGroup[] }>(`/api/admin/roster/graph/groups?q=${encodeURIComponent(q)}`)
/** Every group of the tenant whose name is a class, "5A": the whole school in one search. */
export const searchClassGroups = () => apiGet<{ groups: GraphGroup[] }>('/api/admin/roster/graph/groups?classes=true')
/** Where the picker's authorization starts: a navigation through Microsoft's pages, back to the roster page with the search open. */
export const graphPickerStartPath = '/api/admin/roster/graph/start?purpose=picker'
export const loadPeriods = () => apiGet<{ periods: Period[] }>('/api/settings/periods')
export const savePeriods = (periods: Period[]) => apiPut<{ periods: Period[] }>('/api/admin/settings/periods', { periods })
export const loadClasses = () => apiGet<{ classes: ClassWithTeachers[] }>('/api/admin/classes')
export const searchClassTeachers = (q: string) => apiGet<{ teachers: { personId: string, displayName: string }[] }>(`/api/admin/classes/teachers?q=${encodeURIComponent(q)}`)
export const saveClassTeachers = (className: string, teachers: string[]) => apiPut<{ classes: ClassWithTeachers[] }>(`/api/admin/classes/${encodeURIComponent(className)}/teachers`, { teachers })
export const loadMailTemplates = () => apiGet<{ templates: MailTemplate[], mailEnabled: boolean }>('/api/admin/mail-templates')
export const saveMailTemplate = (kind: string, subject: string, body: string) => apiPut<{ template: MailTemplate }>(`/api/admin/mail-templates/${encodeURIComponent(kind)}`, { subject, body })
export const sendTestMail = (kind: string) => apiPost<{ queued: boolean }>(`/api/admin/mail-templates/${encodeURIComponent(kind)}/test`)
export const loadMailStatus = () => apiGet<{ mailEnabled: boolean, queued: number }>('/api/admin/mail/status')

export const loadAccounts = (q: string, unboundOnly: boolean) => apiGet<{ users: Account[] }>(`/api/admin/users?q=${encodeURIComponent(q)}${unboundOnly ? '&unbound=true' : ''}`)
export const blockAccount = (id: string, reason: string) => apiPost<undefined>(`/api/admin/users/${encodeURIComponent(id)}/block`, { reason })
export const unblockAccount = (id: string, reason: string) => apiPost<undefined>(`/api/admin/users/${encodeURIComponent(id)}/unblock`, { reason })
export const bindAccount = (userId: string, personId: string, reason: string) => apiPost<undefined>('/api/admin/bindings', { userId, personId, reason })
export const loadGrants = () => apiGet<{ grants: Grant[] }>('/api/admin/roles')
export const grantRole = (userId: string, role: string, reason: string) => apiPost<Grant>('/api/admin/roles', { userId, role, reason })
export const revokeGrant = (id: string, reason: string) => apiPost<undefined>(`/api/admin/roles/${encodeURIComponent(id)}/revoke`, { reason })
