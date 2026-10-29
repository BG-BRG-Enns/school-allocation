// Shared HTTP shapes. Types are derived from the schemas used by Fastify.

import { RANKING_PROBLEM_CODES } from '@school-allocation/school-core'
import { Type, type Static } from 'typebox'
import { CampaignSchema, ItemSchema, ItemStateSchema } from './campaigns.ts'
import { Literals, StrictObject } from './common.ts'

export const RankingProblemCodeSchema = Literals(RANKING_PROBLEM_CODES)
export type { RankingProblemCode } from '@school-allocation/school-core'

export const RankingProblemSchema = StrictObject({
  code: RankingProblemCodeSchema,
  group: Type.Optional(Type.String()),
})
export type { RankingProblem } from '@school-allocation/school-core'

export const ChoiceStateSchema = Type.Union([Type.Literal('none'), Type.Literal('incomplete'), Type.Literal('complete')])
export type ChoiceState = Static<typeof ChoiceStateSchema>

export const CampaignStudentSchema = StrictObject({
  personId: Type.String(),
  displayName: Type.String(),
  className: Type.String(),
  grade: Type.Number(),
  address: Type.Union([Type.String(), Type.Null()]),
})
export type CampaignStudent = Static<typeof CampaignStudentSchema>

export const ClassStatusSchema = StrictObject({
  className: Type.String(),
  students: Type.Array(StrictObject({
    ...CampaignStudentSchema.properties,
    personId: Type.String(),
    displayName: Type.String(),
    choice: Type.Union([ChoiceStateSchema, Type.Null()]),
    window: Type.Union([Type.Literal('first'), Type.Literal('late'), Type.Null()]),
  })),
  classActivities: Type.Array(StrictObject({
    id: Type.String(),
    title: Type.String(),
    state: ItemStateSchema,
    sessions: Type.Array(StrictObject({
      startsAt: Type.String(),
      endsAt: Type.String(),
    })),
  })),
})
export type ClassStatus = Static<typeof ClassStatusSchema>

export const GroupViewSchema = StrictObject({
  startMs: Type.Number(),
  endMs: Type.Number(),
  itemIds: Type.Array(Type.String()),
  key: Type.String(),
  startsAt: Type.String(),
  endsAt: Type.String(),
  items: Type.Array(ItemSchema),
  required: Type.Number(),
})
export type GroupView = Static<typeof GroupViewSchema>

export const ChoiceViewSchema = StrictObject({
  campaign: CampaignSchema,
  fixed: Type.Array(ItemSchema),
  groups: Type.Array(GroupViewSchema),
  ranking: Type.Record(Type.String(), Type.Array(Type.String())),
  window: Type.Union([Type.Literal('first'), Type.Literal('late'), Type.Null()]),
  version: Type.Number(),
  cap: Type.Number(),
  complete: Type.Boolean(),
  acceptsChoices: Type.Boolean(),
  student: StrictObject({
    personId: Type.String(),
    displayName: Type.String(),
    className: Type.String(),
    grade: Type.Number(),
  }),
})
export type ChoiceView = Static<typeof ChoiceViewSchema>

export const MissingStudentSchema = StrictObject({
  personId: Type.String(),
  displayName: Type.String(),
  className: Type.String(),
  grade: Type.Number(),
  address: Type.Union([Type.String(), Type.Null()]),
  state: ChoiceStateSchema,
  window: Type.Union([Type.Literal('first'), Type.Literal('late'), Type.Null()]),
  updatedAt: Type.Union([Type.String(), Type.Null()]),
  mails: Type.Array(StrictObject({
    kind: Type.String(),
    state: Type.String(),
    createdAt: Type.String(),
  })),
})
export type MissingStudent = Static<typeof MissingStudentSchema>

export const MissingResponse = StrictObject({ students: Type.Array(MissingStudentSchema) })
export type MissingResponse = Static<typeof MissingResponse>

export type RankingInvalidBody = Static<typeof import('./window.ts').RankingInvalidResponse>
