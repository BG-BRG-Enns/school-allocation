import type { AllocationRun, RunFailureCode } from '@school-allocation/api-contracts'
import type { AllocationInput, AllocationProblem, PassResult } from '@school-allocation/school-core'

export type { AllocationRun, RunFailureCode, RunReviewResponse, RunStatus } from '@school-allocation/api-contracts'

/** A run with what only the application reads: its frozen input and the passes with their pairs. */
export interface StoredRun extends AllocationRun {
  snapshot: AllocationInput
  passResults: PassResult[]
}

/** What an organizer gives a run: the lot's seed to repeat one, the solver's limit per level. */
export interface RunStart {
  seed?: number
  deterministicTimePerLevel?: number
}

/** How a run ended: the solver's answers and what became of them, or why not. */
export interface RunFinish {
  status: 'succeeded' | 'failed'
  passes: PassResult[]
  cancelled: string[]
  versions: { solver: string, ortools: string } | null
  failure: RunFailureCode | null
  detail: string | null
  problems: AllocationProblem[]
}

/** A change of the published run, as stored (assignment_change): what the log, the workbook and a student's own list read. */
export interface StoredChange {
  id: string
  seq: number
  kind: 'swap' | 'place' | 'move' | 'remove'
  personId: string
  toItemId: string | null
  /** The items the change's superseded rows had. */
  leftItemIds: string[]
  reason: string | null
  forced: boolean
  changedBy: { id: string, displayName: string }
  changedAt: string
}
