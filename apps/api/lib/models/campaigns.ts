import type { CampaignWindow, RuleInput } from '@school-allocation/api-contracts'

export type CampaignKind = typeof CAMPAIGN_KINDS[number]
export type { CampaignWindow, RuleInput } from '@school-allocation/api-contracts'

export type { Campaign } from '@school-allocation/api-contracts'

export type { CampaignCounts } from '@school-allocation/api-contracts'

export interface NewCampaign {
  kind: CampaignKind
  name: string
  schoolYear: string
  projectDays: string[]
}

/** What an organizer changes: the set-up (while it is being set up or taking proposals), the window settings and the rules (until the window opens). */
export type CampaignChanges = Omit<NewCampaign, 'kind'> & Partial<Omit<CampaignWindow, 'rules'>> & { rules?: RuleInput[] }

/** A class of the roster in force, for the pickers: its name and grade. */
export interface RosterClass {
  className: string
  grade: number
}

/** A teacher of the roster in force, for naming the teachers of an activity. */
export interface RosterTeacher {
  personId: string
  displayName: string
  /** The abbreviation the school knows the teacher by, once imported. */
  shortName: string | null
}

export const CAMPAIGN_KINDS = ['project_week', 'wpf'] as const
