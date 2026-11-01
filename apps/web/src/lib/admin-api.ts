// The administration's API, typed as the server answers it
// (apps/api/routes/admin-roster.ts, admin-users.ts, categories.ts).

import type { MailKind, Role } from '@school-allocation/api-contracts'
import { endpointPath } from '@school-allocation/api-contracts/client-endpoint'
import * as endpoints from '@school-allocation/api-contracts/endpoint-metadata'
import type { Locale } from '@school-allocation/messages'
import type { Period } from '@school-allocation/school-core'
export type { Period } from '@school-allocation/school-core'

import type { RosterGroup } from '@school-allocation/api-contracts'
import { apiRequest } from './api.ts'

export type { Account, Batch, BatchDetail, BatchState, ClassTeacher, ClassWithTeachers, Grant, GraphGroup, MailTemplate, RosterGroup, RosterOverview, RosterPerson, StoredEntry, TemplateInvalidBody, RetentionYear, MailStatusResponse } from '@school-allocation/api-contracts'
export const loadRoster = () => apiRequest(endpoints.getAdminRoster, { })
export const saveGroups = (groups: RosterGroup[]) => apiRequest(endpoints.putAdminRosterGroups, { body: { groups } })
export const uploadCsv = (csv: string, schoolYear: string) => apiRequest(endpoints.postAdminRosterCsv, { body: { csv, schoolYear } })
export const loadBatch = (id: string) => apiRequest(endpoints.getAdminRosterBatchesById, { params: { id: id } })
export const commitBatch = (id: string) => apiRequest(endpoints.postAdminRosterBatchesByIdCommit, { params: { id: id } })
export const discardBatch = (id: string) => apiRequest(endpoints.postAdminRosterBatchesByIdDiscard, { params: { id: id } })
export const searchPersons = (q: string) => apiRequest(endpoints.getAdminRosterPersons, { query: { q } })
/** Where a refresh from Entra groups starts: a navigation, as the authorization goes through Microsoft's pages. */
export const graphStartPath = (schoolYear: string) => endpointPath(endpoints.getAdminRosterGraphStart, { query: { schoolYear } })
export const csvTemplatePath = endpointPath(endpoints.getAdminRosterCsvTemplate, {})
export const searchGraphGroups = (q: string) => apiRequest(endpoints.getAdminRosterGraphGroups, { query: { q } })
/** Every group of the tenant whose name is a class, "5A": the whole school in one search. */
export const searchClassGroups = () => apiRequest(endpoints.getAdminRosterGraphGroups, { query: { classes: 'true' } })
/** Where the picker's authorization starts: a navigation through Microsoft's pages, back to the roster page with the search open. */
export const graphPickerStartPath = endpointPath(endpoints.getAdminRosterGraphStart, { query: { purpose: 'picker' } })
export const loadPeriods = () => apiRequest(endpoints.getSettingsPeriods, { })
export const savePeriods = (periods: Period[]) => apiRequest(endpoints.putAdminSettingsPeriods, { body: { periods } })
export const loadLanguage = () => apiRequest(endpoints.getSettingsLanguage, { })
export const saveLanguage = (locale: Locale) => apiRequest(endpoints.putAdminSettingsLanguage, { body: { locale } })
export const loadClasses = () => apiRequest(endpoints.getAdminClasses, { })
export const searchClassTeachers = (q: string) => apiRequest(endpoints.getAdminClassesTeachers, { query: { q } })
export const saveClassTeachers = (className: string, teachers: string[]) => apiRequest(endpoints.putAdminClassesByClassNameTeachers, { params: { className: className }, body: { teachers } })
export const previewTeacherList = (csv: string) => apiRequest(endpoints.postAdminClassesImportPreview, { body: { csv } })
export const applyTeacherList = (csv: string) => apiRequest(endpoints.postAdminClassesImport, { body: { csv } })
export const teacherListTemplatePath = endpointPath(endpoints.getAdminClassesImportTemplate, {})
export const loadMailTemplates = () => apiRequest(endpoints.getAdminMailTemplates, { })
export const saveMailTemplate = (kind: MailKind, subject: string, body: string) => apiRequest(endpoints.putAdminMailTemplatesByKind, { params: { kind: kind }, body: { subject, body } })
export const resetMailTemplate = (kind: MailKind) => apiRequest(endpoints.deleteAdminMailTemplatesByKind, { params: { kind: kind } })
export const sendTestMail = (kind: MailKind) => apiRequest(endpoints.postAdminMailTemplatesByKindTest, { params: { kind: kind } })
export const loadMailStatus = () => apiRequest(endpoints.getAdminMailStatus, { })
export const setMailPaused = (paused: boolean) => apiRequest(endpoints.putAdminMailPaused, { body: { paused } })

export const loadAccounts = (q: string, unboundOnly: boolean) => apiRequest(endpoints.getAdminUsers, { query: { q, ...(unboundOnly ? { unbound: 'true' as const } : {}) } })
export const blockAccount = (id: string, reason: string) => apiRequest(endpoints.postAdminUsersByIdBlock, { params: { id: id }, body: { reason } })
export const unblockAccount = (id: string, reason: string) => apiRequest(endpoints.postAdminUsersByIdUnblock, { params: { id: id }, body: { reason } })
export const bindAccount = (userId: string, personId: string, reason: string) => apiRequest(endpoints.postAdminBindings, { body: { userId, personId, reason } })
export const loadGrants = () => apiRequest(endpoints.getAdminRoles, { })
export const grantRole = (userId: string, role: Role, reason: string) => apiRequest(endpoints.postAdminRoles, { body: { userId, role, reason } })
export const revokeGrant = (id: string, reason: string) => apiRequest(endpoints.postAdminRolesByIdRevoke, { params: { id: id }, body: { reason } })
export type { Category, CategoryUsage } from '@school-allocation/api-contracts'
export const loadCategoryUsage = () => apiRequest(endpoints.getAdminCategories, { })
export const createCategory = (name: string) => apiRequest(endpoints.postAdminCategories, { body: { name } })
export const renameCategory = (id: string, name: string) => apiRequest(endpoints.patchAdminCategoriesById, { params: { id }, body: { name } })
export const removeCategory = (id: string) => apiRequest(endpoints.deleteAdminCategoriesById, { params: { id } })
export const loadRetention = () => apiRequest(endpoints.getAdminRetention, { })
export const purgeSchoolYear = (schoolYear: string, reason: string) => apiRequest(endpoints.postAdminPurge, { body: { schoolYear, reason } })
