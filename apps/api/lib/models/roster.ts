import { type PersonKind, type RosterDiffSummary, type RosterEntry, type RosterProblem } from '@school-allocation/school-core'

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
  /** app_user.id */
  triggeredBy: string
}

export interface BatchRow {
  id: string
  source: BatchSource
  state: BatchState
  school_year: string
  fetched_at: Date
  row_count: number
  triggered_by: string
  previous_batch_id: string | null
  diff_summary: RosterDiffSummary
  problems: RosterProblem[]
  warnings: RosterWarning[]
  decided_at: Date | null
}

export interface EntryRow {
  id: string
  person_id: string | null
  kind: PersonKind
  oid: string | null
  upn: string | null
  mail: string | null
  display_name: string
  class_name: string | null
  grade: number | null
  class_teacher_mail: string | null
}

export const BATCH_SOURCES = ['graph:groups', 'csv'] as const

export const BATCH_STATES = ['pending', 'committed', 'discarded', 'rejected'] as const
