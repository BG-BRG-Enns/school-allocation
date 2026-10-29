// Campaigns in the database (docs/domain-and-api.md §1–2): set up by an
// organizer, moved through the lifecycle school-core guards, and read by
// everyone who may see them. Which states a person sees depends on who
// they are: organizers see every campaign, teachers also the ones taking
// proposals, everyone else what has been published.

import { demandByDay, transition, type CampaignState, type DayDemand, type OfferedItem } from '@school-allocation/school-core'
import { type Actor, type Caller } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import * as store from '../lib/dao/campaigns.ts'
import { lockedCampaign, readCampaign, rosterClassSizes } from '../lib/dao/campaigns.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { Campaign, CampaignChanges, CampaignWindow, NewCampaign } from '../lib/models/campaigns.ts'
import type { WindowContext } from '../lib/models/window.ts'
import { canSee } from '../lib/policies.ts'
import { datesOfSpan } from '../lib/time.ts'
import { numberApprovedItems } from './items.ts'
import { windowEffects } from './window.ts'

export { campaignCounts, readCampaign, rosterClasses, rosterClassSizes, rosterTeachers } from '../lib/dao/campaigns.ts'
export { CAMPAIGN_KINDS } from '../lib/models/campaigns.ts'
export type { Campaign, CampaignChanges, CampaignCounts, CampaignKind, CampaignWindow, NewCampaign, RosterClass, RosterTeacher } from '../lib/models/campaigns.ts'

/** The states an organizer moves a campaign into by hand; the grace week comes by the clock alone, and the allocation with a later slice. */
export const AVAILABLE_TRANSITIONS: readonly CampaignState[] = ['catalogue', 'published', 'open', 'closed']

/** The states in which the window's settings may still change: everything before the window opens. */
const WINDOW_SETTABLE: readonly CampaignState[] = ['draft', 'catalogue', 'published']

const WINDOW_FIELDS = ['opensAt', 'closesAt', 'lateUntil', 'swapFrom', 'swapUntil', 'wishesPerGroup', 'dailyMinimum', 'showTeachers', 'reminderDays'] as const

/**
 * The window as it would be after `changes`, or the rule it breaks: the
 * window closes after it opens, the grace week ends no earlier than the
 * close, the swap window ends no earlier than it starts.
 */
export function checkWindow(window: CampaignWindow): 'invalid_instant' | 'window_order' | 'grace_order' | 'swap_order' | undefined {
  const ms = (iso: string | null) => (iso === null ? null : Date.parse(iso))
  // The schema checks the shape; a 13th month passes it and the database
  // would refuse it as a 500, and Date.parse quietly turns a 30th of
  // February into the 2nd of March, so the calendar day is checked to exist.
  for (const iso of [window.opensAt, window.closesAt, window.lateUntil, window.swapFrom, window.swapUntil]) {
    if (iso === null) continue
    const day = iso.slice(0, 10)
    const dayMs = Date.parse(`${day}T00:00:00Z`)
    if (Number.isNaN(Date.parse(iso)) || Number.isNaN(dayMs) || new Date(dayMs).toISOString().slice(0, 10) !== day) return 'invalid_instant'
  }
  const opens = ms(window.opensAt)
  const closes = ms(window.closesAt)
  const late = ms(window.lateUntil)
  const swapFrom = ms(window.swapFrom)
  const swapUntil = ms(window.swapUntil)
  if (opens !== null && closes !== null && !(opens < closes)) return 'window_order'
  if (closes !== null && late !== null && !(closes <= late)) return 'grace_order'
  if (swapFrom !== null && swapUntil !== null && !(swapFrom <= swapUntil)) return 'swap_order'
  return undefined
}

export async function createCampaign(db: Database, input: NewCampaign, actor: Actor): Promise<Campaign> {
  const id = await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const row = await store.insertCampaign(client, input, actor)
    if (!row) throw new Error('campaign insert returned no row')
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'campaign.created',
      metadata: { campaignId: row.id, kind: input.kind, schoolYear: input.schoolYear, projectDays: input.projectDays.length },
    })
    return row.id
  })
  const campaign = await readCampaign(db, id)
  if (!campaign) throw new Error('the campaign just written is gone')
  return campaign
}

/**
 * Changes a campaign's name, year or days; only while it is being set up or
 * taking proposals, and never to days that would leave a session of an
 * activity outside them: the activities were checked against the days they
 * were proposed for, and a published catalogue must still satisfy that.
 */
export async function updateCampaign(db: Database, rawId: string, changes: CampaignChanges, actor: Actor): Promise<Campaign | undefined> {
  const id = canonicalId(rawId)
  const found = await db.tx(async (client) => {
    await lockScope(client, id)
    const current = await lockedCampaign(client, id)
    if (!current) return false
    const setUpChanged = changes.name !== current.name || changes.schoolYear !== current.schoolYear || changes.projectDays.join() !== current.projectDays.join()
    if (setUpChanged && current.state !== 'draft' && current.state !== 'catalogue') throw new ApplicationError('campaign_state')
    const window: CampaignWindow = { ...current }
    for (const field of WINDOW_FIELDS) {
      const value = changes[field]
      if (value !== undefined) Object.assign(window, { [field]: value })
    }
    const windowChanged = WINDOW_FIELDS.some((field) => JSON.stringify(window[field]) !== JSON.stringify(current[field]))
    if (windowChanged && !WINDOW_SETTABLE.includes(current.state)) throw new ApplicationError('campaign_state')
    const order = checkWindow(window)
    if (order !== undefined) throw new ApplicationError(order)
    const days = new Set(changes.projectDays)
    const sessions = await store.listActiveSessions(client, id)
    if (sessions.some((s) => datesOfSpan(s.startsAt.getTime(), s.endsAt.getTime()).some((date) => !days.has(date)))) {
      throw new ApplicationError('sessions_outside_days')
    }
    await store.updateSettings(client, id, changes, window)
    await appendAudit(client, {
      scopeId: id, actor: auditActor(actor), action: 'campaign.changed',
      metadata: { campaignId: id, projectDays: changes.projectDays.length, setUp: setUpChanged, window: windowChanged },
    })
    return true
  })
  return found ? readCampaign(db, id) : undefined
}

/** What the clock does and an organizer may not: enter the grace week. */
const CLOCK_ONLY: readonly CampaignState[] = ['grace']

/**
 * Moves a campaign to `to`, under its lock, as school-core allows: into the
 * catalogue (proposals open), published (the catalogue is final, and the
 * approved items are numbered for print), open (the pre-assignments are
 * materialized and the students invited), the grace week (by the clock)
 * and closed (the roster frozen, the students without a list told). The
 * allocation's states are refused until the slice that gives them meaning.
 */
const due = (iso: string | null, now: Date): boolean => iso !== null && Date.parse(iso) <= now.getTime()

/** The transition the clock owes a campaign at `now` (docs/domain-and-api.md §2), or none. */
export function dueTransition(campaign: Pick<Campaign, 'state' | 'opensAt' | 'closesAt' | 'lateUntil'>, now: Date): CampaignState | undefined {
  if (campaign.state === 'published' && due(campaign.opensAt, now)) return 'open'
  if (campaign.state === 'open' && due(campaign.closesAt, now)) return campaign.lateUntil !== null && Date.parse(campaign.lateUntil) > Date.parse(campaign.closesAt as string) ? 'grace' : 'closed'
  if (campaign.state === 'grace' && due(campaign.lateUntil, now)) return 'closed'
  return undefined
}

/**
 * Moves a campaign to `to`. The clock passes `byClock` with its `now`: the
 * deadline is checked again under the lock, so a window an organizer
 * postponed meanwhile is not opened on the old date (`not_due`).
 */
export async function transitionCampaign(db: Database, rawId: string, to: CampaignState, actor: Actor, context: WindowContext, options: { byClock?: boolean, now?: Date } = {}): Promise<Campaign | undefined> {
  if (!AVAILABLE_TRANSITIONS.includes(to) && !(options.byClock && CLOCK_ONLY.includes(to))) throw new ApplicationError('transition_not_available')
  const id = canonicalId(rawId)
  const found = await db.tx(async (client) => {
    // The opening places the classes from the roster in force (D-24), so it
    // and a roster commit take the school's lock, one after the other; the
    // school before the campaign, as everywhere.
    if (to === 'open') await lockScope(client, SCHOOL_SCOPE)
    await lockScope(client, id)
    const current = await lockedCampaign(client, id)
    if (!current) return false
    const result = transition(current.state, to)
    if (!result.ok) throw new ApplicationError('invalid_transition')
    if (options.byClock && dueTransition(current, options.now ?? new Date()) !== to) throw new ApplicationError('not_due')
    let numbered = 0
    if (to === 'published') numbered = await numberApprovedItems(client, id)
    await store.updateState(client, id, to)
    const effects = await windowEffects(client, context, current, to)
    await appendAudit(client, {
      scopeId: id, actor: auditActor(actor), action: 'campaign.transitioned',
      metadata: { campaignId: id, from: current.state, to, numbered, byClock: options.byClock === true, ...effects },
    })
    return true
  })
  return found ? readCampaign(db, id) : undefined
}

/** The campaigns the caller may see, newest first. */
export async function listCampaigns(db: Queryable, caller: Pick<Caller, 'roles' | 'person'>): Promise<Campaign[]> {
  const rows = await store.listCampaigns(db)
  return rows.filter((campaign) => canSee(caller, campaign.state))
}

/**
 * Places needed against places offered per project day and grade (D-13):
 * the roster's class sizes against the items that are proposed or approved,
 * by the dates their sessions touch. Drafts and withdrawn items count for
 * nothing.
 */
export async function campaignDemand(db: Queryable, campaign: Campaign): Promise<DayDemand[]> {
  const classes = await rosterClassSizes(db)
  const rows = await store.listDemandSessions(db, campaign)
  // One row per session; an item counts once per date its sessions touch.
  const items = new Map<string, OfferedItem>()
  for (const row of rows) {
    const item = items.get(row.id) ?? { fixedClasses: row.fixedClasses, eligibleGrades: row.eligibleGrades, eligibleClasses: row.eligibleClasses, places: row.places, dates: [] }
    const dates = new Set([...item.dates, ...datesOfSpan(row.startsAt.getTime(), row.endsAt.getTime())])
    items.set(row.id, { ...item, dates: [...dates] })
  }
  return demandByDay(campaign.projectDays, classes, [...items.values()])
}

function auditActor(actor: Actor) {
  return { tid: actor.tid, oid: actor.oid, name: actor.name }
}

/**
 * A campaign id as PostgreSQL stores it, in lower case. The id is the
 * audit scope: it is hashed into every event and locked by its text, so
 * the spelling a URL came with must not reach either.
 */
export function canonicalId(id: string): string {
  return id.toLowerCase()
}
