// Browser-safe endpoint values. Server descriptors spread these and add schemas.
// Request and response types come from the full descriptors through type-only imports.

export interface EndpointMetadata {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  transport: 'json' | 'empty' | 'download' | 'redirect'
}

export const getAdminRoster = { method: 'GET', path: '/api/admin/roster', transport: 'json' } as const satisfies EndpointMetadata

export const putAdminRosterGroups = { method: 'PUT', path: '/api/admin/roster/groups', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminRosterBatchesById = { method: 'GET', path: '/api/admin/roster/batches/:id', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminRosterBatchesByIdCommit = { method: 'POST', path: '/api/admin/roster/batches/:id/commit', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminRosterBatchesByIdDiscard = { method: 'POST', path: '/api/admin/roster/batches/:id/discard', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminRosterPersons = { method: 'GET', path: '/api/admin/roster/persons', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminUsers = { method: 'GET', path: '/api/admin/users', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminUsersByIdBlock = { method: 'POST', path: '/api/admin/users/:id/block', transport: 'empty' } as const satisfies EndpointMetadata

export const postAdminUsersByIdUnblock = { method: 'POST', path: '/api/admin/users/:id/unblock', transport: 'empty' } as const satisfies EndpointMetadata

export const postAdminBindings = { method: 'POST', path: '/api/admin/bindings', transport: 'empty' } as const satisfies EndpointMetadata

export const getAdminRoles = { method: 'GET', path: '/api/admin/roles', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminRoles = { method: 'POST', path: '/api/admin/roles', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminRolesByIdRevoke = { method: 'POST', path: '/api/admin/roles/:id/revoke', transport: 'empty' } as const satisfies EndpointMetadata

export const getAdminSolver = { method: 'GET', path: '/api/admin/solver', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminCampaignsByIdRuns = { method: 'POST', path: '/api/admin/campaigns/:id/runs', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdRuns = { method: 'GET', path: '/api/admin/campaigns/:id/runs', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdRunsByRunId = { method: 'GET', path: '/api/admin/campaigns/:id/runs/:runId', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdRunsByRunIdExportXlsx = { method: 'GET', path: '/api/admin/campaigns/:id/runs/:runId/export.xlsx', transport: 'download' } as const satisfies EndpointMetadata

export const postAdminCampaignsByIdRunsByRunIdPublish = { method: 'POST', path: '/api/admin/campaigns/:id/runs/:runId/publish', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdExportAssignmentsXlsx = { method: 'GET', path: '/api/admin/campaigns/:id/export/assignments.xlsx', transport: 'download' } as const satisfies EndpointMetadata

export const getCampaignsByIdMyResult = { method: 'GET', path: '/api/campaigns/:id/my-result', transport: 'json' } as const satisfies EndpointMetadata

export const getCampaignsByIdItemsByItemIdParticipants = { method: 'GET', path: '/api/campaigns/:id/items/:itemId/participants', transport: 'json' } as const satisfies EndpointMetadata
export const postCampaignsByIdSwap = { method: 'POST', path: '/api/campaigns/:id/swap', transport: 'json' } as const satisfies EndpointMetadata
export const postCampaignsByIdClassesByClassNamePlace = { method: 'POST', path: '/api/campaigns/:id/classes/:className/place', transport: 'json' } as const satisfies EndpointMetadata
export const postAdminCampaignsByIdAssignments = { method: 'POST', path: '/api/admin/campaigns/:id/assignments', transport: 'json' } as const satisfies EndpointMetadata
export const getAdminCampaignsByIdAssignments = { method: 'GET', path: '/api/admin/campaigns/:id/assignments', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminAudit = { method: 'GET', path: '/api/admin/audit', transport: 'json' } as const satisfies EndpointMetadata

export const getAuthLogin = { method: 'GET', path: '/api/auth/login', transport: 'redirect' } as const satisfies EndpointMetadata

export const getAuthCallback = { method: 'GET', path: '/api/auth/callback', transport: 'redirect' } as const satisfies EndpointMetadata

export const postAuthLogout = { method: 'POST', path: '/api/auth/logout', transport: 'empty' } as const satisfies EndpointMetadata

export const getAuthMe = { method: 'GET', path: '/api/auth/me', transport: 'json' } as const satisfies EndpointMetadata

export const getCampaigns = { method: 'GET', path: '/api/campaigns', transport: 'json' } as const satisfies EndpointMetadata

export const getCampaignsById = { method: 'GET', path: '/api/campaigns/:id', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminCampaigns = { method: 'POST', path: '/api/admin/campaigns', transport: 'json' } as const satisfies EndpointMetadata

export const patchAdminCampaignsById = { method: 'PATCH', path: '/api/admin/campaigns/:id', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminCampaignsByIdTransition = { method: 'POST', path: '/api/admin/campaigns/:id/transition', transport: 'json' } as const satisfies EndpointMetadata

export const getCampaignsByIdDemand = { method: 'GET', path: '/api/campaigns/:id/demand', transport: 'json' } as const satisfies EndpointMetadata

export const getCampaignsByIdClassesByClassNameStatus = { method: 'GET', path: '/api/campaigns/:id/classes/:className/status', transport: 'json' } as const satisfies EndpointMetadata

export const getCampaignsByIdItems = { method: 'GET', path: '/api/campaigns/:id/items', transport: 'json' } as const satisfies EndpointMetadata

export const getCampaignsByIdCatalogue = { method: 'GET', path: '/api/campaigns/:id/catalogue', transport: 'json' } as const satisfies EndpointMetadata

export const getCampaignsByIdClasses = { method: 'GET', path: '/api/campaigns/:id/classes', transport: 'json' } as const satisfies EndpointMetadata

export const getCampaignsByIdTeachers = { method: 'GET', path: '/api/campaigns/:id/teachers', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdExportCatalogueXlsx = { method: 'GET', path: '/api/admin/campaigns/:id/export/catalogue.xlsx', transport: 'download' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdChoicesByPersonId = { method: 'GET', path: '/api/admin/campaigns/:id/choices/:personId', transport: 'json' } as const satisfies EndpointMetadata

export const putAdminCampaignsByIdChoicesByPersonId = { method: 'PUT', path: '/api/admin/campaigns/:id/choices/:personId', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminCampaignsByIdPreassignmentsByPersonIdByItemIdExempt = { method: 'POST', path: '/api/admin/campaigns/:id/preassignments/:personId/:itemId/exempt', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdMissing = { method: 'GET', path: '/api/admin/campaigns/:id/missing', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdExportMissingXlsx = { method: 'GET', path: '/api/admin/campaigns/:id/export/missing.xlsx', transport: 'download' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdMail = { method: 'GET', path: '/api/admin/campaigns/:id/mail', transport: 'json' } as const satisfies EndpointMetadata

export const getHealth = { method: 'GET', path: '/api/health', transport: 'json' } as const satisfies EndpointMetadata

export const postCampaignsByIdItems = { method: 'POST', path: '/api/campaigns/:id/items', transport: 'json' } as const satisfies EndpointMetadata

export const patchItemsById = { method: 'PATCH', path: '/api/items/:id', transport: 'json' } as const satisfies EndpointMetadata

export const deleteItemsById = { method: 'DELETE', path: '/api/items/:id', transport: 'empty' } as const satisfies EndpointMetadata

export const postItemsByIdPropose = { method: 'POST', path: '/api/items/:id/propose', transport: 'json' } as const satisfies EndpointMetadata

export const postItemsByIdUnpropose = { method: 'POST', path: '/api/items/:id/unpropose', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminItemsByIdApprove = { method: 'POST', path: '/api/admin/items/:id/approve', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminItemsByIdReturn = { method: 'POST', path: '/api/admin/items/:id/return', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminItemsByIdWithdraw = { method: 'POST', path: '/api/admin/items/:id/withdraw', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminMailTemplates = { method: 'GET', path: '/api/admin/mail-templates', transport: 'json' } as const satisfies EndpointMetadata

export const putAdminMailTemplatesByKind = { method: 'PUT', path: '/api/admin/mail-templates/:kind', transport: 'json' } as const satisfies EndpointMetadata

export const deleteAdminMailTemplatesByKind = { method: 'DELETE', path: '/api/admin/mail-templates/:kind', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminMailTemplatesByKindTest = { method: 'POST', path: '/api/admin/mail-templates/:kind/test', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminMailStatus = { method: 'GET', path: '/api/admin/mail/status', transport: 'json' } as const satisfies EndpointMetadata

export const putAdminMailPaused = { method: 'PUT', path: '/api/admin/mail/paused', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminRosterGraphStart = { method: 'GET', path: '/api/admin/roster/graph/start', transport: 'redirect' } as const satisfies EndpointMetadata

export const getAdminRosterGraphCallback = { method: 'GET', path: '/api/admin/roster/graph/callback', transport: 'redirect' } as const satisfies EndpointMetadata

export const getAdminRosterGraphGroups = { method: 'GET', path: '/api/admin/roster/graph/groups', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminRosterCsv = { method: 'POST', path: '/api/admin/roster/csv', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminRosterCsvTemplate = { method: 'GET', path: '/api/admin/roster/csv/template', transport: 'download' } as const satisfies EndpointMetadata

export const getSettingsPeriods = { method: 'GET', path: '/api/settings/periods', transport: 'json' } as const satisfies EndpointMetadata

export const putAdminSettingsPeriods = { method: 'PUT', path: '/api/admin/settings/periods', transport: 'json' } as const satisfies EndpointMetadata

export const getSettingsLanguage = { method: 'GET', path: '/api/settings/language', transport: 'json' } as const satisfies EndpointMetadata

export const putAdminSettingsLanguage = { method: 'PUT', path: '/api/admin/settings/language', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminClasses = { method: 'GET', path: '/api/admin/classes', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminClassesTeachers = { method: 'GET', path: '/api/admin/classes/teachers', transport: 'json' } as const satisfies EndpointMetadata

export const putAdminClassesByClassNameTeachers = { method: 'PUT', path: '/api/admin/classes/:className/teachers', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminClassesImportPreview = { method: 'POST', path: '/api/admin/classes/import/preview', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminClassesImport = { method: 'POST', path: '/api/admin/classes/import', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminClassesImportTemplate = { method: 'GET', path: '/api/admin/classes/import/template', transport: 'download' } as const satisfies EndpointMetadata

export const getCampaignsByIdMyChoice = { method: 'GET', path: '/api/campaigns/:id/my-choice', transport: 'json' } as const satisfies EndpointMetadata

export const putCampaignsByIdMyChoice = { method: 'PUT', path: '/api/campaigns/:id/my-choice', transport: 'json' } as const satisfies EndpointMetadata
export const getCampaignsByIdClassesByClassNameAttendance = { method: 'GET', path: '/api/campaigns/:id/classes/:className/attendance', transport: 'json' } as const satisfies EndpointMetadata
export const getCampaignsByIdClassesByClassNameAttendanceXlsx = { method: 'GET', path: '/api/campaigns/:id/classes/:className/attendance.xlsx', transport: 'download' } as const satisfies EndpointMetadata
export const putSessionsByIdAttendance = { method: 'PUT', path: '/api/sessions/:id/attendance', transport: 'json' } as const satisfies EndpointMetadata
export const getAdminCampaignsByIdExportAttendanceXlsx = { method: 'GET', path: '/api/admin/campaigns/:id/export/attendance.xlsx', transport: 'download' } as const satisfies EndpointMetadata
export const getMyAvailability = { method: 'GET', path: '/api/my-availability', transport: 'json' } as const satisfies EndpointMetadata

export const putMyAvailabilityByDate = { method: 'PUT', path: '/api/my-availability/:date', transport: 'json' } as const satisfies EndpointMetadata

export const getCampaignsByIdAvailability = { method: 'GET', path: '/api/campaigns/:id/availability', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdPlanning = { method: 'GET', path: '/api/admin/campaigns/:id/planning', transport: 'json' } as const satisfies EndpointMetadata

export const putAdminCampaignsByIdAvailabilityByPersonIdByDate = { method: 'PUT', path: '/api/admin/campaigns/:id/availability/:personId/:date', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminCampaignsByIdAvailabilityImportPreview = { method: 'POST', path: '/api/admin/campaigns/:id/availability/import/preview', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminCampaignsByIdAvailabilityImport = { method: 'POST', path: '/api/admin/campaigns/:id/availability/import', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdAvailabilityImportTemplate = { method: 'GET', path: '/api/admin/campaigns/:id/availability/import/template', transport: 'download' } as const satisfies EndpointMetadata

export const getAdminCampaignsByIdExportPlanningXlsx = { method: 'GET', path: '/api/admin/campaigns/:id/export/planning.xlsx', transport: 'download' } as const satisfies EndpointMetadata

export const getAdminRetention = { method: 'GET', path: '/api/admin/retention', transport: 'json' } as const satisfies EndpointMetadata
export const postAdminPurge = { method: 'POST', path: '/api/admin/purge', transport: 'json' } as const satisfies EndpointMetadata

export const getCategories = { method: 'GET', path: '/api/categories', transport: 'json' } as const satisfies EndpointMetadata

export const getAdminCategories = { method: 'GET', path: '/api/admin/categories', transport: 'json' } as const satisfies EndpointMetadata

export const postAdminCategories = { method: 'POST', path: '/api/admin/categories', transport: 'json' } as const satisfies EndpointMetadata

export const patchAdminCategoriesById = { method: 'PATCH', path: '/api/admin/categories/:id', transport: 'json' } as const satisfies EndpointMetadata

export const deleteAdminCategoriesById = { method: 'DELETE', path: '/api/admin/categories/:id', transport: 'json' } as const satisfies EndpointMetadata
