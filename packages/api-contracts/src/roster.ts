// Shared HTTP shapes. Types are derived from the schemas used by Fastify.

import { CLASS_NAME, CSV_LIMITS, GRADES, ROSTER_CHANGED_FIELDS, ROSTER_PROBLEM_CODES } from '@school-allocation/school-core'
import { Type, type Static } from 'typebox'
import { Literals, PersonKindSchema, SingleLineText, StrictObject, Uuid } from './common.ts'

export type { PersonKind } from '@school-allocation/school-core'

export const RosterEntrySchema = StrictObject({
  kind: PersonKindSchema,
  oid: Type.Optional(Type.String()),
  upn: Type.Optional(Type.String()),
  mail: Type.Optional(Type.String()),
  displayName: Type.String(),
  className: Type.Optional(Type.String()),
  grade: Type.Optional(Type.Number()),
  classTeacherMail: Type.Optional(Type.String()),
})
export type { RosterEntry } from '@school-allocation/school-core'

export const RosterProblemCodeSchema = Literals(ROSTER_PROBLEM_CODES)
export type { RosterProblemCode } from '@school-allocation/school-core'

export const RosterProblemSchema = StrictObject({
  code: RosterProblemCodeSchema,
  key: Type.Optional(Type.String()),
  line: Type.Optional(Type.Number()),
})
export type { RosterProblem } from '@school-allocation/school-core'

export const ChangedFieldSchema = Literals(ROSTER_CHANGED_FIELDS)
export type { ChangedField } from '@school-allocation/school-core'

export const RosterDiffSummarySchema = StrictObject({
  added: Type.Number(),
  removed: Type.Number(),
  changed: Type.Number(),
  unchanged: Type.Number(),
})
export type { RosterDiffSummary } from '@school-allocation/school-core'

export const BatchStateSchema = Type.Union([Type.Literal('pending'), Type.Literal('committed'), Type.Literal('discarded'), Type.Literal('rejected')])
export type BatchState = Static<typeof BatchStateSchema>

export const BatchSchema = StrictObject({
  id: Type.String(),
  source: Type.Union([Type.Literal('graph:groups'), Type.Literal('csv')]),
  state: BatchStateSchema,
  schoolYear: Type.String(),
  fetchedAt: Type.String(),
  rowCount: Type.Number(),
  triggeredBy: Type.String(),
  previousBatchId: Type.Union([Type.String(), Type.Null()]),
  summary: RosterDiffSummarySchema,
  problems: Type.Array(RosterProblemSchema),
  warnings: Type.Array(StrictObject({
    code: Type.String(),
    key: Type.String(),
  })),
  decidedAt: Type.Union([Type.String(), Type.Null()]),
})
export type Batch = Static<typeof BatchSchema>

export const StoredEntrySchema = StrictObject({
  ...RosterEntrySchema.properties,
  id: Type.String(),
  personId: Type.Union([Type.String(), Type.Null()]),
})
export type StoredEntry = Static<typeof StoredEntrySchema>

export const BatchDetailSchema = StrictObject({
  ...BatchSchema.properties,
  diff: StrictObject({ added: Type.Array(StoredEntrySchema), removed: Type.Array(StoredEntrySchema), changed: Type.Array(StrictObject({ key: Type.String(), before: StoredEntrySchema, after: StoredEntrySchema, fields: Type.Array(ChangedFieldSchema) })), unchanged: Type.Number() }),
})
export type BatchDetail = Static<typeof BatchDetailSchema>

export const RosterGroupSchema = StrictObject({
  groupId: Type.String(),
  label: Type.String(),
  kind: PersonKindSchema,
  className: Type.Optional(Type.String()),
  grade: Type.Optional(Type.Number()),
})
export type RosterGroup = Static<typeof RosterGroupSchema>

export const RosterOverviewSchema = StrictObject({
  current: Type.Union([BatchSchema, Type.Null()]),
  groups: Type.Array(RosterGroupSchema),
  batches: Type.Array(BatchSchema),
  suggestedSchoolYear: Type.String(),
  graphScopes: Type.Array(Type.String()),
})
export type RosterOverview = Static<typeof RosterOverviewSchema>

export const RosterPersonSchema = StrictObject({
  personId: Type.String(),
  displayName: Type.String(),
  kind: PersonKindSchema,
  className: Type.Union([Type.String(), Type.Null()]),
  grade: Type.Union([Type.Number(), Type.Null()]),
  mail: Type.Union([Type.String(), Type.Null()]),
  account: Type.Union([Type.String(), Type.Null()]),
})
export type RosterPerson = Static<typeof RosterPersonSchema>

export const GraphGroupSchema = StrictObject({
  id: Type.String(),
  displayName: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
})
export type GraphGroup = Static<typeof GraphGroupSchema>

export const GroupsResponse = StrictObject({ groups: Type.Array(RosterGroupSchema) })
export type GroupsResponse = Static<typeof GroupsResponse>

export const GraphGroupsResponse = StrictObject({ groups: Type.Array(GraphGroupSchema) })
export type GraphGroupsResponse = Static<typeof GraphGroupsResponse>

export const PersonsResponse = StrictObject({ persons: Type.Array(RosterPersonSchema) })
export type PersonsResponse = Static<typeof PersonsResponse>

export const SchoolYear = Type.String({ pattern: '^[0-9]{4}/[0-9]{2}$' })

export const GroupInput = StrictObject({
  groupId: Uuid,
  label: SingleLineText(200),
  kind: PersonKindSchema,
  className: Type.Optional(Type.String({ pattern: CLASS_NAME.source, maxLength: 16 })),
  grade: Type.Optional(Type.Integer({ minimum: GRADES.min, maximum: GRADES.max })),
})

export const GroupsBody = StrictObject({ groups: Type.Array(GroupInput, { maxItems: 200 }) })

export const CsvBody = StrictObject({
  csv: Type.String({ minLength: 1, maxLength: CSV_LIMITS.rows * (CSV_LIMITS.field + 1) * 8 }),
  schoolYear: SchoolYear,
})

export const GraphStartQuery = StrictObject({
  schoolYear: Type.Optional(SchoolYear),
  purpose: Type.Optional(Type.Union([Type.Literal('refresh'), Type.Literal('picker')])),
})

export /** Either a prefix to search for, or `classes=true` for every group named after a class. */
const GroupsQuery = StrictObject({ q: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })), classes: Type.Optional(Type.Literal('true')) })

export // Not strict: Entra adds parameters of its own. Only these are read.
const GraphCallbackQuery = Type.Object({
  code: Type.Optional(Type.String({ maxLength: 8192 })),
  state: Type.Optional(Type.String({ maxLength: 512 })),
  error: Type.Optional(Type.String({ maxLength: 512 })),
})

export const PersonsQuery = StrictObject({ q: Type.Optional(Type.String({ maxLength: 100 })) })
