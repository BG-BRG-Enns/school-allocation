// The retention purge (docs/open-decisions.md D-15; mvp-plan S5c): the
// school years with their records and when their retention ends, and the
// administrator's purge of one.

import { SCHOOL_YEAR } from '@school-allocation/school-core'
import { Type, type Static } from 'typebox'
import { Reason, StrictObject } from './common.ts'

export const RetentionYearSchema = StrictObject({
  schoolYear: Type.String(),
  campaigns: Type.Array(StrictObject({ id: Type.String(), name: Type.String(), state: Type.String() })),
  /** The roster batches of the year; those a campaign of another year goes by stay. */
  batches: Type.Integer(),
  classTeachers: Type.Integer(),
  /** When the year's records may go (D-15: a year after the school year's end). */
  retentionEndsAt: Type.String(),
  reached: Type.Boolean(),
})
export type RetentionYear = Static<typeof RetentionYearSchema>

export const RetentionResponse = StrictObject({ years: Type.Array(RetentionYearSchema) })
export type RetentionResponse = Static<typeof RetentionResponse>

export const PurgeBody = StrictObject({ schoolYear: Type.String({ pattern: SCHOOL_YEAR.source }), reason: Reason })

export const PurgedResponse = StrictObject({
  schoolYear: Type.String(),
  /** What went, per relation, in the order it went. */
  removed: Type.Array(StrictObject({ relation: Type.String(), count: Type.Integer() })),
})
export type PurgedResponse = Static<typeof PurgedResponse>
