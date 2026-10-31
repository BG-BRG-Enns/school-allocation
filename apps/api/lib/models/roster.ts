import { type RosterEntry, type RosterProblem } from '@school-allocation/school-core'
import type { Actor } from '../actor.ts'

export type BatchSource = typeof BATCH_SOURCES[number]

export type BatchState = typeof BATCH_STATES[number]

/** Something an accepted batch should be looked at for; `key` names the entry. */
export interface RosterWarning {
  code: 'no_address'
  key: string
}
export type { Batch } from '@school-allocation/api-contracts'

export type { BatchDetail } from '@school-allocation/api-contracts'

export type { RosterPerson, StoredEntry } from '@school-allocation/api-contracts'

export interface NewBatch {
  source: BatchSource
  schoolYear: string
  entries: RosterEntry[]
  /** Problems found before the batch check, such as a CSV row that could not be read. */
  problems?: RosterProblem[]
  warnings?: RosterWarning[]
  /** The administrator who imports: the batch's triggered_by and the actor of the audit event. */
  triggeredBy: Actor
}

export const BATCH_SOURCES = ['graph:groups', 'csv'] as const

export const BATCH_STATES = ['pending', 'committed', 'discarded', 'rejected'] as const
