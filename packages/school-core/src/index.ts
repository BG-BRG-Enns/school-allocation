// The domain, pure: no I/O, no clock, no randomness (ESLint enforces it).
// The API and the web app both import from here, so they never disagree
// about what a state allows or what a choice is worth.

export {
  CAMPAIGN_STATES,
  CAMPAIGN_TRANSITIONS,
  acceptsChoices,
  isCampaignState,
  transition,
  type CampaignState,
  type TransitionResult,
} from './lifecycle.ts'

export {
  CLASS_NAME,
  GRADES,
  PERSON_KINDS,
  ROSTER_PROBLEM_CODES,
  ROSTER_CHANGED_FIELDS,
  addressesOf,
  checkEntry,
  checkRoster,
  classNameOf,
  diffRoster,
  gradeOfClass,
  isClassGroupName,
  isPersonKind,
  previousOf,
  rosterKey,
  summarizeDiff,
  type ChangedField,
  type PersonKind,
  type RosterChange,
  type RosterDiff,
  type RosterDiffSummary,
  type RosterEntry,
  type RosterProblem,
  type RosterProblemCode,
} from './roster.ts'

export {
  CSV_COLUMNS,
  CSV_LIMITS,
  CSV_PROBLEM_CODES,
  ROSTER_CSV_TEMPLATE,
  parseCsv,
  parseRosterCsv,
  type CsvProblem,
  type CsvProblemCode,
  type RosterCsvResult,
} from './roster-csv.ts'

export { SCHOOL_YEAR, isSchoolYear, retentionEndsAt, schoolYearOf, yearsOf } from './school-year.ts'

export {
  CATALOGUE_PROBLEM_CODES,
  ITEM_STATES,
  ITEM_TRANSITIONS,
  LOCAL_DATE,
  acceptsProposals,
  checkItem,
  creditedMinutesByDate,
  isEligible,
  isItemState,
  isPreAssigned,
  itemTransition,
  overlaps,
  type CatalogueProblem,
  type CatalogueProblemCode,
  type Credit,
  type ItemContext,
  type ItemInput,
  type ItemRules,
  type ItemState,
  type ItemTransitionResult,
  type SessionInput,
  type Span,
  type StudentOf,
} from './catalogue.ts'

export {
  CLOCK_TIME,
  DEFAULT_PERIODS,
  PERIOD_PROBLEM_CODES,
  checkPeriods,
  minutesOf,
  periodsOfSpan,
  spanOfPeriods,
  type Period,
  type PeriodProblemCode,
} from './periods.ts'

export { DEFAULT_PLACE_HEADROOM_PERCENT, demandByDay, placeTarget, type ClassSize, type DayDemand, type GradeDemand, type OfferedItem } from './demand.ts'

export { AVAILABILITY_STATUSES, leadOf, type AvailabilityStatus } from './planning.ts'

export {
  RANKING_PROBLEM_CODES,
  checkRanking,
  groupKeyOf,
  isComplete,
  offeredTo,
  timeGroupsOf,
  wishesRequired,
  type GroupableItem,
  type OfferableItem,
  type Ranking,
  type RankingProblem,
  type RankingProblemCode,
  type TimeGroup,
} from './choices.ts'

export {
  ALLOCATION_CONTRACT,
  ASSIGNMENT_SOURCES,
  COST_SCALE,
  SOLVE_STATUSES,
  TIE_RANGE,
  fnv1a32,
  levelNames,
  tieWeight,
  type AllocationInput,
  type AllocationItem,
  type AllocationLimits,
  type AllocationResult,
  type AllocationStudent,
  type Assignment,
  type AssignmentSource,
  type DayMinutes,
  type LevelValue,
  type Pass,
  type PassResult,
  type SolveItem,
  type SolveOption,
  type SolveRequest,
  type SolveResponse,
  type SolveStatus,
  type SolveStudent,
  type SubmissionWindow,
} from './allocation-model.ts'

export {
  ALLOCATION_INPUT_PROBLEM_CODES,
  checkAllocationInput,
  compilePass,
  fixedOverlaps,
  inPass,
  itemsOverlap,
  mayBeCancelled,
  solverMinimum,
  prepareStudent,
  prepareStudents,
  solverItems,
  type AllocationInputCheck,
  type AllocationInputProblem,
  type AllocationInputProblemCode,
  type AllocationWarning,
  type CompiledOption,
  type CompiledPass,
  type OptionKind,
  type PreparedStudent,
} from './allocation-compile.ts'

export {
  ALLOCATION_PROBLEM_CODES,
  assembleAssignments,
  cancelledOf,
  recomputeLevels,
  thresholdOf,
  validateAllocation,
  type AllocationProblem,
  type AllocationProblemCode,
} from './allocation-validate.ts'

export {
  MOVE_PROBLEM_CODES,
  applyMove,
  checkMove,
  freePlaces,
  leavesForSwap,
  moveOffers,
  type Move,
  type MoveOffer,
  type MoveOptions,
  type MoveProblem,
  type MoveProblemCode,
} from './allocation-change.ts'

export {
  explainStudent,
  summarizeAllocation,
  type AllocationSummary,
  type ClassSummary,
  type ExplainedDay,
  type ExplainedItem,
  type ItemSummary,
  type StudentExplanation,
} from './allocation-explain.ts'

/**
 * The version of the domain rules a stored result was computed with. Bumped
 * whenever a change here would give a different allocation or validation
 * for the same input; an allocation run records it (docs/domain-and-api.md).
 */
export const CORE_VERSION = 1
