// Campaigns in the database (docs/domain-and-api.md §1–2): set up by an
// organizer, moved through the lifecycle school-core guards, and read by
// everyone who may see them. Which states a person sees depends on who
// they are: organizers see every campaign, teachers also the ones taking
// proposals, everyone else what has been published.

import { transition, type CampaignState } from '@school-allocation/school-core'
import { appendAudit, lockScope, SCHOOL_SCOPE } from './audit.ts'
import type { Caller } from './auth.ts'
import type { Database, Queryable } from './db.ts'
import { numberApprovedItems } from './items.ts'
import { RosterConflict, type Actor } from './roster.ts'

export const CAMPAIGN_KINDS = ['project_week', 'wpf'] as const
export type CampaignKind = typeof CAMPAIGN_KINDS[number]

/** The states this release moves a campaign into; the choice window and everything after come with later slices. */
export const AVAILABLE_TRANSITIONS: readonly CampaignState[] = ['catalogue', 'published']

export interface Campaign {
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

export type CampaignChanges = Omit<NewCampaign, 'kind'>

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

/** Changes a campaign's name, year or days; only while it is being set up or taking proposals. */
export async function updateCampaign(db: Database, id: string, changes: CampaignChanges, actor: Actor): Promise<Campaign | undefined> {
  const found = await db.tx(async (client) => {
    await lockScope(client, id)
    const { rows: [current] } = await client.query<{ state: CampaignState }>('select state from campaign where id = $1 for update', [id])
    if (!current) return false
    if (current.state !== 'draft' && current.state !== 'catalogue') throw new RosterConflict('campaign_state')
    await client.query(
      'update campaign set name = $2, school_year = $3, project_days = $4::date[], updated_at = now() where id = $1',
      [id, changes.name, changes.schoolYear, changes.projectDays],
    )
    await appendAudit(client, { scopeId: id, actor: auditActor(actor), action: 'campaign.changed', metadata: { campaignId: id, projectDays: changes.projectDays.length } })
    return true
  })
  return found ? readCampaign(db, id) : undefined
}

/**
 * Moves a campaign to `to`, under its lock, as school-core allows: into the
 * catalogue (proposals open) or published (the catalogue is final, and the
 * approved items are numbered for print). The later states are refused
 * until the slice that gives them meaning.
 */
export async function transitionCampaign(db: Database, id: string, to: CampaignState, actor: Actor): Promise<Campaign | undefined> {
  if (!AVAILABLE_TRANSITIONS.includes(to)) throw new RosterConflict('transition_not_available')
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
  const { rows } = await db.query<{ class_name: string, grade: number }>(
    `select distinct e.class_name, e.grade from roster_entry e
       join (select id from import_batch where state = 'committed' order by decided_at desc limit 1) c on c.id = e.batch_id
      where e.kind = 'student' and e.class_name is not null and e.grade is not null
      order by e.grade, e.class_name`,
  )
  return rows.map((row) => ({ className: row.class_name, grade: row.grade }))
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
  created_at: Date
  updated_at: Date
}

// Dates come back as text: the driver would otherwise make them Dates at
// local midnight, which is not what a project day is.
const SELECT = 'select c.id, c.kind, c.name, c.school_year, c.state, c.project_days::text[] as project_days, c.created_at, c.updated_at from campaign c'

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    schoolYear: row.school_year,
    state: row.state,
    projectDays: row.project_days,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function auditActor(actor: Actor) {
  return { tid: actor.tid, oid: actor.oid, name: actor.name }
}
