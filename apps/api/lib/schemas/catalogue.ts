// What the campaign and item routes accept: shapes and bounds. The rules
// (sessions on project days, places against the minimum, who may rank)
// are school-core's checkItem, applied after these.

import { Type } from 'typebox'
import { CLASS_NAME, GRADES } from '@school-allocation/school-core'
import { MultiLineText, SingleLineText, StrictObject, Uuid } from './common.ts'

export const LocalDate = Type.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' })
const ClassName = Type.String({ pattern: CLASS_NAME.source, maxLength: 16 })
const Grade = Type.Integer({ minimum: GRADES.min, maximum: GRADES.max })
/** An ISO 8601 instant with an offset or Z, as the browser sends a chosen time. */
const Instant = Type.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$' })

export const CampaignBody = StrictObject({
  kind: Type.Literal('project_week'),
  name: SingleLineText(200),
  schoolYear: Type.String({ pattern: '^[0-9]{4}/[0-9]{2}$' }),
  projectDays: Type.Array(LocalDate, { minItems: 1, maxItems: 10 }),
})

const InstantOrNull = Type.Union([Instant, Type.Null()])

export const CampaignChangesBody = StrictObject({
  name: SingleLineText(200),
  schoolYear: Type.String({ pattern: '^[0-9]{4}/[0-9]{2}$' }),
  projectDays: Type.Array(LocalDate, { minItems: 1, maxItems: 10 }),
  // The window and what it asks (D-05, D-06, D-13); left out, a setting stays.
  opensAt: Type.Optional(InstantOrNull),
  closesAt: Type.Optional(InstantOrNull),
  lateUntil: Type.Optional(InstantOrNull),
  swapFrom: Type.Optional(InstantOrNull),
  swapUntil: Type.Optional(InstantOrNull),
  wishesPerGroup: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  /** Grade → minutes a day must credit at least; a grade left out has no minimum. */
  dailyMinimum: Type.Optional(Type.Record(Type.String({ pattern: '^([1-9]|1[0-3])$' }), Type.Integer({ minimum: 0, maximum: 24 * 60 }), { maxProperties: 13, additionalProperties: false })),
  showTeachers: Type.Optional(Type.Boolean()),
})

export const PeriodBody = StrictObject({
  period: Type.Integer({ minimum: 1, maximum: 20 }),
  starts: Type.String({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' }),
  ends: Type.String({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' }),
})
export const PeriodsBody = StrictObject({ periods: Type.Array(PeriodBody, { maxItems: 20 }) })

/** Why a grid was refused: school-core's codes. */
export const PeriodsInvalidResponse = StrictObject({ error: Type.Literal('period_grid_invalid'), problems: Type.Array(Type.String()) })

export const ClassTeachersBody = StrictObject({ teachers: Type.Array(Uuid, { maxItems: 4 }) })
export const ClassParams = StrictObject({ className: Type.String({ pattern: CLASS_NAME.source, maxLength: 16 }) })

export const TransitionBody = StrictObject({
  to: Type.Union([Type.Literal('catalogue'), Type.Literal('published')]),
})

export const CreditBody = StrictObject({
  date: LocalDate,
  minutes: Type.Integer({ minimum: 0, maximum: 24 * 60 }),
})

export const SessionBody = StrictObject({
  startsAt: Instant,
  endsAt: Instant,
  location: Type.Optional(SingleLineText(200)),
  credits: Type.Array(CreditBody, { minItems: 1, maxItems: 10 }),
})

export const ItemBody = StrictObject({
  title: SingleLineText(200),
  description: Type.Optional(MultiLineText(4000)),
  location: Type.Optional(SingleLineText(200)),
  feeCents: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 })),
  feeNote: Type.Optional(MultiLineText(500)),
  places: Type.Integer({ minimum: 0, maximum: 1000 }),
  minParticipants: Type.Optional(Type.Integer({ minimum: 0, maximum: 1000 })),
  cancellableBelowMin: Type.Optional(Type.Boolean()),
  fixedClasses: Type.Optional(Type.Array(ClassName, { maxItems: 40 })),
  eligibleGrades: Type.Optional(Type.Array(Grade, { maxItems: 13 })),
  eligibleClasses: Type.Optional(Type.Array(ClassName, { maxItems: 40 })),
  teachers: Type.Array(Uuid, { maxItems: 8 }),
  sessions: Type.Array(SessionBody, { maxItems: 10 }),
})

export const NoteBody = StrictObject({ note: MultiLineText(1000, 1) })
export const ReasonBody = StrictObject({ reason: SingleLineText(500) })

/** Why an activity was refused: the rules it breaks (school-core's codes) and the teachers the roster does not know. */
export const ItemInvalidResponse = StrictObject({
  error: Type.Literal('item_invalid'),
  problems: Type.Array(StrictObject({ code: Type.String(), session: Type.Optional(Type.Integer()) })),
  unknownTeachers: Type.Array(Type.String()),
})
