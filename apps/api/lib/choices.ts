// The choice window in the database (docs/domain-and-api.md §3, D-05,
// D-06, D-24): the pre-assignments materialized when it opens, what a
// student is offered and has ranked, the saving of a ranking with its
// revision, an organizer's exemption or entry on behalf, and the list of
// who has not chosen. The rules are school-core's; this module hands them
// the stored rows.

import { acceptsChoices, checkRanking, isComplete, offeredTo, timeGroupsOf, wishesRequired, type Ranking, type RankingProblem, type TimeGroup } from '@school-allocation/school-core'
import { appendAudit, lockScope } from './audit.ts'
import type { Caller } from './auth.ts'
import type { Campaign } from './campaigns.ts'
import type { Database, Queryable } from './db.ts'
import { catalogueItems, type Item } from './items.ts'
import { reconcilePreAssignments } from './pre-assignments.ts'
import { RosterConflict } from './roster.ts'
import { instantOf } from './time.ts'

/** A student of the campaign's roster: the batch frozen at the close, or the one in force. */
export interface CampaignStudent {
  personId: string
  displayName: string
  className: string
  grade: number
  /** Where a notice reaches them; null when the roster has no address. */
  address: string | null
}

/** The roster batch the campaign goes by: the one frozen at its close, else the one in force. */
export function rosterBatchClause(campaign: Pick<Campaign, 'rosterBatchId'>): string {
  return campaign.rosterBatchId === null
    ? '(select id from import_batch where state = \'committed\' order by decided_at desc limit 1)'
    : `'${campaign.rosterBatchId}'::uuid`
}

export async function campaignStudents(db: Queryable, campaign: Pick<Campaign, 'rosterBatchId'>, className?: string): Promise<CampaignStudent[]> {
  const { rows } = await db.query<{ person_id: string, display_name: string, class_name: string, grade: number, address: string | null }>(
    `select e.person_id, e.display_name, e.class_name, e.grade, coalesce(e.mail, e.upn) as address
       from roster_entry e
      where e.batch_id = ${rosterBatchClause(campaign)} and e.kind = 'student' and e.person_id is not null
        and e.class_name is not null and e.grade is not null and ($1::text is null or e.class_name = $1)
      order by e.class_name, e.display_name`,
    [className ?? null],
  )
  return rows.map((row) => ({ personId: row.person_id, displayName: row.display_name, className: row.class_name, grade: row.grade, address: row.address }))
}

/** One student of the campaign's roster by person id; undefined when the roster does not list them as a student. */
export async function campaignStudent(db: Queryable, campaign: Pick<Campaign, 'rosterBatchId'>, personId: string): Promise<CampaignStudent | undefined> {
  const { rows: [row] } = await db.query<{ display_name: string, class_name: string, grade: number, address: string | null }>(
    `select e.display_name, e.class_name, e.grade, coalesce(e.mail, e.upn) as address from roster_entry e
      where e.batch_id = ${rosterBatchClause(campaign)} and e.kind = 'student' and e.person_id = $1 and e.class_name is not null and e.grade is not null`,
    [personId],
  )
  return row === undefined ? undefined : { personId, displayName: row.display_name, className: row.class_name, grade: row.grade, address: row.address }
}

/** Places every student of a class an approved item is fixed for into it (D-24), from the roster in force; called when the window opens. */
export async function materializePreAssignments(client: Queryable, campaign: Pick<Campaign, 'id'>): Promise<number> {
  return (await reconcilePreAssignments(client, campaign.id)).placed
}

/** The items a student is placed into, exemptions left out. */
async function fixedItemIds(db: Queryable, campaignId: string, personId: string): Promise<Set<string>> {
  const { rows } = await db.query<{ item_id: string }>('select item_id from pre_assignment where campaign_id = $1 and person_id = $2 and exempted_at is null', [campaignId, personId])
  return new Set(rows.map((row) => row.item_id))
}

/** A session as school-core spans it: epoch milliseconds. */
function spansOf(item: Item): { startMs: number, endMs: number }[] {
  return item.sessions.map((s) => ({ startMs: instantOf(s.startsAt) ?? 0, endMs: instantOf(s.endsAt) ?? 0 }))
}

export interface GroupView extends TimeGroup {
  startsAt: string
  endsAt: string
  items: Item[]
  /** How many wishes the group asks for: the cap, or fewer when fewer items are offered. */
  required: number
}

export interface ChoiceView {
  /** The items the student is placed into. */
  fixed: Item[]
  groups: GroupView[]
  ranking: Ranking
  window: 'first' | 'late' | null
  version: number
  cap: number
  complete: boolean
  /** Whether a save is taken now: the window is open or in its grace week. */
  acceptsChoices: boolean
  /** The student the view is for, so an organizer's page names them. */
  student: { personId: string, displayName: string, className: string, grade: number }
}

/** What a student sees and may rank, with what they have ranked. */
export async function choiceView(db: Queryable, campaign: Campaign, student: CampaignStudent): Promise<ChoiceView> {
  const items = await catalogueItems(db, campaign.id)
  const fixedIds = await fixedItemIds(db, campaign.id, student.personId)
  const fixed = items.filter((item) => fixedIds.has(item.id))
  const fixedSpans = fixed.flatMap(spansOf)
  const offerable = items.filter((item) => !fixedIds.has(item.id)).map((item) => ({ id: item.id, sessions: spansOf(item), rules: item }))
  const offered = offeredTo({ className: student.className, grade: student.grade }, offerable, fixedSpans)
  const byId = new Map(items.map((item) => [item.id, item]))
  const groups = timeGroupsOf(offered).map((group) => ({
    ...group,
    startsAt: new Date(group.startMs).toISOString(),
    endsAt: new Date(group.endMs).toISOString(),
    items: group.itemIds.map((id) => byId.get(id)).filter((item): item is Item => item !== undefined),
    required: wishesRequired(group, campaign.wishesPerGroup),
  }))
  const { rows: [saved] } = await db.query<{ ranking: Ranking, saved_in: 'first' | 'late', version: number }>(
    'select ranking, saved_in, version from choice where campaign_id = $1 and person_id = $2', [campaign.id, student.personId],
  )
  // Only what is offered now counts: a group or item the catalogue lost since the save is pruned from the
  // view (the revisions keep it), so a save never fails on a key the student cannot see.
  const ranking: Ranking = {}
  for (const group of groups) {
    const ids = (saved?.ranking[group.key] ?? []).filter((id) => group.itemIds.includes(id))
    if (ids.length > 0) ranking[group.key] = ids
  }
  return {
    fixed,
    groups,
    ranking,
    window: saved?.saved_in ?? null,
    version: saved?.version ?? 0,
    cap: campaign.wishesPerGroup,
    complete: isComplete(ranking, groups, campaign.wishesPerGroup),
    acceptsChoices: acceptsChoices(campaign.state),
    student: { personId: student.personId, displayName: student.displayName, className: student.className, grade: student.grade },
  }
}

/** A ranking breaks the rules; the problems are school-core's. */
export class ChoiceInvalid extends Error {
  override name = 'ChoiceInvalid'
  readonly problems: RankingProblem[]
  constructor(problems: RankingProblem[]) {
    super('ranking_invalid')
    this.problems = problems
  }
}

export interface SaveBy {
  caller: Caller
  /** Set when an organizer enters the list on the student's behalf; recorded and audited. */
  reason?: string
}

/**
 * Replaces a student's ranking, under the campaign's lock: only while the
 * window takes choices, only items the student is offered, at most the
 * cap per group. A list saved after the close is late (D-06). Every save
 * writes a revision; an organizer's save on behalf is audited as well.
 */
export async function saveRanking(db: Database, campaign: Campaign, student: CampaignStudent, ranking: Ranking, by: SaveBy, now = new Date()): Promise<ChoiceView> {
  await db.tx(async (client) => {
    await lockScope(client, campaign.id)
    const { rows: [current] } = await client.query<{ state: Campaign['state'], closes_at: Date | null, late_until: Date | null }>(
      'select state, closes_at, late_until from campaign where id = $1 for update', [campaign.id],
    )
    if (!current || !acceptsChoices(current.state)) throw new RosterConflict('campaign_state')
    // The clock under the lock, not the last tick: after the window's end nothing is taken, whatever the state still says.
    const end = current.late_until ?? current.closes_at
    if (end !== null && now.getTime() > end.getTime()) throw new RosterConflict('campaign_state')
    const view = await choiceView(client, { ...campaign, state: current.state }, student)
    const problems = checkRanking(ranking, view.groups, campaign.wishesPerGroup)
    if (problems.length > 0) throw new ChoiceInvalid(problems)
    // In order, each group once, so the stored object is canonical.
    const canonical: Ranking = {}
    for (const group of view.groups) {
      const ids = ranking[group.key]
      if (ids !== undefined && ids.length > 0) canonical[group.key] = [...ids]
    }
    // Late in the grace week, or after the close before the clock moved the state: the save is late either way.
    const window = current.state === 'grace' || (current.closes_at !== null && now.getTime() > current.closes_at.getTime()) ? 'late' : 'first'
    const { rows: [row] } = await client.query<{ version: number }>(
      `insert into choice (campaign_id, person_id, ranking, saved_in, version, entered_by) values ($1, $2, $3, $4, 1, $5)
       on conflict (campaign_id, person_id) do update set ranking = excluded.ranking, saved_in = excluded.saved_in, version = choice.version + 1, updated_at = now(), entered_by = excluded.entered_by
       returning version`,
      [campaign.id, student.personId, JSON.stringify(canonical), window, by.caller.id],
    )
    await client.query(
      'insert into choice_revision (campaign_id, person_id, version, ranking, saved_in, entered_by, reason) values ($1, $2, $3, $4, $5, $6, $7)',
      [campaign.id, student.personId, row?.version ?? 1, JSON.stringify(canonical), window, by.caller.id, by.reason ?? null],
    )
    if (by.reason !== undefined) {
      await appendAudit(client, {
        scopeId: campaign.id,
        actor: { tid: by.caller.tid, oid: by.caller.oid, name: by.caller.displayName },
        action: 'choice.entered-on-behalf',
        metadata: { personId: student.personId, version: row?.version ?? 1, window, reason: by.reason },
      })
    }
  })
  return choiceView(db, campaign, student)
}

/** An organizer exempts a student from a class activity, with a reason, audited; false when there is no such pre-assignment. */
export async function exemptPreAssignment(db: Database, campaign: Campaign, personId: string, itemId: string, reason: string, caller: Caller): Promise<boolean> {
  return db.tx(async (client) => {
    await lockScope(client, campaign.id)
    const { rows: [row] } = await client.query<{ exempted_at: Date | null }>(
      'select exempted_at from pre_assignment where campaign_id = $1 and person_id = $2 and item_id = $3 for update', [campaign.id, personId, itemId],
    )
    if (!row) return false
    if (row.exempted_at !== null) throw new RosterConflict('already_exempted')
    await client.query(
      'update pre_assignment set exempted_at = now(), exempted_by = $4, exempt_reason = $5 where campaign_id = $1 and person_id = $2 and item_id = $3',
      [campaign.id, personId, itemId, caller.id, reason],
    )
    await appendAudit(client, {
      scopeId: campaign.id,
      actor: { tid: caller.tid, oid: caller.oid, name: caller.displayName },
      action: 'preassignment.exempted',
      metadata: { personId, itemId, reason },
    })
    return true
  })
}

export type ChoiceState = 'none' | 'incomplete' | 'complete'

export interface StudentChoiceState extends CampaignStudent {
  state: ChoiceState
  window: 'first' | 'late' | null
  updatedAt: string | null
}

/**
 * Every student of the campaign's roster with the state of their list:
 * none, incomplete or complete, judged against what they are offered now.
 * The organizer's non-submitter list, the class teacher's page and the
 * reminders all read this.
 */
export async function choiceStates(db: Queryable, campaign: Campaign, className?: string): Promise<StudentChoiceState[]> {
  const students = await campaignStudents(db, campaign, className)
  const { rows } = await db.query<{ person_id: string, ranking: Ranking, saved_in: 'first' | 'late', updated_at: Date }>(
    'select person_id, ranking, saved_in, updated_at from choice where campaign_id = $1', [campaign.id],
  )
  const saved = new Map(rows.map((row) => [row.person_id, row]))
  const result: StudentChoiceState[] = []
  for (const student of students) {
    // Each student's groups depend on their class and fixed items; computed per student, which a school's roster allows.
    const view = await choiceView(db, campaign, student)
    const choice = saved.get(student.personId)
    // Nothing to rank (every day taken by class activities) is complete without a row.
    const state: ChoiceState = view.groups.length === 0 || (choice !== undefined && view.complete) ? 'complete' : (choice === undefined ? 'none' : 'incomplete')
    result.push({ ...student, state, window: choice?.saved_in ?? null, updatedAt: choice?.updated_at.toISOString() ?? null })
  }
  return result
}
