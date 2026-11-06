// A campaign's lifecycle: which state follows which (docs/domain-and-api.md
// §2). The route asks these guards, and the API asks them again under the
// campaign's lock before it writes, so a stale page cannot move a campaign
// where it may not go. Triggers in the database keep only what stored data
// must satisfy whoever writes it; a trigger that restates a guard is not
// added.

export const CAMPAIGN_STATES = [
  /** Being set up; nothing is visible to teachers or students. */
  'draft',
  /** Teachers propose items; the organizer reviews them. */
  'catalogue',
  /** The catalogue is approved and printable; the window has not opened. */
  'published',
  /** Students rank; every save is kept. */
  'open',
  /** The grace week (D-06): a list may still be saved, and counts as late. */
  'grace',
  /** The window has closed; the roster batch is frozen. */
  'closed',
  /** An allocation run is executing. */
  'allocating',
  /** A run is stored and validated; the organizer compares and decides. */
  'review',
  /** One run is published; manual changes and a second round are possible. */
  'results',
  /** After the event and the attendance; nothing changes. */
  'archived',
] as const

export type CampaignState = typeof CAMPAIGN_STATES[number]

/** The states a campaign may move to from each state. */
export const CAMPAIGN_TRANSITIONS: Readonly<Record<CampaignState, readonly CampaignState[]>> = {
  draft: ['catalogue'],
  // Back to the preparation while nothing but proposals happened: teachers lose sight of it, their drafts stay.
  catalogue: ['published', 'draft'],
  // Back to collecting: the numbers given stay with their items, a second publication numbers only the rest.
  published: ['open', 'catalogue'],
  // Into the grace week when there is one, straight to closed when not.
  open: ['grace', 'closed'],
  grace: ['closed'],
  closed: ['allocating'],
  allocating: ['review'],
  // Another run with another seed or other settings, or the publication of one.
  review: ['allocating', 'results'],
  results: ['archived'],
  archived: [],
}

export type TransitionResult = { ok: true, state: CampaignState } | { ok: false, code: 'invalid_transition', from: CampaignState, to: CampaignState }

export function isCampaignState(value: unknown): value is CampaignState {
  return typeof value === 'string' && (CAMPAIGN_STATES as readonly string[]).includes(value)
}

/** The state after moving from `from` to `to`, or the refusal; the same answer on the server and in the browser. */
export function transition(from: CampaignState, to: CampaignState): TransitionResult {
  return CAMPAIGN_TRANSITIONS[from].includes(to)
    ? { ok: true, state: to }
    : { ok: false, code: 'invalid_transition', from, to }
}

/**
 * Whether students are placed into activities and taken out of class
 * activities by hand: from the collecting of activities until the window
 * closes; an organizer still while it is closed, until a run is computed.
 * After that the published result is changed, not the placements.
 */
export function acceptsPlacements(state: CampaignState, organizer: boolean): boolean {
  return state === 'catalogue' || state === 'published' || state === 'open' || state === 'grace' || (organizer && state === 'closed')
}

/** Whether a student may submit or change a ranked list: while the window is open, and in the grace week after it (a list saved then is late). */
export function acceptsChoices(state: CampaignState): boolean {
  return state === 'open' || state === 'grace'
}
