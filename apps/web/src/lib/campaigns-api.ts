// The campaigns' and the catalogue's API, typed as the server answers it
// (apps/api/routes/campaigns.ts).

import type { CatalogueProblem, Credit, ItemState } from '@school-allocation/school-core'
import { apiDelete, apiGet, apiPatch, apiPost } from './api.ts'

export interface Campaign {
  id: string
  kind: 'project_week' | 'wpf'
  name: string
  schoolYear: string
  state: string
  projectDays: string[]
  createdAt: string
  updatedAt: string
}

export interface CampaignCounts {
  draft: number
  proposed: number
  approved: number
  withdrawn: number
}

export interface CampaignView {
  campaign: Campaign
  counts: CampaignCounts | null
  may: { propose: boolean, organize: boolean }
}

export interface SessionInput {
  startsAt: string
  endsAt: string
  location?: string
  credits: Credit[]
}

export interface ItemInput {
  title: string
  description?: string
  location?: string
  feeCents?: number
  feeNote?: string
  places: number
  minParticipants?: number
  cancellableBelowMin?: boolean
  fixedClasses?: string[]
  eligibleGrades?: number[]
  eligibleClasses?: string[]
  teachers: string[]
  sessions: SessionInput[]
}

export interface Item {
  id: string
  campaignId: string
  number: number | null
  title: string
  description: string
  location: string
  feeCents: number
  feeNote: string
  places: number
  minParticipants: number
  cancellableBelowMin: boolean
  fixedClasses: string[]
  eligibleGrades: number[]
  eligibleClasses: string[]
  state: ItemState
  reviewNote: string
  proposedBy: { id: string, displayName: string }
  teachers: { personId: string, displayName: string }[]
  sessions: { id: string, startsAt: string, endsAt: string, location: string, credits: Credit[] }[]
  createdAt: string
  updatedAt: string
  approvedAt: string | null
  withdrawnAt: string | null
  withdrawReason: string | null
}

/** The body of a 422 on an activity: the rules it breaks. */
export interface ItemInvalidBody {
  error: 'item_invalid'
  problems: CatalogueProblem[]
  unknownTeachers: string[]
}

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
export const updateCampaign = (id: string, input: { name: string, schoolYear: string, projectDays: string[] }) => apiPatch<Campaign>(`/api/admin/campaigns/${encodeURIComponent(id)}`, input)
export const transitionCampaign = (id: string, to: 'catalogue' | 'published') => apiPost<Campaign>(`/api/admin/campaigns/${encodeURIComponent(id)}/transition`, { to })
export const approveItem = (id: string) => apiPost<Item>(`/api/admin/items/${encodeURIComponent(id)}/approve`)
export const returnItem = (id: string, note: string) => apiPost<Item>(`/api/admin/items/${encodeURIComponent(id)}/return`, { note })
export const withdrawItem = (id: string, reason: string) => apiPost<Item>(`/api/admin/items/${encodeURIComponent(id)}/withdraw`, { reason })
export const catalogueExportPath = (id: string) => `/api/admin/campaigns/${encodeURIComponent(id)}/export/catalogue.xlsx`
