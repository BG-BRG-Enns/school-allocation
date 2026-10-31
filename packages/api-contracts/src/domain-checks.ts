// Normalize interface/object spelling while preserving optional fields and unions.

import type * as Core from '@school-allocation/school-core'
import type { Static } from 'typebox'
import type { GrantBody } from './administration.ts'
import type { AllocationInputProblemSchema, AllocationProblemSchema, AllocationSummarySchema, AllocationWarningSchema, ExplainedDaySchema, ExplainedItemSchema, LevelValueSchema, RuleStandingSchema, SolveRequestSchema, SolveResponseSchema, SolveStatusSchema, StudentExplanationSchema } from './allocation.ts'
import type { CatalogueProblemCodeSchema, CatalogueProblemSchema, CreditSchema, DayDemandSchema, ItemStateSchema, RuleDemandSchema, RuleSchema } from './campaigns.ts'
import type { CreditBody, PeriodBody, RuleBody, RuleProblemSchema } from './catalogue.ts'
import type { RankingProblemCodeSchema, RankingProblemSchema, RuleReachSchema } from './choices.ts'
import type { PersonKindSchema, Role } from './common.ts'
import type { BatchDetailSchema, ChangedFieldSchema, RosterDiffSummarySchema, RosterEntrySchema, RosterProblemCodeSchema, RosterProblemSchema, StoredEntry } from './roster.ts'
import type { PeriodSchema } from './settings.ts'

type Shape<T> = T extends object ? { [K in keyof T]: Shape<T[K]> } : T
type Equal<A, B> = (<T>() => T extends Shape<A> ? 1 : 2) extends (<T>() => T extends Shape<B> ? 1 : 2) ? true : false
type Assert<T extends true> = T

/** A domain value crossing HTTP unchanged must keep exactly its core shape. */
export type DomainSchemaChecks = [
  Assert<Equal<Static<typeof GrantBody>['role'], Role>>,
  Assert<Equal<Static<typeof ItemStateSchema>, Core.ItemState>>,
  Assert<Equal<Static<typeof CreditSchema>, Core.Credit>>,
  Assert<Equal<Static<typeof CatalogueProblemCodeSchema>, Core.CatalogueProblemCode>>,
  Assert<Equal<Static<typeof CatalogueProblemSchema>, Core.CatalogueProblem>>,
  Assert<Equal<Static<typeof DayDemandSchema>, Core.DayDemand>>,
  Assert<Equal<Static<typeof RankingProblemCodeSchema>, Core.RankingProblemCode>>,
  Assert<Equal<Static<typeof RankingProblemSchema>, Core.RankingProblem>>,
  Assert<Equal<Static<typeof PersonKindSchema>, Core.PersonKind>>,
  Assert<Equal<Static<typeof RosterEntrySchema>, Core.RosterEntry>>,
  Assert<Equal<Static<typeof RosterProblemCodeSchema>, Core.RosterProblemCode>>,
  Assert<Equal<Static<typeof RosterProblemSchema>, Core.RosterProblem>>,
  Assert<Equal<Static<typeof ChangedFieldSchema>, Core.ChangedField>>,
  Assert<Equal<Static<typeof RosterDiffSummarySchema>, Core.RosterDiffSummary>>,
  Assert<Equal<Static<typeof PeriodSchema>, Core.Period>>,
  Assert<Equal<Static<typeof BatchDetailSchema>['diff'], Core.RosterDiff<StoredEntry>>>,
  Assert<Equal<Static<typeof CreditBody>, Core.Credit>>,
  Assert<Equal<Static<typeof PeriodBody>, Core.Period>>,
  Assert<Equal<Static<typeof SolveRequestSchema>, Core.SolveRequest>>,
  Assert<Equal<Static<typeof SolveResponseSchema>, Core.SolveResponse>>,
  Assert<Equal<Static<typeof SolveStatusSchema>, Core.SolveStatus>>,
  Assert<Equal<Static<typeof LevelValueSchema>, Core.LevelValue>>,
  Assert<Equal<Static<typeof AllocationProblemSchema>, Core.AllocationProblem>>,
  Assert<Equal<Static<typeof AllocationInputProblemSchema>, Core.AllocationInputProblem>>,
  Assert<Equal<Static<typeof AllocationWarningSchema>, Core.AllocationWarning>>,
  Assert<Equal<Static<typeof ExplainedItemSchema>, Core.ExplainedItem>>,
  Assert<Equal<Static<typeof ExplainedDaySchema>, Core.ExplainedDay>>,
  Assert<Equal<Static<typeof StudentExplanationSchema>, Core.StudentExplanation>>,
  Assert<Equal<Static<typeof AllocationSummarySchema>, Core.AllocationSummary>>,
  Assert<Equal<Static<typeof RuleSchema>, Core.CampaignRule>>,
  Assert<Equal<Static<typeof RuleBody>, Omit<Core.CampaignRule, 'id'>>>,
  Assert<Equal<Static<typeof RuleProblemSchema>, Core.RuleProblem>>,
  Assert<Equal<Static<typeof RuleStandingSchema>, Core.RuleStanding>>,
  Assert<Equal<Static<typeof RuleReachSchema>, Core.RuleReach>>,
  Assert<Equal<Static<typeof RuleDemandSchema>, Core.RuleDemand>>,
]

// Guard against weakening this check to one-way structural assignability.
// @ts-expect-error An extra optional field must be detected.
export type AddedFieldIsRejected = Assert<Equal<Core.Period & { extra?: string }, Core.Period>>
// @ts-expect-error Making a required field optional must be detected.
export type OptionalFieldIsRejected = Assert<Equal<Partial<Core.Period>, Core.Period>>
