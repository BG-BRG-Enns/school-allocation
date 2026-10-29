import type { CampaignWindow } from '@school-allocation/api-contracts'
import { type CampaignState } from '@school-allocation/school-core'

export type CampaignKind = typeof CAMPAIGN_KINDS[number]
export type { CampaignWindow } from '@school-allocation/api-contracts'

export type { Campaign } from '@school-allocation/api-contracts'

export type { CampaignCounts } from '@school-allocation/api-contracts'

export interface NewCampaign {
  kind: CampaignKind
  name: string
  schoolYear: string
  projectDays: string[]
}

/** What an organizer changes: the set-up (while it is being set up or taking proposals) and the window settings (until the window opens). */
export type CampaignChanges = Omit<NewCampaign, 'kind'> & Partial<CampaignWindow>

/** A class of the roster in force, for the pickers: its name and grade. */
export interface RosterClass {
  className: string
  grade: number
}

/** A teacher of the roster in force, for naming the teachers of an activity. */
export interface RosterTeacher {
  personId: string
  displayName: string
}

export interface CampaignRow {
  id: string
  kind: CampaignKind
  name: string
  school_year: string
  state: CampaignState
  project_days: string[]
  opens_at: Date | null
  closes_at: Date | null
  late_until: Date | null
  swap_from: Date | null
  swap_until: Date | null
  wishes_per_group: number
  daily_minimum: Record<string, number>
  show_teachers: boolean
  reminder_days: number
  roster_batch_id: string | null
  created_at: Date
  updated_at: Date
}

export const CAMPAIGN_KINDS = ['project_week', 'wpf'] as const
