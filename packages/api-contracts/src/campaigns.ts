// Shared HTTP shapes. Types are derived from the schemas used by Fastify.

import { CAMPAIGN_STATES, CATALOGUE_PROBLEM_CODES, ITEM_STATES } from '@school-allocation/school-core'
import { Type, type Static } from 'typebox'
import { Literals, StrictObject } from './common.ts'

export const ItemStateSchema = Literals(ITEM_STATES)
export type ItemState = Static<typeof ItemStateSchema>

export const CreditSchema = StrictObject({
  date: Type.String(),
  minutes: Type.Number(),
})
export type Credit = Static<typeof CreditSchema>

export const CatalogueProblemCodeSchema = Literals(CATALOGUE_PROBLEM_CODES)
export type CatalogueProblemCode = Static<typeof CatalogueProblemCodeSchema>

export const CatalogueProblemSchema = StrictObject({
  code: CatalogueProblemCodeSchema,
  session: Type.Optional(Type.Number()),
})
export type CatalogueProblem = Static<typeof CatalogueProblemSchema>

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
export type DayDemand = Static<typeof DayDemandSchema>

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
  }),
  teachers: Type.Array(StrictObject({
    personId: Type.String(),
    displayName: Type.String(),
  })),
  sessions: Type.Array(StrictObject({
    id: Type.String(),
    startsAt: Type.String(),
    endsAt: Type.String(),
    location: Type.String(),
    credits: Type.Array(CreditSchema),
  })),
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

export const DemandResponse = StrictObject({ demand: Type.Array(DayDemandSchema) })
export type DemandResponse = Static<typeof DemandResponse>

export const RosterClassesResponse = StrictObject({ classes: Type.Array(StrictObject({ className: Type.String(), grade: Type.Number() })) })
export type RosterClassesResponse = Static<typeof RosterClassesResponse>

export const TeachersResponse = StrictObject({ teachers: Type.Array(StrictObject({ personId: Type.String(), displayName: Type.String() })) })
export type TeachersResponse = Static<typeof TeachersResponse>

export type ItemInvalidBody = Static<typeof import('./catalogue.ts').ItemInvalidResponse>
