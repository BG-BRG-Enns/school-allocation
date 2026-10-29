import type { Item } from '@school-allocation/api-contracts'
import { type CampaignState, type Credit, type ItemRules } from '@school-allocation/school-core'
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
