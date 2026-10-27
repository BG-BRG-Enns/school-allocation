// The domain, pure: no I/O, no clock, no randomness (ESLint enforces it).
// The API and the web app both import from here, so they never disagree
// about what a state allows or what a choice is worth.

export {
  CAMPAIGN_STATES,
  CAMPAIGN_TRANSITIONS,
  acceptsChoices,
  isCampaignState,
  transition,
  type CampaignState,
  type TransitionResult,
} from './lifecycle.ts'

/**
 * The version of the domain rules a stored result was computed with. Bumped
 * whenever a change here would give a different allocation or validation
 * for the same input; an allocation run records it (docs/domain-and-api.md).
 */
export const CORE_VERSION = 1
