import type { DayDemand } from '@school-allocation/school-core'
export type { DayDemand } from '@school-allocation/school-core'
// The campaigns' and the catalogue's API, typed as the server answers it
// (apps/api/routes/campaigns.ts).

import type { Campaign, CampaignChanges, CampaignView, ChoiceView, ClassStatus, Item, ItemInput, MissingStudent } from '@school-allocation/api-contracts'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api.ts'

export type { Campaign, CampaignChanges, CampaignCounts, CampaignView, CampaignWindow, ChoiceState, ChoiceView, ClassStatus, GroupView, Item, ItemInput, ItemInvalidBody, MissingStudent, RankingInvalidBody, SessionInput } from '@school-allocation/api-contracts'
export const loadCampaigns = () => apiGet<{ campaigns: Campaign[] }>('/api/campaigns')
export const loadCampaign = (id: string) => apiGet<CampaignView>(`/api/campaigns/${encodeURIComponent(id)}`)
export const loadItems = (id: string) => apiGet<{ items: Item[] }>(`/api/campaigns/${encodeURIComponent(id)}/items`)
export const loadCatalogue = (id: string) => apiGet<{ campaign: Campaign, items: Item[] }>(`/api/campaigns/${encodeURIComponent(id)}/catalogue`)
export const loadClasses = (id: string) => apiGet<{ classes: { className: string, grade: number }[] }>(`/api/campaigns/${encodeURIComponent(id)}/classes`)
export const searchTeachers = (id: string, q: string) => apiGet<{ teachers: { personId: string, displayName: string }[] }>(`/api/campaigns/${encodeURIComponent(id)}/teachers?q=${encodeURIComponent(q)}`)
export const createItem = (campaignId: string, input: ItemInput) => apiPost<Item>(`/api/campaigns/${encodeURIComponent(campaignId)}/items`, input)
export const updateItem = (id: string, input: ItemInput) => apiPatch<Item>(`/api/items/${encodeURIComponent(id)}`, input)
export const deleteItem = (id: string) => apiDelete(`/api/items/${encodeURIComponent(id)}`)
export const proposeItem = (id: string) => apiPost<Item>(`/api/items/${encodeURIComponent(id)}/propose`)
export const unproposeItem = (id: string) => apiPost<Item>(`/api/items/${encodeURIComponent(id)}/unpropose`)

export const createCampaign = (input: { kind: 'project_week', name: string, schoolYear: string, projectDays: string[] }) => apiPost<Campaign>('/api/admin/campaigns', input)

export const loadMyChoice = (id: string) => apiGet<ChoiceView>(`/api/campaigns/${encodeURIComponent(id)}/my-choice`)
export const saveMyChoice = (id: string, ranking: Record<string, string[]>) => apiPut<ChoiceView>(`/api/campaigns/${encodeURIComponent(id)}/my-choice`, { ranking })
export const loadChoiceOf = (id: string, personId: string) => apiGet<ChoiceView>(`/api/admin/campaigns/${encodeURIComponent(id)}/choices/${encodeURIComponent(personId)}`)
export const saveChoiceOf = (id: string, personId: string, ranking: Record<string, string[]>, reason: string) => apiPut<ChoiceView>(`/api/admin/campaigns/${encodeURIComponent(id)}/choices/${encodeURIComponent(personId)}`, { ranking, reason })
export const exemptStudent = (id: string, personId: string, itemId: string, reason: string) => apiPost<ChoiceView>(`/api/admin/campaigns/${encodeURIComponent(id)}/preassignments/${encodeURIComponent(personId)}/${encodeURIComponent(itemId)}/exempt`, { reason })
export const loadMissing = (id: string) => apiGet<{ students: MissingStudent[] }>(`/api/admin/campaigns/${encodeURIComponent(id)}/missing`)
export const missingExportPath = (id: string) => `/api/admin/campaigns/${encodeURIComponent(id)}/export/missing.xlsx`

export const updateCampaign = (id: string, input: CampaignChanges) => apiPatch<Campaign>(`/api/admin/campaigns/${encodeURIComponent(id)}`, input)
export const loadDemand = (id: string) => apiGet<{ demand: DayDemand[] }>(`/api/campaigns/${encodeURIComponent(id)}/demand`)
export const loadClassStatus = (id: string, className: string) => apiGet<ClassStatus>(`/api/campaigns/${encodeURIComponent(id)}/classes/${encodeURIComponent(className)}/status`)
export const transitionCampaign = (id: string, to: 'catalogue' | 'published' | 'open' | 'closed') => apiPost<Campaign>(`/api/admin/campaigns/${encodeURIComponent(id)}/transition`, { to })
export const approveItem = (id: string) => apiPost<Item>(`/api/admin/items/${encodeURIComponent(id)}/approve`)
export const returnItem = (id: string, note: string) => apiPost<Item>(`/api/admin/items/${encodeURIComponent(id)}/return`, { note })
export const withdrawItem = (id: string, reason: string) => apiPost<Item>(`/api/admin/items/${encodeURIComponent(id)}/withdraw`, { reason })
export const catalogueExportPath = (id: string) => `/api/admin/campaigns/${encodeURIComponent(id)}/export/catalogue.xlsx`
