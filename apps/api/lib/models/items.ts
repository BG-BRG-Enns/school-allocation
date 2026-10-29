import type { Item } from '@school-allocation/api-contracts'
import { type CampaignState, type Credit, type ItemRules, type ItemState } from '@school-allocation/school-core'
import type { Queryable } from '../db.ts'

export interface SessionInput {
  /** ISO 8601 instants. */
  startsAt: string
  endsAt: string
  location: string
  credits: Credit[]
}

export interface ItemInput extends ItemRules {
  title: string
  description: string
  location: string
  feeCents: number
  feeNote: string
  /** Person ids of roster teachers. */
  teachers: string[]
  sessions: SessionInput[]
}

export interface Session extends SessionInput {
  id: string
}
export type { Item } from '@school-allocation/api-contracts'

export type Move = (client: Queryable, current: Item, campaignState: CampaignState) => Promise<void>

export interface ItemRow {
  id: string
  campaign_id: string
  number: number | null
  title: string
  description: string
  location: string
  fee_cents: number
  fee_note: string
  places: number
  min_participants: number
  cancellable_below_min: boolean
  fixed_classes: string[]
  eligible_grades: number[]
  eligible_classes: string[]
  state: ItemState
  review_note: string
  proposed_by: string
  proposer_name: string
  created_at: Date
  updated_at: Date
  approved_at: Date | null
  withdrawn_at: Date | null
  withdraw_reason: string | null
  teachers: { personId: string, displayName: string }[]
  sessions: { id: string, startsAt: string, endsAt: string, location: string, credits: Credit[] }[]
}
