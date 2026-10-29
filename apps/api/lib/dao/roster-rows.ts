import type { PersonKind, RosterDiffSummary, RosterProblem } from '@school-allocation/school-core'
import type { BatchSource, BatchState, RosterWarning } from '../models/roster.ts'

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
