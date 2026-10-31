// The publication of a run (docs/domain-and-api.md §4, §8; mvp-plan S4c):
// what the organizer confirms, what a student sees of their result, what
// a teacher sees of their item's participants.

import { MOVE_PROBLEM_CODES } from '@school-allocation/school-core'
import { Type, type Static } from 'typebox'
import { AllocationRunSchema, StudentExplanationSchema } from './allocation.ts'
import { CampaignSchema, ItemSchema } from './campaigns.ts'
import { Literals, Reason, StrictObject, Uuid } from './common.ts'

/** The organizer names the items the run cancelled, as the review showed them; a different list is refused. The bound is the body's, far above any catalogue. */
export const PublishBody = StrictObject({ cancelledItemIds: Type.Array(Uuid, { maxItems: 1500 }) })

export const PublishedResponse = StrictObject({ campaign: CampaignSchema, run: AllocationRunSchema })
export type PublishedResponse = Static<typeof PublishedResponse>

// Changes after publication (school-core allocation-change.ts; mvp-plan S5a).

export const MOVE_PROBLEM_CODES_SCHEMA = Literals(MOVE_PROBLEM_CODES)
export const MoveProblemSchema = StrictObject({ code: MOVE_PROBLEM_CODES_SCHEMA, itemId: Type.Optional(Type.String()) })

/** An item a student could move into: its free places, what the move would leave, and why it would be refused as the rows stand. */
export const MoveOfferSchema = StrictObject({
  itemId: Type.String(),
  free: Type.Integer(),
  leaves: Type.Array(Type.String()),
  problems: Type.Array(MoveProblemSchema),
})
export type MoveOffer = Static<typeof MoveOfferSchema>

export const CHANGE_KINDS = ['swap', 'place', 'move', 'remove'] as const
export type ChangeKind = typeof CHANGE_KINDS[number]

/** A change of the published run, as the organizer's log and the workbook show it; the reason is theirs and the auditor's alone. */
export const AssignmentChangeSchema = StrictObject({
  id: Type.String(),
  seq: Type.Integer(),
  kind: Literals(CHANGE_KINDS),
  personId: Type.String(),
  displayName: Type.String(),
  className: Type.String(),
  /** The item entered; null for a removal. */
  toItemId: Type.Union([Type.String(), Type.Null()]),
  /** The items left: a move's or a removal's one, a swap's overlapping ones. */
  leftItemIds: Type.Array(Type.String()),
  reason: Type.Union([Type.String(), Type.Null()]),
  forced: Type.Boolean(),
  changedBy: StrictObject({ id: Type.String(), displayName: Type.String() }),
  changedAt: Type.String(),
})
export type AssignmentChange = Static<typeof AssignmentChangeSchema>

/** A student's own view of a change of theirs: what happened, not who or why. */
export const OwnChangeSchema = StrictObject({
  kind: Literals(CHANGE_KINDS),
  toItemId: Type.Union([Type.String(), Type.Null()]),
  leftItemIds: Type.Array(Type.String()),
  changedAt: Type.String(),
})

export const MyResultResponse = StrictObject({
  campaign: CampaignSchema,
  /** Lauf n, and the seed the lot was drawn with: the explanation names it. */
  run: StrictObject({ seq: Type.Integer(), seed: Type.Integer(), publishedAt: Type.String() }),
  explanation: StudentExplanationSchema,
  /** The assigned items, as the catalogue shows them to the student; with the items on offer and those left while the swap window is open. */
  items: Type.Array(ItemSchema),
  /** The fees of the assigned items, summed. */
  feeCents: Type.Integer(),
  swapWindow: Type.Union([StrictObject({ from: Type.String(), until: Type.String() }), Type.Null()]),
  /** What the student could move into, while the swap window is open; null outside it. */
  offers: Type.Union([Type.Array(MoveOfferSchema), Type.Null()]),
  /** The student's own changes since publication, oldest first. */
  changes: Type.Array(OwnChangeSchema),
})
export type MyResultResponse = Static<typeof MyResultResponse>

export const SwapBody = StrictObject({ itemId: Uuid })
export const PlaceBody = StrictObject({ personId: Uuid, itemId: Uuid, reason: Reason })
/** The organizer's change: into an item, out of one, or both (a move); `force` overrides a full item, an item's minimum and a rule falling short, never the other rules. */
export const ManualChangeBody = StrictObject({ personId: Uuid, itemId: Type.Optional(Uuid), removeItemId: Type.Optional(Uuid), reason: Reason, force: Type.Optional(Type.Boolean()) })
export const ChangedResponse = StrictObject({ change: AssignmentChangeSchema })
export type ChangedResponse = Static<typeof ChangedResponse>
export const ChangesResponse = StrictObject({ changes: Type.Array(AssignmentChangeSchema) })
export type ChangesResponse = Static<typeof ChangesResponse>

export const ItemParams = StrictObject({ id: Uuid, itemId: Uuid })
export const ParticipantsResponse = StrictObject({
  item: StrictObject({ id: Type.String(), title: Type.String(), number: Type.Union([Type.Integer(), Type.Null()]), cancelled: Type.Boolean() }),
  participants: Type.Array(StrictObject({ personId: Type.String(), displayName: Type.String(), className: Type.String(), source: Type.String() })),
})
export type ParticipantsResponse = Static<typeof ParticipantsResponse>
