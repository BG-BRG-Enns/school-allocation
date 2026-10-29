// Allocation runs (docs/domain-and-api.md §5, mvp-plan S4b): an organizer
// starts one on a closed campaign; the input is frozen as the snapshot
// under the campaign's lock; a job compiles the two passes, asks the solver,
// validates the answer with school-core and stores the rows, or stores why
// not; the campaign moves to review either way. Several runs per campaign;
// the review reads a run's numbers from its stored rows.

import { ALLOCATION_CONTRACT, assembleAssignments, cancelledOf, checkAllocationInput, compilePass, CORE_VERSION, explainStudent, summarizeAllocation, transition, validateAllocation, type AllocationInput, type AllocationResult, type Assignment, type CompiledPass, type PassResult, type SolveResponse } from '@school-allocation/school-core'
import { RUN_LIMITS } from '@school-allocation/api-contracts/allocation'
import { randomInt } from 'node:crypto'
import { createHash } from 'node:crypto'
import type { Actor } from '../lib/actor.ts'
import { appendAudit, lockScope } from '../lib/audit.ts'
import type { AuditActor } from '../lib/audit-chain.ts'
import { canonicalJson } from '../lib/canonical-json.ts'
import * as store from '../lib/dao/allocation.ts'
import { lockedCampaign, readCampaign, updateState } from '../lib/dao/campaigns.ts'
import { campaignStudents, listChoices } from '../lib/dao/choices.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { runJob } from '../lib/jobs.ts'
import type { AllocationRun, RunFinish, RunReviewResponse, RunStart, StoredRun } from '../lib/models/allocation.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import { SolverError, type SolverClient } from '../lib/solver-client.ts'
import { datesOfSpan, instantOf } from '../lib/time.ts'
import { catalogueItems } from './items.ts'

export interface AllocationDeps {
  /** null when SOLVER_URL is unset: no run can start. */
  solver: SolverClient | null
  log?: { error(fields: Record<string, unknown>, message: string): void }
}

/** The restart as an audit actor: the nil identity, named for what it is. */
export const RECOVERY_ACTOR: AuditActor = { tid: '00000000-0000-0000-0000-000000000000', oid: '00000000-0000-0000-0000-000000000000', name: 'Systemstart' }

const SOLVED = new Set(['OPTIMAL', 'FEASIBLE'])

/** The campaign as the compiler sees it: the frozen roster with the pre-assignments and the rankings, the approved catalogue. */
export async function snapshotOf(client: Queryable, campaign: Campaign, seed: number, deterministicTimePerLevel: number): Promise<AllocationInput> {
  const [students, fixed, choices, items] = await Promise.all([
    campaignStudents(client, campaign),
    store.fixedItemsByPerson(client, campaign.id),
    listChoices(client, campaign),
    catalogueItems(client, campaign.id),
  ])
  const saved = new Map(choices.map((c) => [c.personId, c]))
  return {
    projectDays: campaign.projectDays,
    dailyMinimum: campaign.dailyMinimum,
    wishesPerGroup: campaign.wishesPerGroup,
    seed,
    limits: { deterministicTimePerLevel },
    students: students.map((s) => {
      const choice = saved.get(s.personId)
      return { personId: s.personId, className: s.className, grade: s.grade, fixedItemIds: fixed.get(s.personId) ?? [], ranking: choice?.ranking ?? null, savedIn: choice?.savedIn ?? null }
    }),
    items: items.map((item) => ({
      id: item.id,
      feeCents: item.feeCents,
      rules: { fixedClasses: item.fixedClasses, eligibleGrades: item.eligibleGrades, eligibleClasses: item.eligibleClasses, places: item.places, minParticipants: item.minParticipants, cancellableBelowMin: item.cancellableBelowMin },
      sessions: item.sessions.map((s) => {
        const startMs = instantOf(s.startsAt) ?? 0
        const endMs = instantOf(s.endsAt) ?? 0
        return { startMs, endMs, dates: datesOfSpan(startMs, endMs), credits: s.credits }
      }),
    })),
  }
}

/** The hash of a snapshot without the seed and the limit: two runs of the same campaign as it stood share it, whatever their lot. */
export function snapshotHash(input: AllocationInput): string {
  return createHash('sha256').update(canonicalJson({ ...input, seed: 0, limits: { deterministicTimePerLevel: 0 } })).digest('hex')
}

/**
 * Starts a run: under the campaign's lock, on a closed campaign or one in
 * review, when no run is executing and the solver is configured; the input
 * is frozen and checked, the campaign moves to allocating, and the job runs
 * after the request. Returns the run and the job's promise, which the route
 * leaves to run and the tests await.
 */
export async function startRun(db: Database, deps: AllocationDeps, campaign: Campaign, start: RunStart, actor: Actor): Promise<{ run: AllocationRun, done: Promise<void> }> {
  if (deps.solver === null) throw new ApplicationError('solver_off')
  const seed = start.seed ?? randomInt(0, RUN_LIMITS.maxSeed + 1)
  const limit = start.deterministicTimePerLevel ?? RUN_LIMITS.defaultDeterministicTimePerLevel
  const runId = await db.tx(async (client) => {
    await lockScope(client, campaign.id)
    const current = await lockedCampaign(client, campaign.id)
    if (!current) throw new ApplicationError('not_found')
    // A run executing is the first answer, before the state it holds the campaign in.
    if (await store.hasRunningRun(client, campaign.id)) throw new ApplicationError('run_in_progress')
    const result = transition(current.state, 'allocating')
    if (!result.ok) throw new ApplicationError('campaign_state')
    const snapshot = await snapshotOf(client, current, seed, limit)
    const check = checkAllocationInput(snapshot)
    for (const problem of check.problems) {
      if (problem.code === 'daily_minimum_missing') throw new ApplicationError('daily_minimum_missing', `grades ${(problem.grades ?? []).join(', ')}`)
      if (problem.code === 'fixed_items_overlap') throw new ApplicationError('fixed_items_overlap', `${problem.personId ?? ''}: ${(problem.itemIds ?? []).join(', ')}`)
      if (problem.code === 'no_students') throw new ApplicationError('no_students')
    }
    const inserted = await store.insertRun(client, {
      campaignId: campaign.id, startedBy: actor.id, seed, limits: { deterministicTimePerLevel: limit }, coreVersion: CORE_VERSION, contract: ALLOCATION_CONTRACT,
      snapshot, snapshotSha256: snapshotHash(snapshot), warnings: check.warnings,
    })
    await updateState(client, campaign.id, 'allocating')
    const auditActor = { tid: actor.tid, oid: actor.oid, name: actor.name }
    await appendAudit(client, { scopeId: campaign.id, actor: auditActor, action: 'campaign.transitioned', metadata: { campaignId: campaign.id, from: current.state, to: 'allocating', runId: inserted.id } })
    await appendAudit(client, { scopeId: campaign.id, actor: auditActor, action: 'run.started', metadata: { runId: inserted.id, seq: inserted.seq, seed, deterministicTimePerLevel: limit, warnings: check.warnings.length } })
    return inserted.id
  })
  const run = await store.readRunById(db, runId)
  if (!run) throw new Error('the run just written is gone')
  const done = executeRun(db, deps, run).catch((err: unknown) => deps.log?.error({ err, runId }, 'the allocation run failed outside its result'))
  const { snapshot: _snapshot, passResults: _passes, ...view } = run
  return { run: view, done }
}

/** The job: compile, solve, validate, store; then the campaign to review, whatever came of it. */
async function executeRun(db: Database, deps: AllocationDeps, run: StoredRun): Promise<void> {
  await runJob(db, 'allocation_run', run.startedBy.id, async () => {
    const outcome = await compute(deps, run)
    await db.tx(async (client) => {
      await lockScope(client, run.campaignId)
      // A restart marked the run interrupted meanwhile: its late result is nobody's.
      if (!await store.claimRunning(client, run.id)) return
      if (outcome.finish.status === 'succeeded') await store.insertAssignments(client, run.id, outcome.rows)
      await store.finishRun(client, run.id, outcome.finish)
      const current = await lockedCampaign(client, run.campaignId)
      if (current?.state === 'allocating') await updateState(client, run.campaignId, 'review')
      const actor = (await store.actorOfUser(client, run.startedBy.id)) ?? RECOVERY_ACTOR
      await appendAudit(client, {
        scopeId: run.campaignId, actor, action: 'run.finished',
        metadata: { runId: run.id, seq: run.seq, status: outcome.finish.status, failure: outcome.finish.failure ?? '', cancelled: outcome.finish.cancelled.length, assignments: outcome.rows.length, byJob: true },
      })
      if (current?.state === 'allocating') {
        await appendAudit(client, { scopeId: run.campaignId, actor, action: 'campaign.transitioned', metadata: { campaignId: run.campaignId, from: 'allocating', to: 'review', runId: run.id } })
      }
    })
  })
}

const failed = (failure: RunFinish['failure'], detail: string, passes: PassResult[] = [], versions: RunFinish['versions'] = null): { finish: RunFinish, rows: Assignment[] } =>
  ({ finish: { status: 'failed', passes, cancelled: [], versions, failure, detail: detail.slice(0, 4000), problems: [] }, rows: [] })

/** The two passes against the solver and the validator; never throws, the outcome says what happened. */
async function compute(deps: AllocationDeps, run: StoredRun): Promise<{ finish: RunFinish, rows: Assignment[] }> {
  if (deps.solver === null) return failed('solver_unreachable', 'no solver is configured')
  const input = run.snapshot
  const passes: PassResult[] = []
  let versions: RunFinish['versions'] = null
  try {
    for (const pass of [1, 2] as const) {
      const compiled = compilePass(input, pass, run.id, passes[0])
      const response = await deps.solver.solve(compiled.request)
      versions = response.versions
      if (!SOLVED.has(response.status)) {
        const code = response.status === 'INFEASIBLE' ? 'solver_infeasible' : response.status === 'UNKNOWN' ? 'solver_unknown' : 'model_invalid'
        passes.push({ status: response.status, levels: response.levels, assign: [], cancelled: [] })
        return failed(code, `pass ${pass}: ${response.status}${response.detail ? ` (${response.detail})` : ''}`, passes, versions)
      }
      passes.push(toPassResult(compiled, response))
    }
    const result: AllocationResult = { passes: [passes[0] as PassResult, passes[1] as PassResult] }
    const problems = validateAllocation(input, result)
    if (problems.length > 0) {
      return { finish: { status: 'failed', passes, cancelled: cancelledOf(result), versions, failure: 'validation_failed', detail: `${problems.length} problem(s): ${problems.slice(0, 5).map((p) => p.code).join(', ')}`, problems }, rows: [] }
    }
    const rows = assembleAssignments(input, result)
    return { finish: { status: 'succeeded', passes, cancelled: cancelledOf(result), versions, failure: null, detail: null, problems: [] }, rows }
  } catch (err) {
    if (err instanceof SolverError) return failed(err.code, err.message, passes, versions)
    return failed('internal_error', (err as Error).name, passes, versions)
  }
}

/** The solver's indices back to the campaign's ids; an index outside the request is an answer off the contract. */
function toPassResult(compiled: CompiledPass, response: SolveResponse): PassResult {
  const person = (s: number) => {
    const id = compiled.personIds[s]
    if (id === undefined) throw new SolverError('solver_answer_invalid', `student index ${s} is not in the request`)
    return id
  }
  const item = (o: number) => {
    const id = compiled.itemIds[o]
    if (id === undefined) throw new SolverError('solver_answer_invalid', `item index ${o} is not in the request`)
    return id
  }
  return { status: response.status, levels: response.levels, assign: response.assign.map(([s, o]) => [person(s), item(o)]), cancelled: response.cancelled.map(item) }
}

/** At start: runs left running by the previous process are interrupted, their campaigns moved to review, audited as the restart's doing. */
export async function recoverInterruptedRuns(db: Database): Promise<number> {
  return db.tx(async (client) => {
    const runs = await store.interruptRunningRuns(client)
    for (const run of runs) {
      await lockScope(client, run.campaignId)
      const current = await lockedCampaign(client, run.campaignId)
      if (current?.state === 'allocating') await updateState(client, run.campaignId, 'review')
      await appendAudit(client, { scopeId: run.campaignId, actor: RECOVERY_ACTOR, action: 'run.interrupted', metadata: { runId: run.id, seq: run.seq, campaignState: current?.state ?? '' } })
    }
    return runs.length
  })
}

export async function listRuns(db: Queryable, deps: AllocationDeps, campaign: Campaign): Promise<{ runs: AllocationRun[], solverConfigured: boolean }> {
  return { runs: await store.listRuns(db, campaign.id), solverConfigured: deps.solver !== null }
}

/** A run's review: its numbers from the stored rows, every student with their explanation, the items with their counts, and whether the campaign moved on since. */
export async function runReview(db: Queryable, campaign: Campaign, runId: string): Promise<RunReviewResponse> {
  const run = await store.readRun(db, campaign.id, runId.toLowerCase())
  if (!run) throw new ApplicationError('not_found')
  const [rows, students, items, current] = await Promise.all([store.listAssignments(db, run.id), campaignStudents(db, campaign), catalogueItems(db, campaign.id), snapshotOf(db, campaign, 0, 0)])
  const { snapshot, passResults: _passes, ...view } = run
  const summary = run.status === 'succeeded' ? summarizeAllocation(snapshot, rows, run.cancelledItemIds) : null
  const named = new Map(students.map((s) => [s.personId, s]))
  const byId = new Map(items.map((item) => [item.id, item]))
  const cancelled = new Set(run.cancelledItemIds)
  return {
    run: view,
    stale: snapshotHash(current) !== run.snapshotSha256,
    summary,
    students: snapshot.students.map((s) => {
      const student = named.get(s.personId)
      const explanation = explainStudent(snapshot, rows, s.personId)
      return { personId: s.personId, displayName: student?.displayName ?? '', className: s.className, grade: s.grade, window: s.savedIn, items: explanation?.items ?? [], days: explanation?.days ?? [], averageRank: explanation?.averageRank ?? null }
    }).sort((a, b) => a.className.localeCompare(b.className, 'de') || a.displayName.localeCompare(b.displayName, 'de')),
    items: snapshot.items.map((i) => {
      const item = byId.get(i.id)
      const counts = summary?.items.find((x) => x.itemId === i.id)
      return { itemId: i.id, title: item?.title ?? '', number: item?.number ?? null, feeCents: i.feeCents, fixed: counts?.fixed ?? rows.filter((r) => r.itemId === i.id && r.source === 'fixed').length, assigned: counts?.assigned ?? 0, places: i.rules.places, minimum: i.rules.fixedClasses.length > 0 ? 0 : i.rules.minParticipants, cancelled: cancelled.has(i.id) }
    }).sort((a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title, 'de')),
    projectDays: campaign.projectDays,
  }
}

export async function solverStatus(deps: AllocationDeps): Promise<{ configured: boolean, reachable: boolean, ortools: string | null, contract: string | null }> {
  if (deps.solver === null) return { configured: false, reachable: false, ortools: null, contract: null }
  try {
    const health = await deps.solver.health()
    return { configured: true, reachable: true, ortools: health.ortools, contract: health.contract }
  } catch {
    return { configured: true, reachable: false, ortools: null, contract: null }
  }
}

/** The campaign a run belongs to, for the review routes. */
export async function runCampaign(db: Queryable, id: string): Promise<Campaign> {
  const campaign = await readCampaign(db, id.toLowerCase())
  if (!campaign) throw new ApplicationError('not_found')
  return campaign
}
