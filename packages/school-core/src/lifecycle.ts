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
  catalogue: ['published'],
  published: ['open'],
  open: ['closed'],
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

/** Whether a student may submit or change a ranked list: only while the window is open. */
export function acceptsChoices(state: CampaignState): boolean {
  return state === 'open'
}
