// Planning with teachers: a teacher's availability on the project days, and
// the organizer's overview of who leads and accompanies what on each day.

import { AVAILABILITY_CSV_PROBLEM_CODES, AVAILABILITY_STATUSES } from '@school-allocation/school-core'
import { Type, type Static } from 'typebox'
import { LocalDate } from './catalogue.ts'
import { Literals, StrictObject, Uuid } from './common.ts'
import { CsvFileProblemSchema, TeacherListBody } from './settings.ts'

export type { AvailabilityStatus } from '@school-allocation/school-core'

export const AvailabilityStatusSchema = Literals(AVAILABILITY_STATUSES)

export const AvailabilityBody = StrictObject({ status: AvailabilityStatusSchema })
export type AvailabilityBody = Static<typeof AvailabilityBody>

export const DateParams = StrictObject({ date: LocalDate })
export const PersonDateParams = StrictObject({ id: Uuid, personId: Uuid, date: LocalDate })

/** A teacher's own days: the project days of the registrations taking proposals, with their status there. */
export const MyAvailabilityResponse = StrictObject({
  days: Type.Array(StrictObject({
    date: Type.String(),
    status: AvailabilityStatusSchema,
    /** The registrations with this project day. */
    campaigns: Type.Array(StrictObject({ id: Type.String(), name: Type.String() })),
  })),
})
export type MyAvailabilityResponse = Static<typeof MyAvailabilityResponse>

/** For the activity form: who of the teachers is not plainly available on which of the registration's days. */
export const CampaignAvailabilityResponse = StrictObject({
  limited: Type.Array(StrictObject({ personId: Type.String(), date: Type.String(), status: Literals(['unavailable', 'if_needed'] as const) })),
})
export type CampaignAvailabilityResponse = Static<typeof CampaignAvailabilityResponse>

const PlannedItem = StrictObject({ id: Type.String(), number: Type.Union([Type.Number(), Type.Null()]), title: Type.String() })

/**
 * The organizer's overview: every teacher of the roster and every one an
 * activity names, per project day their availability and the activities
 * they lead and accompany there.
 */
export const PlanningResponse = StrictObject({
  /** The registration's name: the page reads no campaign view, which the read-only role does not get before the catalogue is out. */
  name: Type.String(),
  days: Type.Array(Type.String()),
  teachers: Type.Array(StrictObject({
    personId: Type.String(),
    displayName: Type.String(),
    /** The abbreviation and the note, once imported (teacher_detail). */
    shortName: Type.Union([Type.String(), Type.Null()]),
    note: Type.Union([Type.String(), Type.Null()]),
    days: Type.Array(StrictObject({
      date: Type.String(),
      status: AvailabilityStatusSchema,
      leads: Type.Array(PlannedItem),
      accompanies: Type.Array(PlannedItem),
    })),
  })),
  /** Whether availability may still change here: until the registration is archived. */
  editable: Type.Boolean(),
})
export type PlanningResponse = Static<typeof PlanningResponse>

/** An availability list as uploaded: the CSV's text. */
export const AvailabilityImportBody = TeacherListBody
export type AvailabilityImportBody = Static<typeof AvailabilityImportBody>

/** Why a row of an availability list is not applied: school-core's reading problems, and what the registration does not know. */
export const AVAILABILITY_IMPORT_PROBLEM_CODES = [...AVAILABILITY_CSV_PROBLEM_CODES, 'teacher_unknown', 'key_conflict'] as const
export type AvailabilityImportProblemCode = typeof AVAILABILITY_IMPORT_PROBLEM_CODES[number]
export const AvailabilityImportProblemSchema = StrictObject({
  code: Literals(AVAILABILITY_IMPORT_PROBLEM_CODES),
  line: Type.Integer(),
  key: Type.Optional(Type.String()),
})
export type AvailabilityImportProblem = Static<typeof AvailabilityImportProblemSchema>

/** What an availability list would change, before it is applied: per teacher the days the file has, before → after, and the note. */
export const AvailabilityImportPreview = StrictObject({
  fileProblems: Type.Array(CsvFileProblemSchema),
  problems: Type.Array(AvailabilityImportProblemSchema),
  ignoredColumns: Type.Array(Type.String()),
  /** The project days the file has columns for, in the file's order. */
  days: Type.Array(Type.String()),
  teachers: Type.Array(StrictObject({
    personId: Type.String(),
    displayName: Type.String(),
    shortName: Type.Union([Type.String(), Type.Null()]),
    days: Type.Array(StrictObject({ date: Type.String(), before: AvailabilityStatusSchema, after: AvailabilityStatusSchema })),
    note: Type.Union([StrictObject({ before: Type.Union([Type.String(), Type.Null()]), after: Type.Union([Type.String(), Type.Null()]) }), Type.Null()]),
  })),
  /** Days whose status changes, and notes that change. */
  changedDays: Type.Integer(),
  changedNotes: Type.Integer(),
  /** True when nothing stands in the way: no problem of any kind, and at least one row. */
  applicable: Type.Boolean(),
})
export type AvailabilityImportPreview = Static<typeof AvailabilityImportPreview>

export const AvailabilityImportApplied = StrictObject({
  planning: PlanningResponse,
  changedDays: Type.Integer(),
  changedNotes: Type.Integer(),
})
export type AvailabilityImportApplied = Static<typeof AvailabilityImportApplied>

export const AvailabilityImportInvalidResponse = StrictObject({ error: Type.Literal('availability_import_invalid'), problems: Type.Array(AvailabilityImportProblemSchema) })
