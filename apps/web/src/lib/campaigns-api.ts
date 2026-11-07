// The campaigns' and the catalogue's API, typed as the server answers it
// (apps/api/routes/campaigns.ts).

import { endpointPath } from '@school-allocation/api-contracts/client-endpoint'
import * as endpoints from '@school-allocation/api-contracts/endpoint-metadata'
export type { CampaignRule, DayDemand, RuleDemand, RuleUnit } from '@school-allocation/school-core'

import type { AvailabilityStatus, CampaignChanges, CompanionsBody, ItemCheckBody, ItemInput } from '@school-allocation/api-contracts'
import { apiRequest } from './api.ts'

export type { Campaign, CampaignChanges, Category, CampaignCounts, CampaignView, CampaignWindow, ChoiceState, ChoiceView, ClassConflictView, ClassStatus, CompanionsItemView, CompanionsResponse, GateCellView, GroupView, Item, ItemCheckResponse, ItemInput, ItemInvalidBody, ItemShare, MissingStudent, RankingInvalidBody, SessionInput } from '@school-allocation/api-contracts'
/** The school's categories, for the activity form, the catalogue, the choice page and the rules. */
export const loadCategories = () => apiRequest(endpoints.getCategories, { })
export const loadCampaigns = () => apiRequest(endpoints.getCampaigns, { })
export const loadCampaign = (id: string) => apiRequest(endpoints.getCampaignsById, { params: { id: id } })
export const loadItems = (id: string) => apiRequest(endpoints.getCampaignsByIdItems, { params: { id: id } })
export const loadCatalogue = (id: string) => apiRequest(endpoints.getCampaignsByIdCatalogue, { params: { id: id } })
export const loadClasses = (id: string) => apiRequest(endpoints.getCampaignsByIdClasses, { params: { id: id } })
export const searchTeachers = (id: string, q: string) => apiRequest(endpoints.getCampaignsByIdTeachers, { params: { id: id }, query: { q } })
export const createItem = (campaignId: string, input: ItemInput) => apiRequest(endpoints.postCampaignsByIdItems, { params: { id: campaignId }, body: input })
export const updateItem = (id: string, input: ItemInput) => apiRequest(endpoints.patchItemsById, { params: { id: id }, body: input })
export const deleteItem = (id: string) => apiRequest(endpoints.deleteItemsById, { params: { id: id } })
export const proposeItem = (id: string) => apiRequest(endpoints.postItemsByIdPropose, { params: { id: id } })
export const unproposeItem = (id: string) => apiRequest(endpoints.postItemsByIdUnpropose, { params: { id: id } })
/** What a submission would meet: the gate's cells and verdict, the class conflicts, the demand without and with the activity; writes nothing. */
export const checkItem = (campaignId: string, body: ItemCheckBody) => apiRequest(endpoints.postCampaignsByIdItemsCheck, { params: { id: campaignId }, body })
/** The companions sought (the school's wish 6): the list per project day, joining and leaving as a teacher, the companions set by the lead or an organizer. */
export const loadCompanions = (campaignId: string) => apiRequest(endpoints.getCampaignsByIdCompanions, { params: { id: campaignId } })
export const joinItem = (id: string) => apiRequest(endpoints.postItemsByIdCompanionsMe, { params: { id } })
export const leaveItem = (id: string) => apiRequest(endpoints.deleteItemsByIdCompanionsMe, { params: { id } })
export const setCompanions = (id: string, body: CompanionsBody) => apiRequest(endpoints.putItemsByIdCompanions, { params: { id }, body })
/** Direct placement and leaving a class activity: the students a teacher finds, an activity's placements, and the acts on them; each act answers with the placements as they are then. */
export const findStudents = (campaignId: string, q: string) => apiRequest(endpoints.getCampaignsByIdStudents, { params: { id: campaignId }, query: { q } })
export const loadPlacements = (id: string) => apiRequest(endpoints.getItemsByIdPlacements, { params: { id } })
export const placeStudent = (id: string, personId: string, leavesClass: boolean) => apiRequest(endpoints.putItemsByIdPlacementsByPersonId, { params: { id, personId }, body: { leavesClass } })
export const removePlacement = (id: string, personId: string) => apiRequest(endpoints.deleteItemsByIdPlacementsByPersonId, { params: { id, personId } })
export const reclaimStudent = (id: string, personId: string) => apiRequest(endpoints.postItemsByIdReclaimsByPersonId, { params: { id, personId } })
export const takeOutOfClassActivity = (id: string, personId: string) => apiRequest(endpoints.putItemsByIdAbsencesByPersonId, { params: { id, personId } })
export const bringBackToClassActivity = (id: string, personId: string) => apiRequest(endpoints.deleteItemsByIdAbsencesByPersonId, { params: { id, personId } })

export const createCampaign = (input: { kind: 'project_week', name: string, schoolYear: string, projectDays: string[], classes?: string[], frames?: Record<string, { from: number, to: number }>, activityMinimums?: Record<string, number> }) => apiRequest(endpoints.postAdminCampaigns, { body: input })

export const loadMyChoice = (id: string) => apiRequest(endpoints.getCampaignsByIdMyChoice, { params: { id: id } })
export const saveMyChoice = (id: string, ranking: Record<string, string[]>) => apiRequest(endpoints.putCampaignsByIdMyChoice, { params: { id: id }, body: { ranking } })
export const loadChoiceOf = (id: string, personId: string) => apiRequest(endpoints.getAdminCampaignsByIdChoicesByPersonId, { params: { id: id, personId: personId } })
export const saveChoiceOf = (id: string, personId: string, ranking: Record<string, string[]>, reason: string) => apiRequest(endpoints.putAdminCampaignsByIdChoicesByPersonId, { params: { id: id, personId: personId }, body: { ranking, reason } })
export const exemptStudent = (id: string, personId: string, itemId: string, reason: string) => apiRequest(endpoints.postAdminCampaignsByIdPreassignmentsByPersonIdByItemIdExempt, { params: { id: id, personId: personId, itemId: itemId }, body: { reason } })
export const loadMissing = (id: string) => apiRequest(endpoints.getAdminCampaignsByIdMissing, { params: { id: id } })
export const missingExportPath = (id: string) => endpointPath(endpoints.getAdminCampaignsByIdExportMissingXlsx, { params: { id } })

export const updateCampaign = (id: string, input: CampaignChanges) => apiRequest(endpoints.patchAdminCampaignsById, { params: { id: id }, body: input })
export const loadDemand = (id: string) => apiRequest(endpoints.getCampaignsByIdDemand, { params: { id: id } })
export const loadClassStatus = (id: string, className: string) => apiRequest(endpoints.getCampaignsByIdClassesByClassNameStatus, { params: { id: id, className: className } })
export const transitionCampaign = (id: string, to: 'draft' | 'catalogue' | 'published' | 'open' | 'closed' | 'archived') => apiRequest(endpoints.postAdminCampaignsByIdTransition, { params: { id: id }, body: { to } })
export const deleteCampaign = (id: string) => apiRequest(endpoints.deleteAdminCampaignsById, { params: { id: id } })
export const approveItem = (id: string) => apiRequest(endpoints.postAdminItemsByIdApprove, { params: { id: id } })
export const returnItem = (id: string, note: string) => apiRequest(endpoints.postAdminItemsByIdReturn, { params: { id: id }, body: { note } })
export const withdrawItem = (id: string, reason: string) => apiRequest(endpoints.postAdminItemsByIdWithdraw, { params: { id: id }, body: { reason } })
export const catalogueExportPath = (id: string) => endpointPath(endpoints.getAdminCampaignsByIdExportCatalogueXlsx, { params: { id } })

export type { AvailabilityStatus, PlanningResponse } from '@school-allocation/api-contracts'
export type { OtherActivity, PlacementsResponse } from '@school-allocation/api-contracts'
export const loadMyAvailability = () => apiRequest(endpoints.getMyAvailability, { })
export const setMyAvailability = (date: string, status: AvailabilityStatus) => apiRequest(endpoints.putMyAvailabilityByDate, { params: { date }, body: { status } })
export const loadCampaignAvailability = (id: string) => apiRequest(endpoints.getCampaignsByIdAvailability, { params: { id } })
export const loadPlanning = (id: string) => apiRequest(endpoints.getAdminCampaignsByIdPlanning, { params: { id } })
export const setAvailabilityFor = (id: string, personId: string, date: string, status: AvailabilityStatus) => apiRequest(endpoints.putAdminCampaignsByIdAvailabilityByPersonIdByDate, { params: { id, personId, date }, body: { status } })
export const planningExportPath = (id: string) => endpointPath(endpoints.getAdminCampaignsByIdExportPlanningXlsx, { params: { id } })
export const previewAvailabilityImport = (id: string, csv: string) => apiRequest(endpoints.postAdminCampaignsByIdAvailabilityImportPreview, { params: { id }, body: { csv } })
export const applyAvailabilityImport = (id: string, csv: string) => apiRequest(endpoints.postAdminCampaignsByIdAvailabilityImport, { params: { id }, body: { csv } })
export const availabilityTemplatePath = (id: string) => endpointPath(endpoints.getAdminCampaignsByIdAvailabilityImportTemplate, { params: { id } })
