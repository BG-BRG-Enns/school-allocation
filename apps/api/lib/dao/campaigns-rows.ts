import type { CampaignState } from '@school-allocation/school-core'
import type { CampaignKind } from '../models/campaigns.ts'

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
