// The campaigns' and the catalogue's API, typed as the server answers it
// (apps/api/routes/campaigns.ts).

import { endpointPath } from '@school-allocation/api-contracts/client-endpoint'
import * as endpoints from '@school-allocation/api-contracts/endpoint-metadata'
export type { CampaignRule, DayDemand, RuleDemand, RuleUnit } from '@school-allocation/school-core'

import type { AvailabilityStatus, CampaignChanges, ItemInput } from '@school-allocation/api-contracts'
import { apiRequest } from './api.ts'

export type { Campaign, CampaignChanges, Category, CampaignCounts, CampaignView, CampaignWindow, ChoiceState, ChoiceView, ClassStatus, GroupView, Item, ItemInput, ItemInvalidBody, MissingStudent, RankingInvalidBody, SessionInput } from '@school-allocation/api-contracts'
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

export const createCampaign = (input: { kind: 'project_week', name: string, schoolYear: string, projectDays: string[] }) => apiRequest(endpoints.postAdminCampaigns, { body: input })

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
export const transitionCampaign = (id: string, to: 'catalogue' | 'published' | 'open' | 'closed' | 'archived') => apiRequest(endpoints.postAdminCampaignsByIdTransition, { params: { id: id }, body: { to } })
export const approveItem = (id: string) => apiRequest(endpoints.postAdminItemsByIdApprove, { params: { id: id } })
export const returnItem = (id: string, note: string) => apiRequest(endpoints.postAdminItemsByIdReturn, { params: { id: id }, body: { note } })
export const withdrawItem = (id: string, reason: string) => apiRequest(endpoints.postAdminItemsByIdWithdraw, { params: { id: id }, body: { reason } })
export const catalogueExportPath = (id: string) => endpointPath(endpoints.getAdminCampaignsByIdExportCatalogueXlsx, { params: { id } })

export type { AvailabilityStatus, PlanningResponse } from '@school-allocation/api-contracts'
export const loadMyAvailability = () => apiRequest(endpoints.getMyAvailability, { })
export const setMyAvailability = (date: string, status: AvailabilityStatus) => apiRequest(endpoints.putMyAvailabilityByDate, { params: { date }, body: { status } })
export const loadCampaignAvailability = (id: string) => apiRequest(endpoints.getCampaignsByIdAvailability, { params: { id } })
export const loadPlanning = (id: string) => apiRequest(endpoints.getAdminCampaignsByIdPlanning, { params: { id } })
export const setAvailabilityFor = (id: string, personId: string, date: string, status: AvailabilityStatus) => apiRequest(endpoints.putAdminCampaignsByIdAvailabilityByPersonIdByDate, { params: { id, personId, date }, body: { status } })
export const planningExportPath = (id: string) => endpointPath(endpoints.getAdminCampaignsByIdExportPlanningXlsx, { params: { id } })
