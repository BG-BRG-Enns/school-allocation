import type { AllocationInput, AllocationProblem, AllocationWarning, PassResult } from '@school-allocation/school-core'
import type { RunFailureCode, RunStatus } from '../models/allocation.ts'

export interface RunRow {
  id: string
  campaign_id: string
  seq: number
  status: RunStatus
  started_at: Date
  finished_at: Date | null
  started_by: string
  started_by_name: string
  /** int8 arrives as text. */
  seed: string
  limits: { deterministicTimePerLevel: number }
  core_version: number
  contract: string
  solver_version: string | null
  ortools_version: string | null
  snapshot_sha256: string
  warnings: AllocationWarning[]
  passes: PassResult[]
  cancelled_items: string[]
  failure: RunFailureCode | null
  detail: string | null
  problems: AllocationProblem[]
  published_at: Date | null
}

export interface RunRowWithSnapshot extends RunRow {
  snapshot: AllocationInput
}

export interface AssignmentRow {
  person_id: string
  item_id: string
  source: 'fixed' | 'solver' | 'fallback' | 'swap' | 'manual'
  pass: 1 | 2 | null
  rank: number | null
}

/** A change of the published run (0008), with the rows it superseded and the names the pages show. */
export interface ChangeRow {
  id: string
  seq: number
  kind: 'swap' | 'place' | 'move' | 'remove'
  person_id: string
  to_item_id: string | null
  left_item_ids: string[]
  reason: string | null
  forced: boolean
  changed_by: string
  changed_by_name: string
  changed_at: Date
}
