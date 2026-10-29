// The publication of a run (docs/domain-and-api.md §4, §8; mvp-plan S4c):
// what the organizer confirms, what a student sees of their result, what
// a teacher sees of their item's participants.

import { Type, type Static } from 'typebox'
import { AllocationRunSchema, StudentExplanationSchema } from './allocation.ts'
import { CampaignSchema, ItemSchema } from './campaigns.ts'
import { StrictObject, Uuid } from './common.ts'

/** The organizer names the items the run cancelled, as the review showed them; a different list is refused. The bound is the body's, far above any catalogue. */
export const PublishBody = StrictObject({ cancelledItemIds: Type.Array(Uuid, { maxItems: 1500 }) })

export const PublishedResponse = StrictObject({ campaign: CampaignSchema, run: AllocationRunSchema })
export type PublishedResponse = Static<typeof PublishedResponse>

export const MyResultResponse = StrictObject({
  campaign: CampaignSchema,
  /** Lauf n, and the seed the lot was drawn with: the explanation names it. */
  run: StrictObject({ seq: Type.Integer(), seed: Type.Integer(), publishedAt: Type.String() }),
  explanation: StudentExplanationSchema,
  /** The assigned items, as the catalogue shows them to the student. */
  items: Type.Array(ItemSchema),
  /** The fees of the assigned items, summed. */
  feeCents: Type.Integer(),
  swapWindow: Type.Union([StrictObject({ from: Type.String(), until: Type.String() }), Type.Null()]),
})
export type MyResultResponse = Static<typeof MyResultResponse>

export const ItemParams = StrictObject({ id: Uuid, itemId: Uuid })
export const ParticipantsResponse = StrictObject({
  item: StrictObject({ id: Type.String(), title: Type.String(), number: Type.Union([Type.Integer(), Type.Null()]), cancelled: Type.Boolean() }),
  participants: Type.Array(StrictObject({ personId: Type.String(), displayName: Type.String(), className: Type.String(), source: Type.String() })),
})
export type ParticipantsResponse = Static<typeof ParticipantsResponse>
