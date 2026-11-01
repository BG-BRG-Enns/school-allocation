// Shared HTTP shapes. Types are derived from the schemas used by Fastify.

import { CAMPAIGN_STATES, CATALOGUE_PROBLEM_CODES, ITEM_STATES, RULE_UNITS } from '@school-allocation/school-core'
import { Type, type Static } from 'typebox'
import { Literals, StrictObject } from './common.ts'

export const ItemStateSchema = Literals(ITEM_STATES)
export type { CatalogueProblem, CatalogueProblemCode, Credit, DayDemand, ItemState } from '@school-allocation/school-core'

export const CreditSchema = StrictObject({
  date: Type.String(),
  minutes: Type.Number(),
})

export const CatalogueProblemCodeSchema = Literals(CATALOGUE_PROBLEM_CODES)

export const CatalogueProblemSchema = StrictObject({
  code: CatalogueProblemCodeSchema,
  session: Type.Optional(Type.Number()),
})

/** What a registration asks of whom per category (school-core CampaignRule). */
export const RuleSchema = StrictObject({
  id: Type.String(),
  categoryId: Type.String(),
  grades: Type.Array(Type.Number()),
  classes: Type.Array(Type.String()),
  unit: Literals(RULE_UNITS),
  minimum: Type.Number(),
})

export const CampaignWindowSchema = StrictObject({
  opensAt: Type.Union([Type.String(), Type.Null()]),
  closesAt: Type.Union([Type.String(), Type.Null()]),
  lateUntil: Type.Union([Type.String(), Type.Null()]),
  swapFrom: Type.Union([Type.String(), Type.Null()]),
  swapUntil: Type.Union([Type.String(), Type.Null()]),
  wishesPerGroup: Type.Number(),
  dailyMinimum: Type.Record(Type.String(), Type.Number()),
  showTeachers: Type.Boolean(),
  reminderDays: Type.Number(),
  /** How many places beyond the need a day should offer a grade, in percent (school-core placeTarget). */
  placeHeadroomPercent: Type.Number(),
  /** The rules per category, in the order the organizer set them. */
  rules: Type.Array(RuleSchema),
})
export type CampaignWindow = Static<typeof CampaignWindowSchema>

export const CampaignSchema = StrictObject({
  ...CampaignWindowSchema.properties,
  id: Type.String(),
  kind: Literals(['project_week', 'wpf'] as const),
  name: Type.String(),
  schoolYear: Type.String(),
  state: Literals(CAMPAIGN_STATES),
  projectDays: Type.Array(Type.String()),
  rosterBatchId: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})
export type Campaign = Static<typeof CampaignSchema>

export const CampaignCountsSchema = StrictObject({
  draft: Type.Number(),
  proposed: Type.Number(),
  approved: Type.Number(),
  withdrawn: Type.Number(),
})
export type CampaignCounts = Static<typeof CampaignCountsSchema>

export const CampaignViewSchema = StrictObject({
  campaign: CampaignSchema,
  counts: Type.Union([CampaignCountsSchema, Type.Null()]),
  may: StrictObject({
    propose: Type.Boolean(),
    organize: Type.Boolean(),
    seeDemand: Type.Boolean(),
    classTeacherOf: Type.Array(Type.String()),
  }),
})
export type CampaignView = Static<typeof CampaignViewSchema>

export const DayDemandSchema = StrictObject({
  date: Type.String(),
  grades: Type.Array(StrictObject({
    grade: Type.Number(),
    students: Type.Number(),
    fixed: Type.Number(),
    needing: Type.Number(),
    offered: Type.Number(),
  })),
})

export const ItemSchema = StrictObject({
  id: Type.String(),
  campaignId: Type.String(),
  number: Type.Union([Type.Number(), Type.Null()]),
  title: Type.String(),
  description: Type.String(),
  location: Type.String(),
  feeCents: Type.Number(),
  feeNote: Type.String(),
  places: Type.Number(),
  minParticipants: Type.Number(),
  cancellableBelowMin: Type.Boolean(),
  fixedClasses: Type.Array(Type.String()),
  eligibleGrades: Type.Array(Type.Number()),
  eligibleClasses: Type.Array(Type.String()),
  state: ItemStateSchema,
  reviewNote: Type.String(),
  proposedBy: StrictObject({
    id: Type.String(),
    displayName: Type.String(),
    /** Their person in the roster, by their account's binding: who leads when among the teachers. */
    personId: Type.Union([Type.String(), Type.Null()]),
  }),
  teachers: Type.Array(StrictObject({
    personId: Type.String(),
    displayName: Type.String(),
    /** Whether they lead the activity (school-core leadOf); the others accompany. */
    lead: Type.Boolean(),
  })),
  sessions: Type.Array(StrictObject({
    id: Type.String(),
    startsAt: Type.String(),
    endsAt: Type.String(),
    location: Type.String(),
    credits: Type.Array(CreditSchema),
  })),
  /** The school's categories it belongs to, by id. */
  categoryIds: Type.Array(Type.String()),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  approvedAt: Type.Union([Type.String(), Type.Null()]),
  withdrawnAt: Type.Union([Type.String(), Type.Null()]),
  withdrawReason: Type.Union([Type.String(), Type.Null()]),
})
export type Item = Static<typeof ItemSchema>

export const CampaignListResponse = StrictObject({ campaigns: Type.Array(CampaignSchema) })
export type CampaignListResponse = Static<typeof CampaignListResponse>

export const ItemsResponse = StrictObject({ items: Type.Array(ItemSchema) })
export type ItemsResponse = Static<typeof ItemsResponse>

export const CatalogueResponse = StrictObject({ campaign: CampaignSchema, items: Type.Array(ItemSchema) })
export type CatalogueResponse = Static<typeof CatalogueResponse>

/** A rule for one grade before any list (school-core ruleDemand): the need left after class activities against the category's places. */
export const RuleDemandSchema = StrictObject({ ruleId: Type.String(), grade: Type.Number(), students: Type.Number(), needed: Type.Number(), offered: Type.Number() })

export const DemandResponse = StrictObject({ demand: Type.Array(DayDemandSchema), rules: Type.Array(RuleDemandSchema) })
export type DemandResponse = Static<typeof DemandResponse>

export const RosterClassesResponse = StrictObject({ classes: Type.Array(StrictObject({ className: Type.String(), grade: Type.Number() })) })
export type RosterClassesResponse = Static<typeof RosterClassesResponse>

export const TeachersResponse = StrictObject({ teachers: Type.Array(StrictObject({ personId: Type.String(), displayName: Type.String(), shortName: Type.Union([Type.String(), Type.Null()]) })) })
export type TeachersResponse = Static<typeof TeachersResponse>

export type ItemInvalidBody = Static<typeof import('./catalogue.ts').ItemInvalidResponse>
