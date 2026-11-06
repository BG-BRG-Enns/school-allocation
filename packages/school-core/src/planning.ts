// Planning with teachers: whether a teacher can take part on a project day,
// and which activities count. Who leads an activity is stored with its
// teachers (catalogue.ts checkItem holds an activity to one lead).

import { acceptsProposals, type ItemState } from './catalogue.ts'
import type { CampaignState } from './lifecycle.ts'

/** A teacher on a project day: available (no record), unavailable, or available only if needed. */
export const AVAILABILITY_STATUSES = ['available', 'unavailable', 'if_needed'] as const
export type AvailabilityStatus = typeof AVAILABILITY_STATUSES[number]

/**
 * Whether an activity may still take place, and so counts in the planning:
 * an approved one; a proposal while an organizer may still approve it, up
 * to the catalogue's publication; a draft while it may still be proposed.
 * Whether the published run cancelled an approved one is the caller's.
 */
export function mayTakePlace(state: ItemState, campaignState: CampaignState): boolean {
  if (state === 'approved') return true
  if (state === 'proposed') return campaignState === 'catalogue' || campaignState === 'published'
  return state === 'draft' && acceptsProposals(campaignState)
}
