// The allocation (docs/domain-and-api.md §5–§6): what a run computes with,
// what the solver is asked and what it answers, and what comes out. The
// input is the frozen snapshot of a campaign; the API stores it with the
// run, so the run can be recompiled and re-validated later. Ids are the
// database's; the compiler (allocation-compile.ts) indexes them for the
// solver, which never sees a name, an address or a class.

import type { ItemRules, SessionInput } from './catalogue.ts'
import type { Ranking } from './choices.ts'

export const ALLOCATION_CONTRACT = 'allocation/v1'

/** A cost of one rank unit over a student's whole requirement: `rank · minutes / required · COST_SCALE`. */
export const COST_SCALE = 1000

/** Tie-break weights are in `[0, TIE_RANGE)`, decided by the seed alone (L5). */
export const TIE_RANGE = 1000

/** The window a ranking was last saved in (D-06, D-20). */
export type SubmissionWindow = 'first' | 'late'

export interface AllocationStudent {
  personId: string
  className: string
  grade: number
  /** The items the student is placed into by class (D-24), exemptions left out. */
  fixedItemIds: string[]
  /** The saved ranking, or null for a student who never saved one. */
  ranking: Ranking | null
  savedIn: SubmissionWindow | null
}

export interface AllocationItem {
  id: string
  feeCents: number
  rules: ItemRules
  sessions: SessionInput[]
}

export interface AllocationLimits {
  /** CP-SAT's deterministic time per level, never a wall-clock limit. */
  deterministicTimePerLevel: number
}

/** The frozen input of a run. */
export interface AllocationInput {
  projectDays: string[]
  /** Grade → the minutes a day must credit; every grade of the students needs one. */
  dailyMinimum: Record<string, number>
  wishesPerGroup: number
  seed: number
  limits: AllocationLimits
  students: AllocationStudent[]
  /** The approved catalogue. */
  items: AllocationItem[]
}

// --- The solver contract (§6): small integers, no domain ids.

/** Minutes on a project day, `d` the day's index in the campaign's project days. */
export interface DayMinutes {
  d: number
  min: number
}

export interface SolveOption {
  o: number
  /** `rank · minutes · COST_SCALE / norm`, rounded: what L4 sums. */
  cost: number
  /** `rank · minutes`, exact: what L3 compares against `t · norm`, so rounding never puts a student over a threshold they are on. */
  weight: number
  tie: number
  credit: DayMinutes[]
}

export interface SolveStudent {
  s: number
  required: DayMinutes[]
  /** The minutes the student still needs over the week, the costs' denominator. */
  norm: number
  options: SolveOption[]
}

export interface SolveItem {
  o: number
  max: number
  min: number
  cancellable: boolean
}

export interface SolveRequest {
  contract: typeof ALLOCATION_CONTRACT
  runId: string
  seed: number
  limits: AllocationLimits
  students: SolveStudent[]
  items: SolveItem[]
  /** Pairs of items whose sessions overlap. */
  conflicts: [number, number][]
  /** Assignments the solver must keep: the first pass, carried into the second (D-20). */
  fixed: [number, number][]
  levels: string[]
}

export const SOLVE_STATUSES = ['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN', 'MODEL_INVALID'] as const
export type SolveStatus = typeof SOLVE_STATUSES[number]

export interface LevelValue {
  name: string
  value: number
  /** Whether the level's value is proven optimal, or the best found within the limit. */
  proven: boolean
}

export interface SolveResponse {
  status: SolveStatus
  levels: LevelValue[]
  assign: [number, number][]
  cancelled: number[]
  versions: { solver: string, ortools: string }
  detail?: string
}

// --- What comes out.

export type Pass = 1 | 2

/** A pass's answer in the database's ids, as the API maps it back from the solver's indices. */
export interface PassResult {
  status: SolveStatus
  levels: LevelValue[]
  /** `[personId, itemId]` pairs. */
  assign: [string, string][]
  cancelled: string[]
}

export interface AllocationResult {
  passes: [PassResult, PassResult]
}

export const ASSIGNMENT_SOURCES = ['fixed', 'wish', 'fallback'] as const
export type AssignmentSource = typeof ASSIGNMENT_SOURCES[number]

export interface Assignment {
  personId: string
  itemId: string
  source: AssignmentSource
  /** The pass that made it; null for a pre-assignment. */
  pass: Pass | null
  /** The wish number for a ranked item; null for a pre-assignment or a fallback. */
  rank: number | null
}

/** FNV-1a over the string's UTF-16 code units, 32 bits: the same number everywhere, from nothing but its input. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** The tie-break weight of a student–item pair under a seed (L5): a lot drawn once, recorded by the seed. */
export function tieWeight(seed: number, personId: string, itemId: string): number {
  return fnv1a32(`${seed}:${personId}:${itemId}`) % TIE_RANGE
}

/**
 * The lexicographic levels (§5, D-04) for a campaign's cap: nobody without a
 * full week, then as few missing minutes as possible, then as few students
 * as possible whose minutes-weighted average rank exceeds t for t = cap … 2,
 * then the total cost, then the lot.
 */
export function levelNames(cap: number): string[] {
  const over: string[] = []
  for (let t = cap; t >= 2; t--) over.push(`over:${t * COST_SCALE}`)
  return ['students_with_deficit', 'deficit_minutes', ...over, 'total_cost', 'tiebreak']
}
