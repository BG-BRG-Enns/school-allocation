import type { AllocationInput, AllocationWarning, Assignment } from '@school-allocation/school-core'
import type { AuditActor } from '../audit-chain.ts'
import type { Queryable } from '../db.ts'
import type { AllocationRun, RunFinish, StoredChange, StoredRun } from '../models/allocation.ts'
import type { AssignmentRow, ChangeRow, RunRow, RunRowWithSnapshot } from './allocation-rows.ts'

const COLUMNS = `r.id, r.campaign_id, r.seq, r.status, r.started_at, r.finished_at, r.started_by, u.display_name as started_by_name, r.seed::text as seed,
  r.limits, r.core_version, r.contract, r.solver_version, r.ortools_version, r.snapshot_sha256, r.warnings, r.passes, r.cancelled_items, r.failure, r.detail, r.problems, r.published_at`
const FROM = 'from allocation_run r join app_user u on u.id = r.started_by'

function toRun(row: RunRow): AllocationRun {
  const iso = (value: Date | null) => value?.toISOString() ?? null
  return {
    id: row.id,
    campaignId: row.campaign_id,
    seq: row.seq,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    finishedAt: iso(row.finished_at),
    startedBy: { id: row.started_by, displayName: row.started_by_name },
    seed: Number(row.seed),
    limits: { deterministicTimePerLevel: row.limits.deterministicTimePerLevel },
    coreVersion: row.core_version,
    contract: row.contract,
    versions: row.solver_version === null || row.ortools_version === null ? null : { solver: row.solver_version, ortools: row.ortools_version },
    snapshotSha256: row.snapshot_sha256,
    warnings: row.warnings,
    passes: row.passes.map((p, index) => ({ pass: index === 0 ? 1 : 2, status: p.status, levels: p.levels })),
    cancelledItemIds: row.cancelled_items,
    failure: row.failure,
    detail: row.detail,
    problems: row.problems,
    publishedAt: iso(row.published_at),
  }
}

/** The runs of a campaign, newest first, without their snapshots. */
export async function listRuns(db: Queryable, campaignId: string): Promise<AllocationRun[]> {
  const { rows } = await db.query<RunRow>(`select ${COLUMNS} ${FROM} where r.campaign_id = $1 order by r.seq desc`, [campaignId])
  return rows.map(toRun)
}

/** One run of a campaign with its snapshot and the passes' pairs; undefined when the campaign has no such run. */
export async function readRun(db: Queryable, campaignId: string, runId: string): Promise<StoredRun | undefined> {
  const { rows: [row] } = await db.query<RunRowWithSnapshot>(`select ${COLUMNS}, r.snapshot ${FROM} where r.campaign_id = $1 and r.id = $2`, [campaignId, runId])
  return row === undefined ? undefined : { ...toRun(row), snapshot: row.snapshot, passResults: row.passes }
}

/** The run the job works on, by id alone. */
export async function readRunById(db: Queryable, runId: string): Promise<StoredRun | undefined> {
  const { rows: [row] } = await db.query<RunRowWithSnapshot>(`select ${COLUMNS}, r.snapshot ${FROM} where r.id = $1`, [runId])
  return row === undefined ? undefined : { ...toRun(row), snapshot: row.snapshot, passResults: row.passes }
}

/** Whether a run of the campaign is still executing; the caller holds the campaign's lock. */
export async function hasRunningRun(client: Queryable, campaignId: string): Promise<boolean> {
  const { rowCount } = await client.query('select 1 from allocation_run where campaign_id = $1 and status = \'running\'', [campaignId])
  return (rowCount ?? 0) > 0
}

export interface NewRun {
  campaignId: string
  startedBy: string
  seed: number
  limits: { deterministicTimePerLevel: number }
  coreVersion: number
  contract: string
  snapshot: AllocationInput
  snapshotSha256: string
  warnings: AllocationWarning[]
}

/** Inserts the run as the campaign's next; the caller holds the campaign's lock, so the sequence has no gaps or doubles. */
export async function insertRun(client: Queryable, run: NewRun): Promise<{ id: string, seq: number }> {
  const { rows: [row] } = await client.query<{ id: string, seq: number }>(
    `insert into allocation_run (campaign_id, seq, started_by, seed, limits, core_version, contract, snapshot, snapshot_sha256, warnings)
     values ($1, (select coalesce(max(seq), 0) + 1 from allocation_run where campaign_id = $1), $2, $3, $4, $5, $6, $7, $8, $9)
     returning id, seq`,
    [run.campaignId, run.startedBy, String(run.seed), JSON.stringify(run.limits), run.coreVersion, run.contract, JSON.stringify(run.snapshot), run.snapshotSha256, JSON.stringify(run.warnings)],
  )
  if (!row) throw new Error('allocation_run insert returned no row')
  return row
}

/** Locks the run for the finishing transaction and says whether it is still running: a run interrupted meanwhile takes no result. */
export async function claimRunning(client: Queryable, runId: string): Promise<boolean> {
  const { rows: [row] } = await client.query<{ status: string }>('select status from allocation_run where id = $1 for update', [runId])
  return row?.status === 'running'
}

export async function finishRun(client: Queryable, runId: string, finish: RunFinish): Promise<void> {
  await client.query(
    `update allocation_run set status = $2, finished_at = now(), passes = $3, cancelled_items = $4::uuid[], solver_version = $5, ortools_version = $6, failure = $7, detail = $8, problems = $9
      where id = $1 and status = 'running'`,
    [runId, finish.status, JSON.stringify(finish.passes), finish.cancelled, finish.versions?.solver ?? null, finish.versions?.ortools ?? null, finish.failure, finish.detail, JSON.stringify(finish.problems)],
  )
}

/** The rows of a result, in one statement; `wish` is stored as `solver`, the word the schema uses for what the solver gave. */
export async function insertAssignments(client: Queryable, runId: string, rows: readonly Assignment[]): Promise<void> {
  if (rows.length === 0) return
  await client.query(
    `insert into assignment (run_id, person_id, item_id, source, pass, rank)
     select $1, person_id, item_id, source, pass, rank
       from unnest($2::uuid[], $3::uuid[], $4::text[], $5::smallint[], $6::smallint[]) as t (person_id, item_id, source, pass, rank)`,
    [runId, rows.map((r) => r.personId), rows.map((r) => r.itemId), rows.map((r) => (r.source === 'wish' ? 'solver' : r.source)), rows.map((r) => r.pass), rows.map((r) => r.rank)],
  )
}

/** The current rows of a run as school-core reads them: those no change has superseded. */
export async function listAssignments(db: Queryable, runId: string): Promise<Assignment[]> {
  const { rows } = await db.query<AssignmentRow>('select person_id, item_id, source, pass, rank from assignment where run_id = $1 and superseded_by is null order by person_id, item_id', [runId])
  return rows.map((row) => ({ personId: row.person_id, itemId: row.item_id, source: row.source === 'solver' ? 'wish' : row.source, pass: row.pass, rank: row.rank }))
}

export interface NewChange {
  runId: string
  kind: ChangeRow['kind']
  personId: string
  fromItemId: string | null
  toItemId: string | null
  reason: string | null
  forced: boolean
  changedBy: string
}

/** Writes a change as the run's next; the caller holds the campaign's lock, so the sequence has no gaps or doubles. */
export async function insertChange(client: Queryable, change: NewChange): Promise<{ id: string, seq: number }> {
  const { rows: [row] } = await client.query<{ id: string, seq: number }>(
    `insert into assignment_change (run_id, seq, kind, person_id, from_item_id, to_item_id, reason, forced, changed_by)
     values ($1, (select coalesce(max(seq), 0) + 1 from assignment_change where run_id = $1), $2, $3, $4, $5, $6, $7, $8)
     returning id, seq`,
    [change.runId, change.kind, change.personId, change.fromItemId, change.toItemId, change.reason, change.forced, change.changedBy],
  )
  if (!row) throw new Error('assignment_change insert returned no row')
  return row
}

/** Supersedes the student's current rows in `itemIds` by the change; returns how many it found, which the caller compares with what it checked. */
export async function supersedeAssignments(client: Queryable, runId: string, personId: string, itemIds: readonly string[], changeId: string): Promise<number> {
  if (itemIds.length === 0) return 0
  const { rowCount } = await client.query(
    'update assignment set superseded_by = $4 where run_id = $1 and person_id = $2 and item_id = any($3::uuid[]) and superseded_by is null',
    [runId, personId, itemIds, changeId],
  )
  return rowCount ?? 0
}

/** The row a change adds: the student in the item by their own move or by hand. */
export async function insertChangedAssignment(client: Queryable, runId: string, personId: string, itemId: string, source: 'swap' | 'manual', changeId: string): Promise<void> {
  await client.query('insert into assignment (run_id, person_id, item_id, source, change_id) values ($1, $2, $3, $4, $5)', [runId, personId, itemId, source, changeId])
}

/** The changes of a run, oldest first, each with the items its rows left. */
export async function listChanges(db: Queryable, runId: string): Promise<StoredChange[]> {
  const { rows } = await db.query<ChangeRow>(
    `select c.id, c.seq, c.kind, c.person_id, c.to_item_id, c.reason, c.forced, c.changed_by, u.display_name as changed_by_name, c.changed_at,
            coalesce((select array_agg(a.item_id order by a.item_id) from assignment a where a.superseded_by = c.id), '{}') as left_item_ids
       from assignment_change c join app_user u on u.id = c.changed_by
      where c.run_id = $1 order by c.seq`,
    [runId],
  )
  return rows.map((row) => ({
    id: row.id, seq: row.seq, kind: row.kind, personId: row.person_id, toItemId: row.to_item_id, leftItemIds: row.left_item_ids, reason: row.reason, forced: row.forced,
    changedBy: { id: row.changed_by, displayName: row.changed_by_name }, changedAt: row.changed_at.toISOString(),
  }))
}

/** At start: every run still `running` was interrupted by the previous process's end. Returns them. */
/** The runs still marked running, by campaign: what a restart has to interrupt. */
export async function runningRuns(client: Queryable): Promise<{ id: string, campaignId: string, seq: number }[]> {
  const { rows } = await client.query<{ id: string, campaign_id: string, seq: number }>('select id, campaign_id, seq from allocation_run where status = \'running\' order by campaign_id, seq')
  return rows.map((row) => ({ id: row.id, campaignId: row.campaign_id, seq: row.seq }))
}

/** Marks one run interrupted if it is still running; false when a job finished it meanwhile. */
export async function interruptRun(client: Queryable, runId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    'update allocation_run set status = \'interrupted\', finished_at = now(), failure = \'internal_error\', detail = \'interrupted by a restart\' where id = $1 and status = \'running\'',
    [runId],
  )
  return rowCount === 1
}

/** Person id → the items they are placed into by class, exemptions left out. */
export async function fixedItemsByPerson(db: Queryable, campaignId: string): Promise<Map<string, string[]>> {
  const { rows } = await db.query<{ person_id: string, item_id: string }>('select person_id, item_id from pre_assignment where campaign_id = $1 and exempted_at is null order by person_id, item_id', [campaignId])
  const byPerson = new Map<string, string[]>()
  for (const row of rows) {
    const list = byPerson.get(row.person_id) ?? []
    list.push(row.item_id)
    byPerson.set(row.person_id, list)
  }
  return byPerson
}

/** The identity of the account that started a run, as the audit actor of what the job does on their behalf. */
export async function actorOfUser(db: Queryable, userId: string): Promise<AuditActor | undefined> {
  const { rows: [row] } = await db.query<{ tid: string, oid: string, display_name: string }>('select tid, oid, display_name from app_user where id = $1', [userId])
  return row === undefined ? undefined : { tid: row.tid, oid: row.oid, name: row.display_name }
}

/** The campaign's published run, with its snapshot; undefined before publication. */
export async function readPublishedRun(db: Queryable, campaignId: string): Promise<StoredRun | undefined> {
  const { rows: [row] } = await db.query<RunRowWithSnapshot>(`select ${COLUMNS}, r.snapshot ${FROM} where r.campaign_id = $1 and r.published_at is not null`, [campaignId])
  return row === undefined ? undefined : { ...toRun(row), snapshot: row.snapshot, passResults: row.passes }
}

/** The run locked for publication; the caller holds the campaign's lock and checks what it finds. */
export async function lockRun(client: Queryable, campaignId: string, runId: string): Promise<StoredRun | undefined> {
  const { rows: [row] } = await client.query<RunRowWithSnapshot>(`select ${COLUMNS}, r.snapshot ${FROM} where r.campaign_id = $1 and r.id = $2 for update of r`, [campaignId, runId])
  return row === undefined ? undefined : { ...toRun(row), snapshot: row.snapshot, passResults: row.passes }
}

export async function markPublished(client: Queryable, runId: string, userId: string): Promise<void> {
  await client.query('update allocation_run set published_at = now(), published_by = $2 where id = $1 and published_at is null', [runId, userId])
}

/** The teachers among `personIds` with an address, from the campaign's roster. */
export async function teacherAddresses(db: Queryable, batchId: string | null, personIds: readonly string[]): Promise<Map<string, { displayName: string, address: string }>> {
  if (personIds.length === 0) return new Map()
  const { rows } = await db.query<{ person_id: string, display_name: string, address: string }>(
    `select e.person_id, e.display_name, coalesce(e.mail, e.upn) as address from roster_entry e
      where e.batch_id = coalesce($1::uuid, (select id from import_batch where state = 'committed' order by decided_at desc limit 1))
        and e.kind = 'teacher' and e.person_id = any($2::uuid[]) and coalesce(e.mail, e.upn) is not null`,
    [batchId, personIds],
  )
  return new Map(rows.map((row) => [row.person_id, { displayName: row.display_name, address: row.address }]))
}
