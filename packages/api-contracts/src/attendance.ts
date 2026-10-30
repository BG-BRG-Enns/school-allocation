// Attendance (docs/domain-and-api.md §1 Attendance, §8; mvp-plan S5b): a
// class as its class teacher records it, per project day and session; what
// the organizer and the auditor export.

import { Type, type Static } from 'typebox'
import { Literals, StrictObject, Uuid } from './common.ts'

export const ATTENDANCE_STATUSES = ['present', 'absent', 'excused'] as const
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number]
export const AttendanceStatusSchema = Literals(ATTENDANCE_STATUSES)

/** One student in one session of a project day, with what was recorded. */
export const AttendanceRowSchema = StrictObject({
  sessionId: Type.String(),
  itemId: Type.String(),
  title: Type.String(),
  number: Type.Union([Type.Integer(), Type.Null()]),
  startsAt: Type.String(),
  endsAt: Type.String(),
  personId: Type.String(),
  displayName: Type.String(),
  className: Type.String(),
  status: Type.Union([AttendanceStatusSchema, Type.Null()]),
  note: Type.String(),
})
export type AttendanceRow = Static<typeof AttendanceRowSchema>

export const ClassAttendanceResponse = StrictObject({
  className: Type.String(),
  /** Whether the caller may record now: a class teacher of the class or an organizer, while the campaign is in results. */
  recordable: Type.Boolean(),
  days: Type.Array(StrictObject({ date: Type.String(), rows: Type.Array(AttendanceRowSchema) })),
})
export type ClassAttendanceResponse = Static<typeof ClassAttendanceResponse>

export const AttendanceBody = StrictObject({
  entries: Type.Array(StrictObject({ personId: Uuid, status: AttendanceStatusSchema, note: Type.Optional(Type.String({ maxLength: 200 })) }), { minItems: 1, maxItems: 1000 }),
})
export const RecordedResponse = StrictObject({ recorded: Type.Integer() })
export type RecordedResponse = Static<typeof RecordedResponse>
