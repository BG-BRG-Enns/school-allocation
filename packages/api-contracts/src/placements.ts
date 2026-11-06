// Direct placement and leaving a class activity (the project lead's
// decisions of 2026-11-06): the students a teacher placed into an activity,
// the students of a class activity who are not in it, and the acts that
// change either.

import { Type, type Static } from 'typebox'
import { Literals, StrictObject, Uuid } from './common.ts'

/** A student as a teacher finds them: nothing but the name and the class. */
export const PlacedStudentSchema = StrictObject({ personId: Type.String(), displayName: Type.String(), className: Type.String() })

/** At least two characters of a name, or a class ("3B"). */
export const StudentsQuery = StrictObject({ q: Type.String({ minLength: 2, maxLength: 100 }) })
export const StudentsResponse = StrictObject({ students: Type.Array(PlacedStudentSchema) })
export type StudentsResponse = Static<typeof StudentsResponse>

/** An activity path with the student it is about. */
export const ItemPersonParams = StrictObject({ id: Uuid, personId: Uuid })

/** A direct placement: instead of the class activities of that time (the default), or beside them. */
export const PlacementBody = StrictObject({ leavesClass: Type.Optional(Type.Boolean()) })
export type PlacementBody = Static<typeof PlacementBody>

/** Another activity a placement touches, with its lead: whom to tell. */
export const OtherActivitySchema = StrictObject({ itemId: Type.String(), title: Type.String(), lead: Type.Union([Type.String(), Type.Null()]) })
export type OtherActivity = Static<typeof OtherActivitySchema>

/** Why a student of a class activity's class is not in it: on its teachers' list, or placed directly elsewhere at that time. */
export const ABSENCE_KINDS = ['list', 'placed'] as const
export type AbsenceKind = typeof ABSENCE_KINDS[number]

/** A student of a class activity's class who is not in it, with the activities they are placed into instead. */
export const AbsentStudentSchema = StrictObject({
  personId: Type.String(),
  displayName: Type.String(),
  className: Type.String(),
  by: Literals(ABSENCE_KINDS),
  elsewhere: Type.Array(OtherActivitySchema),
})

/**
 * An activity's placements: the students placed into it directly, each
 * with whether the placement takes them out of their class activities of
 * that time and which ones those are; for a class activity, the students
 * of its classes who are not in it and where they are instead. `tell`
 * names, after an act, the activities it took a student out of: their
 * leads are the ones to tell.
 */
export const PlacementsResponse = StrictObject({
  /** Whether the caller may place and remove students now. */
  mayPlace: Type.Boolean(),
  /** Whether the caller may take students of its classes out, put them back, and reclaim them, now. */
  mayTakeOut: Type.Boolean(),
  classActivity: Type.Boolean(),
  placed: Type.Array(StrictObject({
    personId: Type.String(),
    displayName: Type.String(),
    className: Type.String(),
    leavesClass: Type.Boolean(),
    leaves: Type.Array(OtherActivitySchema),
  })),
  absent: Type.Array(AbsentStudentSchema),
  tell: Type.Array(OtherActivitySchema),
})
export type PlacementsResponse = Static<typeof PlacementsResponse>
