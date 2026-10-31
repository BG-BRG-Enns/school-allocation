import type { Credit, ItemState } from '@school-allocation/school-core'

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
  /** The proposer's person, by their account's binding; null for an account bound to nobody. */
  proposer_person: string | null
  sessions: { id: string, startsAt: string, endsAt: string, location: string, credits: Credit[] }[]
}
