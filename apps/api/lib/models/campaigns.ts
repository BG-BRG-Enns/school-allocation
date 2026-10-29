import type { CampaignWindow } from '@school-allocation/api-contracts'

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

export const CAMPAIGN_KINDS = ['project_week', 'wpf'] as const
