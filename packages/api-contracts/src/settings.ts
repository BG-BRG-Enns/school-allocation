// Shared HTTP shapes. Types are derived from the schemas used by Fastify.

import { Type, type Static } from 'typebox'
import { Literals, StrictObject } from './common.ts'

export const PeriodSchema = StrictObject({
  period: Type.Number(),
  starts: Type.String(),
  ends: Type.String(),
})
export type { Period } from '@school-allocation/school-core'

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

/**
 * The languages a school may speak: the message catalogue's locales
 * (packages/messages LOCALES), spelled out because a contract imports
 * nothing but TypeBox and school-core; an API test holds the two lists
 * together, and the database's check holds the stored value to them.
 */
export const SCHOOL_LOCALES = ['de', 'de-formal', 'en'] as const
export type SchoolLocale = typeof SCHOOL_LOCALES[number]

export const LanguageSetting = StrictObject({ locale: Literals(SCHOOL_LOCALES) })
export type LanguageSetting = Static<typeof LanguageSetting>
