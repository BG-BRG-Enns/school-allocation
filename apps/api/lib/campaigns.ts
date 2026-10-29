// Campaigns in the database (docs/domain-and-api.md §1–2): set up by an
// organizer, moved through the lifecycle school-core guards, and read by
// everyone who may see them. Which states a person sees depends on who
// they are: organizers see every campaign, teachers also the ones taking
// proposals, everyone else what has been published.

import { demandByDay, transition, type CampaignState, type ClassSize, type DayDemand, type OfferedItem } from '@school-allocation/school-core'
import { appendAudit, lockScope, SCHOOL_SCOPE } from './audit.ts'
import type { Caller } from './auth.ts'
import type { Database, Queryable } from './db.ts'
import { numberApprovedItems } from './items.ts'
import { RosterConflict, type Actor } from './roster.ts'
import { datesOfSpan } from './time.ts'

export const CAMPAIGN_KINDS = ['project_week', 'wpf'] as const
export type CampaignKind = typeof CAMPAIGN_KINDS[number]

/** The states this release moves a campaign into; the choice window and everything after come with later slices. */
export const AVAILABLE_TRANSITIONS: readonly CampaignState[] = ['catalogue', 'published']

/**
 * The choice window and what it asks (D-05, D-06, D-13): when students
 * choose, until when a late list is still taken, when they may swap after
 * publication; how many wishes per time group; the daily minimum in
 * minutes per grade; whether the catalogue names the teachers.
 */
export interface CampaignWindow {
  /** ISO instants, null until set. */
  opensAt: string | null
  closesAt: string | null
  lateUntil: string | null
  swapFrom: string | null
  swapUntil: string | null
  wishesPerGroup: number
  /** Grade → minutes; a grade not listed has no minimum. */
  dailyMinimum: Record<string, number>
  showTeachers: boolean
}

export interface Campaign extends CampaignWindow {
  id: string
  kind: CampaignKind
  name: string
  schoolYear: string
  state: CampaignState
  /** Local dates, YYYY-MM-DD, in order. */
  projectDays: string[]
  createdAt: string
  updatedAt: string
}

/** What organizers see beside a campaign: how many items wait where. */
export interface CampaignCounts {
  draft: number
  proposed: number
  approved: number
  withdrawn: number
}

export interface NewCampaign {
  kind: CampaignKind
  name: string
  schoolYear: string
  projectDays: string[]
}

/** What an organizer changes: the set-up (while it is being set up or taking proposals) and the window settings (until the window opens). */
export type CampaignChanges = Omit<NewCampaign, 'kind'> & Partial<CampaignWindow>

/** The states in which the window's settings may still change: everything before the window opens. */
const WINDOW_SETTABLE: readonly CampaignState[] = ['draft', 'catalogue', 'published']

const WINDOW_FIELDS = ['opensAt', 'closesAt', 'lateUntil', 'swapFrom', 'swapUntil', 'wishesPerGroup', 'dailyMinimum', 'showTeachers'] as const

/**
 * The window as it would be after `changes`, or the rule it breaks: the
 * window closes after it opens, the grace week ends no earlier than the
 * close, the swap window ends no earlier than it starts.
 */
export function checkWindow(window: CampaignWindow): 'invalid_instant' | 'window_order' | 'grace_order' | 'swap_order' | undefined {
  const ms = (iso: string | null) => (iso === null ? null : Date.parse(iso))
  // The schema checks the shape; a 13th month passes it and the database would refuse it as a 500.
  for (const iso of [window.opensAt, window.closesAt, window.lateUntil, window.swapFrom, window.swapUntil]) {
    if (iso !== null && Number.isNaN(Date.parse(iso))) return 'invalid_instant'
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

/** Whether the caller organizes: a school-wide organizer or an administrator. */
export function isOrganizer(caller: Pick<Caller, 'roles'>): boolean {
  return caller.roles.includes('campaign_organizer') || caller.roles.includes('school_admin')
}

/** Whether the caller is a teacher of the roster in force. */
export function isTeacher(caller: Pick<Caller, 'person'>): boolean {
  return caller.person?.kind === 'teacher'
}

/**
 * Whether the caller may see a campaign in `state`: organizers see all of
 * them, teachers also one taking proposals, everyone signed in what is
 * published. A campaign that is not visible does not exist for the caller.
 */
export function canSee(caller: Pick<Caller, 'roles' | 'person'>, state: CampaignState): boolean {
  if (isOrganizer(caller)) return true
  if (state === 'catalogue') return isTeacher(caller)
  return state !== 'draft' && state !== 'archived'
}

export async function createCampaign(db: Database, input: NewCampaign, actor: Actor): Promise<Campaign> {
  const id = await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const { rows: [row] } = await client.query<{ id: string }>(
      'insert into campaign (kind, name, school_year, project_days, created_by) values ($1, $2, $3, $4::date[], $5) returning id',
      [input.kind, input.name, input.schoolYear, input.projectDays, actor.id],
    )
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
    if (setUpChanged && current.state !== 'draft' && current.state !== 'catalogue') throw new RosterConflict('campaign_state')
    const window: CampaignWindow = { ...current }
    for (const field of WINDOW_FIELDS) {
      const value = changes[field]
      if (value !== undefined) Object.assign(window, { [field]: value })
    }
    const windowChanged = WINDOW_FIELDS.some((field) => JSON.stringify(window[field]) !== JSON.stringify(current[field]))
    if (windowChanged && !WINDOW_SETTABLE.includes(current.state)) throw new RosterConflict('campaign_state')
    const order = checkWindow(window)
    if (order !== undefined) throw new RosterConflict(order)
    const days = new Set(changes.projectDays)
    const { rows: sessions } = await client.query<{ starts_at: Date, ends_at: Date }>(
      `select s.starts_at, s.ends_at from item_session s join catalog_item i on i.id = s.item_id where i.campaign_id = $1 and i.state <> 'withdrawn'`, [id],
    )
    if (sessions.some((s) => datesOfSpan(s.starts_at.getTime(), s.ends_at.getTime()).some((date) => !days.has(date)))) {
      throw new RosterConflict('sessions_outside_days')
    }
    await client.query(
      `update campaign set name = $2, school_year = $3, project_days = $4::date[], opens_at = $5, closes_at = $6, late_until = $7, swap_from = $8, swap_until = $9,
              wishes_per_group = $10, daily_minimum = $11, show_teachers = $12, updated_at = now() where id = $1`,
      [id, changes.name, changes.schoolYear, changes.projectDays, window.opensAt, window.closesAt, window.lateUntil, window.swapFrom, window.swapUntil,
        window.wishesPerGroup, JSON.stringify(window.dailyMinimum), window.showTeachers],
    )
    await appendAudit(client, {
      scopeId: id, actor: auditActor(actor), action: 'campaign.changed',
      metadata: { campaignId: id, projectDays: changes.projectDays.length, setUp: setUpChanged, window: windowChanged },
    })
    return true
  })
  return found ? readCampaign(db, id) : undefined
}

/** The campaign row locked for update, as a Campaign; the caller holds the scope lock already. */
async function lockedCampaign(client: Queryable, id: string): Promise<Campaign | undefined> {
  const { rows: [row] } = await client.query<CampaignRow>(`${SELECT} where c.id = $1 for update of c`, [id])
  return row === undefined ? undefined : toCampaign(row)
}

/**
 * Moves a campaign to `to`, under its lock, as school-core allows: into the
 * catalogue (proposals open) or published (the catalogue is final, and the
 * approved items are numbered for print). The later states are refused
 * until the slice that gives them meaning.
 */
export async function transitionCampaign(db: Database, rawId: string, to: CampaignState, actor: Actor): Promise<Campaign | undefined> {
  if (!AVAILABLE_TRANSITIONS.includes(to)) throw new RosterConflict('transition_not_available')
  const id = canonicalId(rawId)
  const found = await db.tx(async (client) => {
    await lockScope(client, id)
    const { rows: [current] } = await client.query<{ state: CampaignState }>('select state from campaign where id = $1 for update', [id])
    if (!current) return false
    const result = transition(current.state, to)
    if (!result.ok) throw new RosterConflict('invalid_transition')
    let numbered = 0
    if (to === 'published') numbered = await numberApprovedItems(client, id)
    await client.query('update campaign set state = $2, updated_at = now() where id = $1', [id, to])
    await appendAudit(client, { scopeId: id, actor: auditActor(actor), action: 'campaign.transitioned', metadata: { campaignId: id, from: current.state, to, numbered } })
    return true
  })
  return found ? readCampaign(db, id) : undefined
}

export async function readCampaign(db: Queryable, id: string): Promise<Campaign | undefined> {
  const { rows: [row] } = await db.query<CampaignRow>(`${SELECT} where c.id = $1`, [id])
  return row === undefined ? undefined : toCampaign(row)
}

/** The campaigns the caller may see, newest first. */
export async function listCampaigns(db: Queryable, caller: Pick<Caller, 'roles' | 'person'>): Promise<Campaign[]> {
  const { rows } = await db.query<CampaignRow>(`${SELECT} order by c.created_at desc limit 100`)
  return rows.map(toCampaign).filter((campaign) => canSee(caller, campaign.state))
}

export async function campaignCounts(db: Queryable, id: string): Promise<CampaignCounts> {
  const { rows } = await db.query<{ state: keyof CampaignCounts, n: string }>(
    'select state, count(*)::text as n from catalog_item where campaign_id = $1 group by state', [id],
  )
  const counts: CampaignCounts = { draft: 0, proposed: 0, approved: 0, withdrawn: 0 }
  for (const row of rows) counts[row.state] = Number(row.n)
  return counts
}

/** A class of the roster in force, for the pickers: its name and grade. */
export interface RosterClass {
  className: string
  grade: number
}

export async function rosterClasses(db: Queryable): Promise<RosterClass[]> {
  return (await rosterClassSizes(db)).map(({ className, grade }) => ({ className, grade }))
}

/** The classes of the roster in force with how many students each has, for the demand. */
export async function rosterClassSizes(db: Queryable): Promise<ClassSize[]> {
  const { rows } = await db.query<{ class_name: string, grade: number, students: string }>(
    `select e.class_name, e.grade, count(*)::text as students from roster_entry e
       join (select id from import_batch where state = 'committed' order by decided_at desc limit 1) c on c.id = e.batch_id
      where e.kind = 'student' and e.class_name is not null and e.grade is not null
      group by e.class_name, e.grade
      order by e.grade, e.class_name`,
  )
  return rows.map((row) => ({ className: row.class_name, grade: row.grade, students: Number(row.students) }))
}

/**
 * Places needed against places offered per project day and grade (D-13):
 * the roster's class sizes against the items that are proposed or approved,
 * by the dates their sessions touch. Drafts and withdrawn items count for
 * nothing.
 */
export async function campaignDemand(db: Queryable, campaign: Campaign): Promise<DayDemand[]> {
  const classes = await rosterClassSizes(db)
  const { rows } = await db.query<{ id: string, fixed_classes: string[], eligible_grades: number[], eligible_classes: string[], places: number, starts_at: Date, ends_at: Date }>(
    `select i.id, i.fixed_classes, i.eligible_grades, i.eligible_classes, i.places, s.starts_at, s.ends_at
       from catalog_item i join item_session s on s.item_id = i.id
      where i.campaign_id = $1 and i.state in ('proposed', 'approved')`,
    [campaign.id],
  )
  // One row per session; an item counts once per date its sessions touch.
  const items = new Map<string, OfferedItem>()
  for (const row of rows) {
    const item = items.get(row.id) ?? { fixedClasses: row.fixed_classes, eligibleGrades: row.eligible_grades, eligibleClasses: row.eligible_classes, places: row.places, dates: [] }
    const dates = new Set([...item.dates, ...datesOfSpan(row.starts_at.getTime(), row.ends_at.getTime())])
    items.set(row.id, { ...item, dates: [...dates] })
  }
  return demandByDay(campaign.projectDays, classes, [...items.values()])
}

/** A teacher of the roster in force, for naming the teachers of an activity. */
export interface RosterTeacher {
  personId: string
  displayName: string
}

export async function rosterTeachers(db: Queryable, q: string): Promise<RosterTeacher[]> {
  const pattern = `%${q.replaceAll(/[\\%_]/g, (c) => `\\${c}`)}%`
  const { rows } = await db.query<{ person_id: string, display_name: string }>(
    `select e.person_id, e.display_name from roster_entry e
       join (select id from import_batch where state = 'committed' order by decided_at desc limit 1) c on c.id = e.batch_id
      where e.kind = 'teacher' and e.person_id is not null and ($1 = '' or e.display_name ilike $2)
      order by e.display_name limit 200`,
    [q, pattern],
  )
  return rows.map((row) => ({ personId: row.person_id, displayName: row.display_name }))
}

interface CampaignRow {
  id: string
  kind: CampaignKind
  name: string
  school_year: string
  state: CampaignState
  project_days: string[]
  opens_at: Date | null
  closes_at: Date | null
  late_until: Date | null
  swap_from: Date | null
  swap_until: Date | null
  wishes_per_group: number
  daily_minimum: Record<string, number>
  show_teachers: boolean
  created_at: Date
  updated_at: Date
}

// Dates come back as text: the driver would otherwise make them Dates at
// local midnight, which is not what a project day is.
const SELECT = `select c.id, c.kind, c.name, c.school_year, c.state, c.project_days::text[] as project_days,
  c.opens_at, c.closes_at, c.late_until, c.swap_from, c.swap_until, c.wishes_per_group, c.daily_minimum, c.show_teachers, c.created_at, c.updated_at from campaign c`

function toCampaign(row: CampaignRow): Campaign {
  const iso = (value: Date | null) => value?.toISOString() ?? null
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    schoolYear: row.school_year,
    state: row.state,
    projectDays: row.project_days,
    opensAt: iso(row.opens_at),
    closesAt: iso(row.closes_at),
    lateUntil: iso(row.late_until),
    swapFrom: iso(row.swap_from),
    swapUntil: iso(row.swap_until),
    wishesPerGroup: row.wishes_per_group,
    dailyMinimum: row.daily_minimum,
    showTeachers: row.show_teachers,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
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
