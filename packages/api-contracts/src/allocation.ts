// The solver contract (docs/domain-and-api.md §6) as schemas: what the API
// sends the solver and what it accepts back. The answer is checked against
// SolveResponseSchema before anything of it is stored, so a solver that
// drifts from the contract is refused, not trusted. The shapes are
// school-core's; domain-checks.ts pins them.

import { ALLOCATION_CONTRACT, ALLOCATION_INPUT_PROBLEM_CODES, ALLOCATION_PROBLEM_CODES, ASSIGNMENT_SOURCES, SOLVE_STATUSES, TIE_RANGE } from '@school-allocation/school-core'
import { Type, type Static } from 'typebox'
import { Literals, StrictObject, Uuid } from './common.ts'

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

// --- Runs (docs/domain-and-api.md §1 AllocationRun, §8): what the organizer starts, lists and reviews.

export const RUN_STATUSES = ['running', 'succeeded', 'failed', 'interrupted'] as const
export type RunStatus = typeof RUN_STATUSES[number]

/** Why a run failed, before its message: the solver gone or off the contract, the model's answer, the validator's refusal. */
export const RUN_FAILURE_CODES = ['solver_unreachable', 'solver_answer_invalid', 'solver_infeasible', 'solver_unknown', 'model_invalid', 'validation_failed', 'internal_error'] as const
export type RunFailureCode = typeof RUN_FAILURE_CODES[number]

/** The limit per level, in CP-SAT's deterministic seconds (several wall-clock seconds each): small by default, raised for another run. */
export const RUN_LIMITS = { defaultDeterministicTimePerLevel: 5, maxDeterministicTimePerLevel: 60, maxSeed: 2147483647 } as const

export const RunParams = StrictObject({ id: Uuid, runId: Uuid })
export const StartRunBody = StrictObject({
  /** The lot's seed; drawn when left out, given to repeat a run. */
  seed: Type.Optional(Type.Integer({ minimum: 0, maximum: RUN_LIMITS.maxSeed })),
  deterministicTimePerLevel: Type.Optional(Type.Integer({ minimum: 1, maximum: RUN_LIMITS.maxDeterministicTimePerLevel })),
})

export const PassLevelsSchema = StrictObject({ pass: Type.Union([Type.Literal(1), Type.Literal(2)]), status: SolveStatusSchema, levels: Type.Array(LevelValueSchema) })

export const AllocationRunSchema = StrictObject({
  id: Type.String(),
  campaignId: Type.String(),
  /** Lauf 1, 2, … of the campaign. */
  seq: Type.Integer(),
  status: Literals(RUN_STATUSES),
  startedAt: Type.String(),
  finishedAt: Type.Union([Type.String(), Type.Null()]),
  startedBy: StrictObject({ id: Type.String(), displayName: Type.String() }),
  seed: Type.Integer(),
  limits: AllocationLimitsSchema,
  coreVersion: Type.Integer(),
  contract: Type.String(),
  versions: Type.Union([StrictObject({ solver: Type.String(), ortools: Type.String() }), Type.Null()]),
  snapshotSha256: Type.String(),
  warnings: Type.Array(AllocationWarningSchema),
  /** Each pass's status and level values, once finished. */
  passes: Type.Array(PassLevelsSchema),
  cancelledItemIds: Type.Array(Type.String()),
  /** Why it failed: the code, then the solver's or the validator's word. */
  failure: Type.Union([Literals(RUN_FAILURE_CODES), Type.Null()]),
  detail: Type.Union([Type.String(), Type.Null()]),
  problems: Type.Array(AllocationProblemSchema),
  publishedAt: Type.Union([Type.String(), Type.Null()]),
})
export type AllocationRun = Static<typeof AllocationRunSchema>

export const RunListResponse = StrictObject({ runs: Type.Array(AllocationRunSchema), solverConfigured: Type.Boolean() })
export type RunListResponse = Static<typeof RunListResponse>

export const RunStartedResponse = StrictObject({ run: AllocationRunSchema })
export type RunStartedResponse = Static<typeof RunStartedResponse>

export const SolverStatusResponse = StrictObject({
  configured: Type.Boolean(),
  reachable: Type.Boolean(),
  ortools: Type.Union([Type.String(), Type.Null()]),
  contract: Type.Union([Type.String(), Type.Null()]),
})
export type SolverStatusResponse = Static<typeof SolverStatusResponse>

// The review (school-core AllocationSummary and StudentExplanation, pinned in domain-checks.ts).

export const ExplainedItemSchema = StrictObject({
  itemId: Type.String(),
  source: Literals(ASSIGNMENT_SOURCES),
  rank: Type.Union([Type.Integer(), Type.Null()]),
  minutesByDate: Type.Record(Type.String(), Type.Integer()),
})
export const ExplainedDaySchema = StrictObject({ date: Type.String(), required: Type.Integer(), covered: Type.Integer(), deficit: Type.Integer() })
export const StudentExplanationSchema = StrictObject({
  personId: Type.String(),
  window: Type.Union([Type.Literal('first'), Type.Literal('late'), Type.Null()]),
  items: Type.Array(ExplainedItemSchema),
  days: Type.Array(ExplainedDaySchema),
  averageRank: Type.Union([Type.Number(), Type.Null()]),
})

export const ClassSummarySchema = StrictObject({ className: Type.String(), students: Type.Integer(), withDeficit: Type.Integer(), withFallback: Type.Integer() })
export const ItemSummarySchema = StrictObject({ itemId: Type.String(), fixed: Type.Integer(), assigned: Type.Integer(), places: Type.Integer(), minimum: Type.Integer(), cancelled: Type.Boolean() })
export const AllocationSummarySchema = StrictObject({
  students: StrictObject({ total: Type.Integer(), choosing: Type.Integer(), covered: Type.Integer(), withDeficit: Type.Integer(), withFallback: Type.Integer(), late: Type.Integer(), nonSubmitters: Type.Integer() }),
  ranks: Type.Record(Type.String(), Type.Integer()),
  classes: Type.Array(ClassSummarySchema),
  items: Type.Array(ItemSummarySchema),
  deficits: Type.Array(StrictObject({ personId: Type.String(), date: Type.String(), minutes: Type.Integer() })),
  fallbacks: Type.Array(StrictObject({ personId: Type.String(), itemId: Type.String() })),
})

export const RunReviewResponse = StrictObject({
  run: AllocationRunSchema,
  /** The catalogue, the roster or the pre-assignments changed since the run: its snapshot is not the campaign as it stands. */
  stale: Type.Boolean(),
  summary: Type.Union([AllocationSummarySchema, Type.Null()]),
  students: Type.Array(StrictObject({
    ...StudentExplanationSchema.properties,
    displayName: Type.String(),
    className: Type.String(),
    grade: Type.Integer(),
  })),
  items: Type.Array(StrictObject({ ...ItemSummarySchema.properties, title: Type.String(), number: Type.Union([Type.Integer(), Type.Null()]), feeCents: Type.Integer() })),
  /** The campaign's project days, for the columns. */
  projectDays: Type.Array(Type.String()),
})
export type RunReviewResponse = Static<typeof RunReviewResponse>
export type ReviewStudent = RunReviewResponse['students'][number]
export type ReviewItem = RunReviewResponse['items'][number]
