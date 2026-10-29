// The campaigns' and the catalogue's API, typed as the server answers it
// (apps/api/routes/campaigns.ts).

import type { CatalogueProblem, Credit, ItemState } from '@school-allocation/school-core'
import { apiDelete, apiGet, apiPatch, apiPost } from './api.ts'

/** The choice window and what it asks (D-05, D-06, D-13); dates are ISO instants, null until set. */
export interface CampaignWindow {
  opensAt: string | null
  closesAt: string | null
  lateUntil: string | null
  swapFrom: string | null
  swapUntil: string | null
  wishesPerGroup: number
  /** Grade → minutes a day must credit at least. */
  dailyMinimum: Record<string, number>
  showTeachers: boolean
}

export interface Campaign extends CampaignWindow {
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
  may: { propose: boolean, organize: boolean, seeDemand: boolean, classTeacherOf: string[] }
}

export type CampaignChanges = { name: string, schoolYear: string, projectDays: string[] } & Partial<CampaignWindow>

/** Places needed against places offered on one project day, per grade (school-core demandByDay). */
export interface DayDemand {
  date: string
  grades: { grade: number, students: number, fixed: number, needing: number, offered: number }[]
}

/** A class as its class teacher sees it in a campaign. */
export interface ClassStatus {
  className: string
  students: { personId: string, displayName: string }[]
  classActivities: { id: string, title: string, state: ItemState, sessions: { startsAt: string, endsAt: string }[] }[]
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
export const updateCampaign = (id: string, input: CampaignChanges) => apiPatch<Campaign>(`/api/admin/campaigns/${encodeURIComponent(id)}`, input)
export const loadDemand = (id: string) => apiGet<{ demand: DayDemand[] }>(`/api/campaigns/${encodeURIComponent(id)}/demand`)
export const loadClassStatus = (id: string, className: string) => apiGet<ClassStatus>(`/api/campaigns/${encodeURIComponent(id)}/classes/${encodeURIComponent(className)}/status`)
export const transitionCampaign = (id: string, to: 'catalogue' | 'published') => apiPost<Campaign>(`/api/admin/campaigns/${encodeURIComponent(id)}/transition`, { to })
export const approveItem = (id: string) => apiPost<Item>(`/api/admin/items/${encodeURIComponent(id)}/approve`)
export const returnItem = (id: string, note: string) => apiPost<Item>(`/api/admin/items/${encodeURIComponent(id)}/return`, { note })
export const withdrawItem = (id: string, reason: string) => apiPost<Item>(`/api/admin/items/${encodeURIComponent(id)}/withdraw`, { reason })
export const catalogueExportPath = (id: string) => `/api/admin/campaigns/${encodeURIComponent(id)}/export/catalogue.xlsx`
