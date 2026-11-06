// Companions sought (the school's wish 6): how many teachers an activity's
// lead wants beside them, who has joined, the list a teacher joins from,
// and the lead's or an organizer's edit of the companions alone.

import { Type, type Static } from 'typebox'
import { ItemStateSchema } from './campaigns.ts'
import { Literals, StrictObject, Uuid } from './common.ts'
import { AvailabilityStatusSchema } from './planning.ts'

/** Why a teacher may not join an activity: it seeks nobody (any more), it overlaps one they lead or accompany, they are unavailable on a day of it, the registration or the activity is past it. */
export const COMPANION_PROBLEM_CODES = ['none_sought', 'overlap', 'unavailable', 'campaign_state', 'item_state'] as const
export type CompanionProblemCode = typeof COMPANION_PROBLEM_CODES[number]
export const CompanionProblemSchema = Literals(COMPANION_PROBLEM_CODES)

/**
 * The companions as the lead or an organizer sets them: the teachers beside
 * the lead, in order, and how many are wanted. With `lead`, the lead is
 * handed over to that teacher, one of the companions sent: the lead until
 * now stays as a companion.
 */
export const CompanionsBody = StrictObject({
  companions: Type.Array(Uuid, { maxItems: 8 }),
  wanted: Type.Integer({ minimum: 0, maximum: 8 }),
  lead: Type.Optional(Uuid),
})
export type CompanionsBody = Static<typeof CompanionsBody>

/** An activity on the list: what it is and when, its lead, how many companions it wants, has and still seeks, and what the caller may do about it. */
export const CompanionsItemSchema = StrictObject({
  id: Type.String(),
  number: Type.Union([Type.Number(), Type.Null()]),
  title: Type.String(),
  state: ItemStateSchema,
  sessions: Type.Array(StrictObject({ startsAt: Type.String(), endsAt: Type.String() })),
  lead: StrictObject({ displayName: Type.String(), shortName: Type.Union([Type.String(), Type.Null()]) }),
  wanted: Type.Number(),
  /** The companions named so far. */
  named: Type.Number(),
  /** Still sought: the number wanted less the companions named, never below zero. */
  sought: Type.Number(),
  leading: Type.Boolean(),
  accompanying: Type.Boolean(),
  join: StrictObject({ ok: Type.Boolean(), problem: Type.Optional(CompanionProblemSchema) }),
  mayLeave: Type.Boolean(),
})
export type CompanionsItemView = Static<typeof CompanionsItemSchema>

/** The list a teacher joins from: per project day, their own availability and the activities that still seek a companion or that they accompany. */
export const CompanionsResponse = StrictObject({
  /** Whether the caller may join at all: a teacher of the roster in force. */
  mayJoin: Type.Boolean(),
  days: Type.Array(StrictObject({
    date: Type.String(),
    myStatus: AvailabilityStatusSchema,
    items: Type.Array(CompanionsItemSchema),
  })),
})
export type CompanionsResponse = Static<typeof CompanionsResponse>
