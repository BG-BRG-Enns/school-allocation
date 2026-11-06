import { type Credit, type ItemRules } from '@school-allocation/school-core'
import type { Campaign } from './campaigns.ts'
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
  /** Person ids of roster teachers: the lead and the companions. */
  teachers: string[]
  /** The teacher who leads; null when the body named none and none follows from it (the service fills in a stored activity's lead, the rules refuse what is left). */
  lead: string | null
  /** How many companions the lead wants beside them, 0–8. */
  companionsWanted: number
  sessions: SessionInput[]
  /** Ids of the school's categories; undefined keeps the ones an item has. */
  categories?: string[]
}

export interface Session extends SessionInput {
  id: string
}
import type { Item } from '@school-allocation/api-contracts'
export type { Item } from '@school-allocation/api-contracts'

export type Move = (client: Queryable, current: Item, campaign: Campaign) => Promise<void>

/** What the gate reads of an activity, as stored at a submission (catalog_item.proposed_shape): its places, whom it is for, when it takes place (epoch milliseconds). Never on the wire. */
export interface StoredShape {
  places: number
  fixedClasses: string[]
  eligibleGrades: number[]
  eligibleClasses: string[]
  sessions: { startMs: number, endMs: number }[]
}
