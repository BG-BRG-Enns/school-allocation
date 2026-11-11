import type { CampaignRule, CampaignState, Frame } from '@school-allocation/school-core'
import type { CampaignKind } from '../models/campaigns.ts'

export interface CampaignRow {
  id: string
  kind: CampaignKind
  name: string
  school_year: string
  state: CampaignState
  project_days: string[]
  /** The frames by day, the days without one left out. */
  frames: Record<string, Frame>
  /** Date → the minimum length of an activity on the day, in credited minutes; a day without one is absent. */
  minimums: Record<string, number>
  opens_at: Date | null
  closes_at: Date | null
  late_until: Date | null
  swap_from: Date | null
  swap_until: Date | null
  wishes_per_group: number
  daily_minimum: Record<string, number>
  show_teachers: boolean
  reminder_days: number
  place_headroom_percent: number
  lock_new_offers: boolean
  teachers_see_proposed: boolean
  rules: CampaignRule[]
  classes: string[]
  roster_batch_id: string | null
  created_at: Date
  updated_at: Date
}
