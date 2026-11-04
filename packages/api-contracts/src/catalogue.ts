// What the campaign and item routes accept: shapes and bounds. The rules
// (sessions on project days, places against the minimum, who may rank)
// are school-core's checkItem, applied after these.

import { CLASS_NAME, GRADES, MAX_RULES, RULE_LIMITS, RULE_PROBLEM_CODES, RULE_UNITS } from '@school-allocation/school-core'
import { Type, type Static } from 'typebox'
import { CatalogueProblemSchema, DayDemandSchema } from './campaigns.ts'
import { Literals, MultiLineText, SingleLineText, StrictObject, Uuid } from './common.ts'

export const LocalDate = Type.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' })
const ClassName = Type.String({ pattern: CLASS_NAME.source, maxLength: 16 })
const Grade = Type.Integer({ minimum: GRADES.min, maximum: GRADES.max })
/** An ISO 8601 instant with an offset or Z, as the browser sends a chosen time. */
const Instant = Type.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$' })

/** The classes a registration is for; a whole school has a few dozen. Empty is allowed: nobody is in, and the page says so before publishing. */
const ClassList = Type.Array(ClassName, { maxItems: 100 })

/** An attendance frame as sent: the first and the last period of the grid everyone is at school in; school-core checkFrame holds it to the grid. */
export const FrameBody = StrictObject({ from: Type.Integer({ minimum: 1, maximum: 20 }), to: Type.Integer({ minimum: 1, maximum: 20 }) })
/** The frames by project day (YYYY-MM-DD); a day named here must be one of the registration's. */
const Frames = Type.Record(Type.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }), FrameBody, { maxProperties: 10, additionalProperties: false })

export const CampaignBody = StrictObject({
  kind: Type.Literal('project_week'),
  name: SingleLineText(200),
  schoolYear: Type.String({ pattern: '^[0-9]{4}/[0-9]{2}$' }),
  projectDays: Type.Array(LocalDate, { minItems: 1, maxItems: 10 }),
  /** The classes taking part; left out, every class of the class lists in force. */
  classes: Type.Optional(ClassList),
  /** The attendance frame per project day; a day left out has none. */
  frames: Type.Optional(Frames),
})

/** Why a class was not taken out of a registration: an activity or a rule of it still names these classes. */
export const ClassInUseResponse = StrictObject({ error: Type.Literal('class_in_use'), classes: Type.Array(Type.String()) })

const InstantOrNull = Type.Union([Instant, Type.Null()])

/** A rule as the settings send it (school-core CampaignRule without its id); checkRules holds it to the school's categories. */
export const RuleBody = StrictObject({
  categoryId: Uuid,
  grades: Type.Array(Grade, { minItems: 1, maxItems: 13 }),
  /** Limits it to these classes of the grades; empty for every class. */
  classes: Type.Array(ClassName, { maxItems: 40 }),
  unit: Literals(RULE_UNITS),
  minimum: Type.Integer({ minimum: 1, maximum: Math.max(...Object.values(RULE_LIMITS)) }),
})

/** Why a list of rules was refused: school-core's codes, with the rule's position. */
export const RuleProblemSchema = StrictObject({ code: Literals(RULE_PROBLEM_CODES), rule: Type.Optional(Type.Integer()) })
export const RulesInvalidResponse = StrictObject({ error: Type.Literal('rules_invalid'), problems: Type.Array(RuleProblemSchema) })

export const CampaignChangesBody = StrictObject({
  name: SingleLineText(200),
  schoolYear: Type.String({ pattern: '^[0-9]{4}/[0-9]{2}$' }),
  projectDays: Type.Array(LocalDate, { minItems: 1, maxItems: 10 }),
  /** The classes taking part, replacing the list; left out, it stays. Changed while the registration is set up or takes proposals. */
  classes: Type.Optional(ClassList),
  /** The attendance frames by project day, replacing them; left out, the days that stay keep theirs. Changed until the window opens. */
  frames: Type.Optional(Frames),
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
  /** Days before a close the reminder goes out; 0 for none. */
  reminderDays: Type.Optional(Type.Integer({ minimum: 0, maximum: 14 })),
  /** Places beyond the need the demand aims for, in percent. */
  placeHeadroomPercent: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  /** Whether new offers are locked once their cells have reached the target. */
  lockNewOffers: Type.Optional(Type.Boolean()),
  /** What the registration asks per category; the list replaces the one before. */
  rules: Type.Optional(Type.Array(RuleBody, { maxItems: MAX_RULES })),
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
  to: Type.Union([Type.Literal('draft'), Type.Literal('catalogue'), Type.Literal('published'), Type.Literal('open'), Type.Literal('closed'), Type.Literal('archived')]),
})

/** What the deletion of a registration in preparation removed, per relation. */
export const CampaignDeletedResponse = StrictObject({ removed: Type.Array(StrictObject({ relation: Type.String(), count: Type.Integer() })) })
export type CampaignDeletedResponse = Static<typeof CampaignDeletedResponse>

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
  /** The school's categories it belongs to; left out, it keeps the ones it has. */
  categories: Type.Optional(Type.Array(Uuid, { maxItems: 10 })),
})

/** A cell an activity would serve, judged against the demand without it (school-core GateCell). */
export const GateCellSchema = StrictObject({ date: Type.String(), period: Type.Union([Type.Number(), Type.Null()]), grade: Type.Number(), needing: Type.Number(), target: Type.Number(), offered: Type.Number(), reached: Type.Boolean() })
export type GateCellView = Static<typeof GateCellSchema>

/** A class activity's conflict with another: the class, the other activity with its lead, and the span they share. */
export const ClassConflictSchema = StrictObject({
  className: Type.String(),
  itemId: Type.String(),
  title: Type.String(),
  lead: StrictObject({ displayName: Type.String(), shortName: Type.Union([Type.String(), Type.Null()]) }),
  startsAt: Type.String(),
  endsAt: Type.String(),
})
export type ClassConflictView = Static<typeof ClassConflictSchema>

/** What a submission would meet: the activity as the form holds it, a stored one by id, or both (the form's shape judged as that stored activity's resubmission). */
export const ItemCheckBody = StrictObject({ item: Type.Optional(ItemBody), itemId: Type.Optional(Uuid) })
export type ItemCheckBody = Static<typeof ItemCheckBody>

/** The answer: the demand without and with the activity, every cell it serves, the cells the gate judges (a resubmission's by what it adds; none when nothing was), whether a teacher's submission would be refused, whether the registration locks new offers, and its class conflicts. */
export const ItemCheckResponse = StrictObject({
  before: Type.Array(DayDemandSchema),
  after: Type.Array(DayDemandSchema),
  served: Type.Array(GateCellSchema),
  cells: Type.Array(GateCellSchema),
  refused: Type.Boolean(),
  locked: Type.Boolean(),
  conflicts: Type.Array(ClassConflictSchema),
})
export type ItemCheckResponse = Static<typeof ItemCheckResponse>

export const ClassConflictResponse = StrictObject({ error: Type.Literal('class_conflict'), conflicts: Type.Array(ClassConflictSchema) })
export const TargetReachedResponse = StrictObject({ error: Type.Literal('target_reached'), cells: Type.Array(GateCellSchema) })

export const NoteBody = StrictObject({ note: MultiLineText(1000, 1) })
export const ReasonBody = StrictObject({ reason: SingleLineText(500) })

/** Why an activity was refused: the rules it breaks (school-core's codes) and the teachers the roster does not know. */
export const ItemInvalidResponse = StrictObject({
  error: Type.Literal('item_invalid'),
  problems: Type.Array(CatalogueProblemSchema),
  unknownTeachers: Type.Array(Type.String()),
})

export type ItemInput = import('typebox').Static<typeof ItemBody>
export type SessionInput = import('typebox').Static<typeof SessionBody>
export type CampaignChanges = import('typebox').Static<typeof CampaignChangesBody>
export type RuleInput = import('typebox').Static<typeof RuleBody>

export const TeachersQuery = StrictObject({ q: Type.Optional(Type.String({ maxLength: 100 })) })
