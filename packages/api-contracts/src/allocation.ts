// The solver contract (docs/domain-and-api.md §6) as schemas: what the API
// sends the solver and what it accepts back. The answer is checked against
// SolveResponseSchema before anything of it is stored, so a solver that
// drifts from the contract is refused, not trusted. The shapes are
// school-core's; domain-checks.ts pins them.

import { ALLOCATION_CONTRACT, ALLOCATION_INPUT_PROBLEM_CODES, ALLOCATION_PROBLEM_CODES, SOLVE_STATUSES, TIE_RANGE } from '@school-allocation/school-core'
import { Type, type Static } from 'typebox'
import { Literals, StrictObject } from './common.ts'

// The bounds here are the solver's (apps/solver/app/contract.py), so a request the API builds is one the solver takes.
const Count = Type.Integer({ minimum: 0 })
const Pair = Type.Tuple([Count, Count])

export const DayMinutesSchema = StrictObject({ d: Count, min: Count })
export const SolveOptionSchema = StrictObject({ o: Count, cost: Count, weight: Count, tie: Type.Integer({ minimum: 0, maximum: TIE_RANGE - 1 }), credit: Type.Array(DayMinutesSchema) })
export const SolveStudentSchema = StrictObject({ s: Count, required: Type.Array(DayMinutesSchema), norm: Count, options: Type.Array(SolveOptionSchema) })
export const SolveItemSchema = StrictObject({ o: Count, max: Count, min: Count, cancellable: Type.Boolean() })
/** The solver's limit per level, deterministic seconds; the solver refuses more than 600. */
export const AllocationLimitsSchema = StrictObject({ deterministicTimePerLevel: Type.Number({ exclusiveMinimum: 0, maximum: 600 }) })

export const SolveRequestSchema = StrictObject({
  contract: Type.Literal(ALLOCATION_CONTRACT),
  runId: Type.String({ minLength: 1, maxLength: 100 }),
  seed: Type.Integer({ minimum: 0, maximum: 2 ** 53 }),
  limits: AllocationLimitsSchema,
  students: Type.Array(SolveStudentSchema),
  items: Type.Array(SolveItemSchema),
  conflicts: Type.Array(Pair),
  fixed: Type.Array(Pair),
  levels: Type.Array(Type.String(), { minItems: 1 }),
})
export type SolveRequest = Static<typeof SolveRequestSchema>

export const SolveStatusSchema = Literals(SOLVE_STATUSES)
export const LevelValueSchema = StrictObject({ name: Type.String(), value: Type.Integer(), proven: Type.Boolean() })

export const SolveResponseSchema = StrictObject({
  status: SolveStatusSchema,
  levels: Type.Array(LevelValueSchema),
  assign: Type.Array(Pair),
  cancelled: Type.Array(Count),
  versions: StrictObject({ solver: Type.String(), ortools: Type.String() }),
  detail: Type.Optional(Type.String()),
})
export type SolveResponse = Static<typeof SolveResponseSchema>

/** What the validator holds against a result (school-core's codes), as a run's review reports it. */
export const AllocationProblemCodeSchema = Literals(ALLOCATION_PROBLEM_CODES)
export const AllocationProblemSchema = StrictObject({
  code: AllocationProblemCodeSchema,
  pass: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2)])),
  personId: Type.Optional(Type.String()),
  itemId: Type.Optional(Type.String()),
  level: Type.Optional(Type.String()),
  reported: Type.Optional(Type.Number()),
  recomputed: Type.Optional(Type.Number()),
})

export const AllocationInputProblemCodeSchema = Literals(ALLOCATION_INPUT_PROBLEM_CODES)
export const AllocationInputProblemSchema = StrictObject({
  code: AllocationInputProblemCodeSchema,
  grades: Type.Optional(Type.Array(Type.Integer())),
  personId: Type.Optional(Type.String()),
  itemIds: Type.Optional(Type.Array(Type.String())),
})
export const AllocationWarningSchema = StrictObject({
  code: Type.Literal('minimum_out_of_reach'),
  itemId: Type.String(),
  possible: Count,
  minimum: Count,
})
