// Shared HTTP shapes. Types are derived from the schemas used by Fastify.

import { Type, type Static } from 'typebox'
import { CSV_LIMITS, TEACHER_CSV_PROBLEM_CODES } from '@school-allocation/school-core'
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
  shortName: Type.Union([Type.String(), Type.Null()]),
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

/** A teacher list as uploaded: the CSV's text. */
export const TeacherListBody = StrictObject({ csv: Type.String({ minLength: 1, maxLength: CSV_LIMITS.rows * (CSV_LIMITS.field + 1) * 8 }) })
export type TeacherListBody = Static<typeof TeacherListBody>

/** Why a row of a teacher list is not applied: school-core's reading problems, and what the roster does not know. */
export const TEACHER_LIST_PROBLEM_CODES = [...TEACHER_CSV_PROBLEM_CODES, 'teacher_unknown', 'class_unknown', 'short_name_held'] as const
export type TeacherListProblemCode = typeof TEACHER_LIST_PROBLEM_CODES[number]
export const TeacherListProblemSchema = StrictObject({
  code: Literals(TEACHER_LIST_PROBLEM_CODES),
  line: Type.Integer(),
  key: Type.Optional(Type.String()),
})
export type TeacherListProblem = Static<typeof TeacherListProblemSchema>

/** A problem with the file itself (school-core CsvProblem). */
export const CsvFileProblemSchema = StrictObject({
  code: Type.String(),
  line: Type.Optional(Type.Integer()),
  column: Type.Optional(Type.String()),
})

/** What a teacher list would do, before it is applied: per teacher the abbreviation, per class its class teachers. */
export const TeacherListPreview = StrictObject({
  fileProblems: Type.Array(CsvFileProblemSchema),
  problems: Type.Array(TeacherListProblemSchema),
  ignoredColumns: Type.Array(Type.String()),
  teachers: Type.Array(StrictObject({
    personId: Type.String(),
    displayName: Type.String(),
    email: Type.String(),
    shortName: Type.Union([StrictObject({ before: Type.Union([Type.String(), Type.Null()]), after: Type.String() }), Type.Null()]),
  })),
  classes: Type.Array(StrictObject({
    className: Type.String(),
    before: Type.Array(Type.String()),
    after: Type.Array(Type.String()),
  })),
  /** True when nothing stands in the way: no problem of any kind, and at least one row. */
  applicable: Type.Boolean(),
})
export type TeacherListPreview = Static<typeof TeacherListPreview>

export const TeacherListApplied = StrictObject({
  classes: Type.Array(ClassWithTeachersSchema),
  teachers: Type.Integer(),
  shortNames: Type.Integer(),
  classesChanged: Type.Integer(),
})
export type TeacherListApplied = Static<typeof TeacherListApplied>

export const TeacherListInvalidResponse = StrictObject({ error: Type.Literal('teacher_list_invalid'), problems: Type.Array(TeacherListProblemSchema) })
