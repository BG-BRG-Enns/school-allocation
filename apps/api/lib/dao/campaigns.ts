import { type ClassSize } from '@school-allocation/school-core'
import { type Actor } from '../actor.ts'
import type { Queryable } from '../db.ts'
import type { Campaign, CampaignChanges, CampaignCounts, CampaignWindow, NewCampaign, RosterClass, RosterTeacher } from '../models/campaigns.ts'
import type { CampaignRow } from './campaigns-rows.ts'
import { CURRENT_BATCH_ID } from './roster-selection.ts'

/** The campaign row locked for update, as a Campaign; the caller holds the scope lock already. */
export async function lockedCampaign(client: Queryable, id: string): Promise<Campaign | undefined> {
  const { rows: [row] } = await client.query<CampaignRow>(`${SELECT} where c.id = $1 for update of c`, [id])
  return row === undefined ? undefined : toCampaign(row)
}

export async function readCampaign(db: Queryable, id: string): Promise<Campaign | undefined> {
  const { rows: [row] } = await db.query<CampaignRow>(`${SELECT} where c.id = $1`, [id])
  return row === undefined ? undefined : toCampaign(row)
}

export async function campaignCounts(db: Queryable, id: string): Promise<CampaignCounts> {
  const { rows } = await db.query<{ state: keyof CampaignCounts, n: string }>(
    'select state, count(*)::text as n from catalog_item where campaign_id = $1 group by state', [id],
  )
  const counts: CampaignCounts = { draft: 0, proposed: 0, approved: 0, withdrawn: 0 }
  for (const row of rows) counts[row.state] = Number(row.n)
  return counts
}

export async function rosterClasses(db: Queryable): Promise<RosterClass[]> {
  return (await rosterClassSizes(db)).map(({ className, grade }) => ({ className, grade }))
}

/** The classes of the roster in force with how many students each has, for the demand. */
export async function rosterClassSizes(db: Queryable): Promise<ClassSize[]> {
  const { rows } = await db.query<{ class_name: string, grade: number, students: string }>(
    `select e.class_name, e.grade, count(*)::text as students from roster_entry e
       join ${CURRENT_BATCH_ID} c on c.id = e.batch_id
      where e.kind = 'student' and e.class_name is not null and e.grade is not null
      group by e.class_name, e.grade
      order by e.grade, e.class_name`,
  )
  return rows.map((row) => ({ className: row.class_name, grade: row.grade, students: Number(row.students) }))
}

export async function rosterTeachers(db: Queryable, q: string): Promise<RosterTeacher[]> {
  const pattern = `%${q.replaceAll(/[\\%_]/g, (c) => `\\${c}`)}%`
  const { rows } = await db.query<{ person_id: string, display_name: string }>(
    `select e.person_id, e.display_name from roster_entry e
       join ${CURRENT_BATCH_ID} c on c.id = e.batch_id
      where e.kind = 'teacher' and e.person_id is not null and ($1 = '' or e.display_name ilike $2)
      order by e.display_name limit 200`,
    [q, pattern],
  )
  return rows.map((row) => ({ personId: row.person_id, displayName: row.display_name }))
}

// Dates come back as text: the driver would otherwise make them Dates at
// local midnight, which is not what a project day is.
const SELECT = `select c.id, c.kind, c.name, c.school_year, c.state, c.project_days::text[] as project_days,
  c.opens_at, c.closes_at, c.late_until, c.swap_from, c.swap_until, c.wishes_per_group, c.daily_minimum, c.show_teachers, c.reminder_days,
  c.roster_batch_id, c.created_at, c.updated_at from campaign c`

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
    reminderDays: row.reminder_days,
    rosterBatchId: row.roster_batch_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export async function insertCampaign(db: Queryable, input: NewCampaign, actor: Actor) {
  const { rows: [row] } = await db.query<{ id: string }>(
    'insert into campaign (kind, name, school_year, project_days, created_by) values ($1, $2, $3, $4::date[], $5) returning id',
    [input.kind, input.name, input.schoolYear, input.projectDays, actor.id],
  )
  return row === undefined ? undefined : ({ id: row.id })
}

export async function listActiveSessions(db: Queryable, id: string) {
  const { rows } = await db.query<{ starts_at: Date, ends_at: Date }>(
    `select s.starts_at, s.ends_at from item_session s join catalog_item i on i.id = s.item_id where i.campaign_id = $1 and i.state <> 'withdrawn'`, [id],
  )
  return rows.map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at }))
}

export async function updateSettings(db: Queryable, id: string, changes: CampaignChanges, window: CampaignWindow) {
  await db.query(
    `update campaign set name = $2, school_year = $3, project_days = $4::date[], opens_at = $5, closes_at = $6, late_until = $7, swap_from = $8, swap_until = $9,
              wishes_per_group = $10, daily_minimum = $11, show_teachers = $12, reminder_days = $13, updated_at = app_now() where id = $1`,
    [id, changes.name, changes.schoolYear, changes.projectDays, window.opensAt, window.closesAt, window.lateUntil, window.swapFrom, window.swapUntil,
      window.wishesPerGroup, JSON.stringify(window.dailyMinimum), window.showTeachers, window.reminderDays],
  )
}

export async function updateState(db: Queryable, id: string, to: string) {
  await db.query('update campaign set state = $2, updated_at = app_now() where id = $1', [id, to])
}

export async function listCampaigns(db: Queryable) {
  const { rows } = await db.query<CampaignRow>(`${SELECT} order by c.created_at desc limit 100`)
  return rows.map((row) => toCampaign(row))
}

export async function listDemandSessions(db: Queryable, campaign: Campaign) {
  const { rows } = await db.query<{ id: string, fixed_classes: string[], eligible_grades: number[], eligible_classes: string[], places: number, starts_at: Date, ends_at: Date }>(
    `select i.id, i.fixed_classes, i.eligible_grades, i.eligible_classes, i.places, s.starts_at, s.ends_at
       from catalog_item i join item_session s on s.item_id = i.id
      where i.campaign_id = $1 and i.state in ('proposed', 'approved')`,
    [campaign.id],
  )
  return rows.map((row) => ({ id: row.id, fixedClasses: row.fixed_classes, eligibleGrades: row.eligible_grades, eligibleClasses: row.eligible_classes, places: row.places, startsAt: row.starts_at, endsAt: row.ends_at }))
}
