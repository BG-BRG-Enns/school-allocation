// Campaigns in the database (docs/domain-and-api.md §1–2): set up by an
// organizer, moved through the lifecycle school-core guards, and read by
// everyone who may see them. Which states a person sees depends on who
// they are: organizers see every campaign, teachers also the ones taking
// proposals, everyone else what has been published.

import { checkFrame, checkRules, demandByDay, demandCells, ruleDemand, transition, type CampaignState, type DayDemand, type Frame, type OfferedItem, type RuleDemand } from '@school-allocation/school-core'
import { type Actor, type Caller } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import * as store from '../lib/dao/campaigns.ts'
import { lockedCampaign, readCampaign, rosterClassSizes } from '../lib/dao/campaigns.ts'
import { knownCategories } from '../lib/dao/categories.ts'
import { listCampaignItems, listRosterClasses, numberApprovedItems } from '../lib/dao/items.ts'
import { readPeriods } from '../lib/dao/settings.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError, ClassInUse, RulesInvalid } from '../lib/errors.ts'
import type { Campaign, CampaignChanges, CampaignWindow, NewCampaign, RuleInput } from '../lib/models/campaigns.ts'
import type { WindowContext } from '../lib/models/window.ts'
import { datesOfSpan, dayBounds, instantInSchoolZone } from '../lib/time.ts'
import { uniqueSorted } from './catalogue-input.ts'
import { visibleAmong } from './visibility.ts'
import { windowEffects } from './window.ts'

/** The states an organizer moves a campaign into by hand, the two steps back included (draft from catalogue, catalogue from published); the grace week comes by the clock alone, the allocation's states by a run and its publication. The archive closes the campaign after the event and the attendance: nothing changes afterwards. */
export const AVAILABLE_TRANSITIONS: readonly CampaignState[] = ['draft', 'catalogue', 'published', 'open', 'closed', 'archived']

/** The states in which the window's settings may still change: everything before the window opens. */
const WINDOW_SETTABLE: readonly CampaignState[] = ['draft', 'catalogue', 'published']

/** The swap window's dates may still be set after the close, until the window has begun: the organizer sets them when publishing. */
const SWAP_FIELDS: ReadonlySet<string> = new Set(['swapFrom', 'swapUntil'])

/** The daily minimum is the allocation's input, not the window's: it may change until a run is published, so a grade forgotten or imported late does not block the campaign. A run already made notices through its stale mark. */
const LATE_FIELDS: ReadonlySet<string> = new Set(['dailyMinimum', ...SWAP_FIELDS])

const WINDOW_FIELDS = ['opensAt', 'closesAt', 'lateUntil', 'swapFrom', 'swapUntil', 'wishesPerGroup', 'dailyMinimum', 'showTeachers', 'reminderDays', 'placeHeadroomPercent'] as const

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

/**
 * The classes a registration takes in, as the school's roster in force
 * knows them: a class it does not know has no students to invite and would
 * only mislead. Left out, every class of the roster, which is what a project
 * week mostly wants and what the form preselects.
 */
async function classesTakenIn(client: Queryable, classes: readonly string[] | undefined): Promise<string[]> {
  const known = (await listRosterClasses(client)).map((row) => row.className)
  if (classes === undefined) return uniqueSorted(known)
  const wanted = uniqueSorted(classes)
  const unknown = wanted.filter((name) => !known.includes(name))
  if (unknown.length > 0) throw new ApplicationError('class_unknown', unknown.join(', '))
  return wanted
}

/**
 * The frames as stored: one per project day that has one, each a span of
 * periods the grid has (school-core checkFrame); a day the registration does
 * not have, or a frame off the grid, is refused as `frame_invalid` naming
 * the day. Left out, `fallback` (none at creation, the frames in force on a
 * change) for the days that stay.
 */
async function framesOf(client: Queryable, frames: Readonly<Record<string, Frame>> | undefined, projectDays: readonly string[], fallback: Readonly<Record<string, Frame>> = {}): Promise<Record<string, Frame>> {
  const wanted = frames ?? fallback
  const result: Record<string, Frame> = {}
  const grid = frames === undefined ? [] : await readPeriods(client)
  for (const date of projectDays) {
    const frame = wanted[date]
    if (frame === undefined) continue
    if (frames !== undefined && checkFrame(frame, grid) !== undefined) throw new ApplicationError('frame_invalid', date)
    result[date] = { from: frame.from, to: frame.to }
  }
  const strangers = Object.keys(frames ?? {}).filter((date) => !projectDays.includes(date))
  if (strangers.length > 0) throw new ApplicationError('frame_invalid', strangers.join(', '))
  return result
}

/** The frames of a campaign as stored, by date. */
function framesIn(campaign: Pick<Campaign, 'days'>): Record<string, Frame> {
  return Object.fromEntries(campaign.days.flatMap((day) => (day.frame === null ? [] : [[day.date, day.frame] as const])))
}

export async function createCampaign(db: Database, input: NewCampaign, actor: Actor): Promise<Campaign> {
  const id = await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const classes = await classesTakenIn(client, input.classes)
    const frames = await framesOf(client, input.frames, input.projectDays)
    const row = await store.insertCampaign(client, input, actor)
    if (!row) throw new Error('campaign insert returned no row')
    await store.replaceClasses(client, row.id, classes)
    await store.replaceDays(client, row.id, input.projectDays, frames)
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'campaign.created',
      metadata: { campaignId: row.id, kind: input.kind, schoolYear: input.schoolYear, projectDays: input.projectDays.length, classes: classes.length, frames: Object.keys(frames).length },
    })
    return row.id
  })
  const campaign = await readCampaign(db, id)
  if (!campaign) throw new Error('the campaign just written is gone')
  return campaign
}

/**
 * Changes a campaign's name, year, days or classes; only while it is being
 * set up or taking proposals, never to days that would leave a session of
 * an activity outside them (the activities were checked against the days
 * they were proposed for, and a published catalogue must still satisfy
 * that), and never without a class an activity or a rule still names.
 */
export async function updateCampaign(db: Database, rawId: string, changes: CampaignChanges, actor: Actor): Promise<Campaign> {
  const id = canonicalId(rawId)
  await db.tx(async (client) => {
    // A class list is checked against the roster in force, which a roster commit replaces under the school's lock, and
    // a frame against the grid, which an administrator replaces under it too: the two go one after the other, the school
    // before the campaign, as everywhere (createCampaign, the opening).
    if (changes.classes !== undefined || changes.frames !== undefined) await lockScope(client, SCHOOL_SCOPE)
    await lockScope(client, id)
    const current = await lockedCampaign(client, id)
    if (!current) throw new ApplicationError('not_found')
    // Compared as sets: the stored list comes in the database's order, the sent one in the form's.
    const classes = changes.classes === undefined ? undefined : uniqueSorted(changes.classes)
    const classesChanged = classes !== undefined && (classes.length !== current.classes.length || classes.some((name) => !current.classes.includes(name)))
    const setUpChanged = changes.name !== current.name || changes.schoolYear !== current.schoolYear || changes.projectDays.join() !== current.projectDays.join() || classesChanged
    if (setUpChanged && current.state !== 'draft' && current.state !== 'catalogue') throw new ApplicationError('campaign_state')
    const window: CampaignWindow = { ...current }
    for (const field of WINDOW_FIELDS) {
      const value = changes[field]
      if (value !== undefined) Object.assign(window, { [field]: value })
    }
    const changed = WINDOW_FIELDS.filter((field) => JSON.stringify(window[field]) !== JSON.stringify(current[field]))
    const windowChanged = changed.length > 0
    if (windowChanged && !WINDOW_SETTABLE.includes(current.state)) {
      const late = changed.every((field) => LATE_FIELDS.has(field)) && (current.state === 'closed' || current.state === 'review')
      const swapOnly = changed.every((field) => SWAP_FIELDS.has(field)) && current.state === 'results' && (current.swapFrom === null || Date.parse(current.swapFrom) > db.now().getTime())
      if (!late && !swapOnly) throw new ApplicationError('campaign_state')
    }
    const order = checkWindow(window)
    if (order !== undefined) throw new ApplicationError(order)
    // The frames go with the window's settings: the demand reads them while proposals come in, and from the opening the
    // days are what the students chose by. A frame goes with its day when the day is taken out.
    const frames = await framesOf(client, changes.frames, changes.projectDays, framesIn(current))
    const framesChanged = JSON.stringify(changes.projectDays.map((date) => frames[date] ?? null)) !== JSON.stringify(changes.projectDays.map((date) => framesIn(current)[date] ?? null))
    if (framesChanged && !WINDOW_SETTABLE.includes(current.state)) throw new ApplicationError('campaign_state')
    // The rules: students rank against them, so they are fixed from the opening like the window; ids are the database's,
    // so a list sent again unchanged keeps them and marks no run stale.
    const rules = changes.rules?.map(canonicalRule)
    const rulesChanged = rules !== undefined && JSON.stringify(rules) !== JSON.stringify(current.rules.map(({ id: _, ...rule }) => canonicalRule(rule)))
    if (rules !== undefined && rulesChanged) {
      if (!WINDOW_SETTABLE.includes(current.state)) throw new ApplicationError('campaign_state')
      const known = await knownCategories(client, [...new Set(rules.map((rule) => rule.categoryId))])
      const problems = checkRules(rules, known)
      if (problems.length > 0) throw new RulesInvalid(problems)
    }
    const days = new Set(changes.projectDays)
    const sessions = await store.listActiveSessions(client, id)
    if (sessions.some((s) => datesOfSpan(s.startsAt.getTime(), s.endsAt.getTime()).some((date) => !days.has(date)))) {
      throw new ApplicationError('sessions_outside_days')
    }
    // A class an activity or a rule names stays in: taking it out would leave them naming nobody, or a class outside. The
    // rules are those of the change, where it carries them: one save may replace both, and the result is what must hold.
    const removed = classes === undefined || !classesChanged ? [] : current.classes.filter((name) => !classes.includes(name))
    const resulting = classes ?? current.classes
    const namedByRules = (rules ?? current.rules).flatMap((rule) => rule.classes).filter((name) => !resulting.includes(name))
    if (classes !== undefined && classesChanged) await classesTakenIn(client, classes)
    const inUse = uniqueSorted([...namedByRules, ...(removed.length === 0 ? [] : await store.classesInUse(client, id, removed))])
    if (inUse.length > 0) throw new ClassInUse(inUse)
    await store.updateSettings(client, id, changes, window)
    await store.replaceDays(client, id, changes.projectDays, frames)
    await appendAudit(client, {
      scopeId: id, actor: auditActor(actor), action: 'campaign.changed',
      metadata: { campaignId: id, projectDays: changes.projectDays.length, setUp: setUpChanged, window: windowChanged, frames: framesChanged },
    })
    if (classes !== undefined && classesChanged) {
      await store.replaceClasses(client, id, classes)
      await appendAudit(client, {
        scopeId: id, actor: auditActor(actor), action: 'campaign.classes-changed',
        // By count: forty class names would crowd out the rest.
        metadata: { campaignId: id, added: classes.filter((name) => !current.classes.includes(name)).length, removed: removed.length, classes: classes.length },
      })
    }
    if (rules !== undefined && rulesChanged) {
      await store.replaceRules(client, id, rules)
      await appendAudit(client, {
        scopeId: id, actor: auditActor(actor), action: 'campaign.rules-changed',
        // The classes by count: forty class names would crowd out the rest.
        metadata: { campaignId: id, rules: rules.map((rule) => ({ categoryId: rule.categoryId, grades: rule.grades, classes: rule.classes.length, unit: rule.unit, minimum: rule.minimum })) },
      })
    }
  })
  return requireCampaign(db, id)
}

/** A rule as stored: ids in lower case, grades and classes each once and in order. */
function canonicalRule(rule: RuleInput): RuleInput {
  return {
    categoryId: rule.categoryId.toLowerCase(),
    grades: [...new Set(rule.grades)].sort((a, b) => a - b),
    classes: uniqueSorted(rule.classes),
    unit: rule.unit,
    minimum: rule.minimum,
  }
}

/** What the clock does and an organizer may not: enter the grace week. */
const CLOCK_ONLY: readonly CampaignState[] = ['grace']

const due = (iso: string | null, now: Date): boolean => iso !== null && Date.parse(iso) <= now.getTime()

/** The transition the clock owes a campaign at `now` (docs/domain-and-api.md §2), or none. */
export function dueTransition(campaign: Pick<Campaign, 'state' | 'opensAt' | 'closesAt' | 'lateUntil'>, now: Date): CampaignState | undefined {
  if (campaign.state === 'published' && due(campaign.opensAt, now)) return 'open'
  if (campaign.state === 'open' && due(campaign.closesAt, now)) return campaign.lateUntil !== null && Date.parse(campaign.lateUntil) > Date.parse(campaign.closesAt as string) ? 'grace' : 'closed'
  if (campaign.state === 'grace' && due(campaign.lateUntil, now)) return 'closed'
  return undefined
}

/**
 * Moves a campaign to `to`, under its lock, as school-core allows: into the
 * catalogue (proposals open), published (the catalogue is final, and the
 * approved items are numbered for print), open (the pre-assignments are
 * materialized and the students invited), the grace week (by the clock)
 * and closed (the roster frozen, the students without a list told). The
 * allocation's states are refused until the slice that gives them meaning.
 * The clock checks its deadline again under the lock, so a postponed window
 * is not opened on its old date (`not_due`).
 */
export async function transitionCampaign(db: Database, rawId: string, to: CampaignState, actor: Actor, context: WindowContext, options: { byClock?: boolean, now?: Date } = {}): Promise<Campaign> {
  if (!AVAILABLE_TRANSITIONS.includes(to) && !(options.byClock && CLOCK_ONLY.includes(to))) throw new ApplicationError('transition_not_available')
  const id = canonicalId(rawId)
  await db.tx(async (client) => {
    // The opening places the classes from the roster in force (D-24), so it
    // and a roster commit take the school's lock, one after the other; the
    // school before the campaign, as everywhere.
    if (to === 'open') await lockScope(client, SCHOOL_SCOPE)
    await lockScope(client, id)
    const current = await lockedCampaign(client, id)
    if (!current) throw new ApplicationError('not_found')
    const result = transition(current.state, to)
    if (!result.ok) throw new ApplicationError('invalid_transition')
    if (options.byClock && dueTransition(current, options.now ?? db.now()) !== to) throw new ApplicationError('not_due')
    let numbered = 0
    if (to === 'published') numbered = await numberApprovedItems(client, id)
    await store.updateState(client, id, to)
    const effects = await windowEffects(client, context, current, to)
    await appendAudit(client, {
      scopeId: id, actor: auditActor(actor), action: 'campaign.transitioned',
      metadata: { campaignId: id, from: current.state, to, numbered, byClock: options.byClock === true, ...effects },
    })
  })
  return requireCampaign(db, id)
}

/**
 * Deletes a registration still in preparation: the database's definer
 * function takes the rules and the draft items, and refuses anything else
 * (an item past draft or once numbered, a grant scoped to the campaign, a
 * notice, a placement) as SQLSTATE 55000, which is answered as
 * `campaign_state`. Audited in the school's chain with the name and what
 * went; the registration's own chain stays.
 */
export async function deleteCampaign(db: Database, rawId: string, actor: Actor): Promise<{ removed: { relation: string, count: number }[] }> {
  const id = canonicalId(rawId)
  return db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    await lockScope(client, id)
    const current = await lockedCampaign(client, id)
    if (!current) throw new ApplicationError('not_found')
    if (current.state !== 'draft') throw new ApplicationError('campaign_state')
    const counts = await store.campaignCounts(client, id)
    if (counts.proposed + counts.approved + counts.withdrawn > 0) throw new ApplicationError('campaign_state')
    let removed: { relation: string, count: number }[]
    try {
      removed = await store.deleteDraftCampaign(client, id)
    } catch (error) {
      // The function's own refusals (a draft that once had a number, a grant scoped to the campaign): the state's, not a fault.
      if ((error as { code?: string }).code === '55000') throw new ApplicationError('campaign_state')
      throw error
    }
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'campaign.deleted',
      metadata: { campaignId: id, name: current.name, schoolYear: current.schoolYear, removed: Object.fromEntries(removed.map((r) => [r.relation, r.count])) },
    })
    return { removed }
  })
}

/** The campaigns the caller may see, newest first. */
export async function listCampaigns(db: Queryable, caller: Pick<Caller, 'roles' | 'person'>): Promise<Campaign[]> {
  return visibleAmong(db, caller, await store.listCampaigns(db))
}

/**
 * Places needed against places offered per project day, cell and grade
 * (D-13): the sizes of the classes taking part against the items that are
 * proposed or approved, by the cells their sessions touch: the periods of a
 * day's attendance frame, or the whole day. Drafts and withdrawn items
 * count for nothing.
 */
export async function campaignDemand(db: Queryable, campaign: Campaign): Promise<{ demand: DayDemand[], rules: RuleDemand[] }> {
  const classes = await rosterClassSizes(db, campaign)
  const grid = await readPeriods(db)
  const rows = await store.listDemandSessions(db, campaign)
  // One row per session; an item counts in every cell one of its sessions touches.
  const items = new Map<string, OfferedItem>()
  for (const row of rows) {
    const item = items.get(row.id) ?? { fixedClasses: row.fixedClasses, eligibleGrades: row.eligibleGrades, eligibleClasses: row.eligibleClasses, places: row.places, sessions: [] }
    items.set(row.id, { ...item, sessions: [...item.sessions, { startMs: row.startsAt.getTime(), endMs: row.endsAt.getTime() }] })
  }
  const days = campaign.days.map((day) => ({ date: day.date, frame: day.frame, cells: demandCells(day.frame, grid, (time) => instantInSchoolZone(day.date, time), dayBounds(day.date)) }))
  const demand = demandByDay(days, classes, [...items.values()])
  if (campaign.rules.length === 0) return { demand, rules: [] }
  const offered = (await listCampaignItems(db, campaign.id)).filter((item) => item.state === 'proposed' || item.state === 'approved')
  return { demand, rules: ruleDemand(campaign.rules, classes, offered, campaign.projectDays) }
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

/** Used by privileged reports after their adapter's role guard. */
export async function requireCampaign(db: Queryable, id: string): Promise<Campaign> {
  const campaign = await readCampaign(db, id)
  if (!campaign) throw new ApplicationError('not_found')
  return campaign
}
