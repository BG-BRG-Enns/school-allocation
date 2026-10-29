// Shared HTTP shapes. Types are derived from the schemas used by Fastify.

import { Type, type Static } from 'typebox'
import { StrictObject } from './common.ts'

export const PeriodSchema = StrictObject({
  period: Type.Number(),
  starts: Type.String(),
  ends: Type.String(),
})
export type Period = Static<typeof PeriodSchema>

export const ClassTeacherSchema = StrictObject({
  personId: Type.String(),
  displayName: Type.String(),
  source: Type.Union([Type.Literal('app'), Type.Literal('roster')]),
})
export type ClassTeacher = Static<typeof ClassTeacherSchema>

export const ClassWithTeachersSchema = StrictObject({
  className: Type.String(),
  grade: Type.Number(),
  students: Type.Number(),
  teachers: Type.Array(ClassTeacherSchema),
})
export type ClassWithTeachers = Static<typeof ClassWithTeachersSchema>

export const PeriodsResponse = StrictObject({ periods: Type.Array(PeriodSchema) })
export type PeriodsResponse = Static<typeof PeriodsResponse>

export const ClassesResponse = StrictObject({ classes: Type.Array(ClassWithTeachersSchema) })
export type ClassesResponse = Static<typeof ClassesResponse>
