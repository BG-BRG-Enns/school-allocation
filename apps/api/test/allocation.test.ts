// Allocation runs on a real database against the solver stand-in: an
// organizer starts a run on a closed campaign and the job compiles,
// solves, validates and stores it; the review reads the numbers back; a
// run that cannot start says why; a solver that answers wrongly, says
// infeasible or is gone leaves a failed run and a campaign in review; a
// run interrupted by a restart is marked so; who may see what.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AllocationRun, RunReviewResponse } from '@school-allocation/api-contracts'
import { readAudit } from '../lib/audit.ts'
import { createDatabase, type Database } from '../lib/db.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import { solveTimeoutMs } from '../lib/solver-client.ts'
import { recoverInterruptedRuns } from '../services/allocation.ts'
import { startFakeSolver, type FakeSolver } from './helpers/fake-solver.ts'
import { DB, get, send, type Harness } from './helpers/harness.ts'
import { SARA, TIM } from './helpers/personas.ts'
import { school, type Ready, type View } from './helpers/school.ts'

interface Closed extends Ready {
  solver: FakeSolver
  owner: Database
}

/** The school with its window run and closed: Sara ranked (Tanz, Klettern; Schwimmen), Tim never saved; a daily minimum of 200 minutes for grade 9. */
async function closedSchool(t: Parameters<typeof school>[0]): Promise<Closed> {
  const solver = await startFakeSolver()
  t.after(() => solver.close())
  const s = await school(t, { SOLVER_URL: solver.baseUrl })
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  const id = s.campaign.id
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: s.campaign.name, schoolYear: s.campaign.schoolYear, projectDays: s.campaign.projectDays, dailyMinimum: { 9: 200 } })).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })).status, 200)
  const view = await get<View>(s, s.sara, `/api/campaigns/${id}/my-choice`)
  const [monday, swim] = view.body.groups.map((g) => g.key) as [string, string]
  assert.equal((await send(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { [monday]: [s.items.tanz, s.items.klettern], [swim]: [s.items.schwimmen] } })).status, 200)
  const closed = await send<Campaign>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'closed' })
  assert.equal(closed.status, 200, JSON.stringify(closed.body))
  return { ...s, campaign: closed.body, solver, owner }
}

/** Polls the run until the job is through; the stand-in answers at once, so this is a few rounds at most. */
async function finished(s: Harness & { anna: Ready['anna'] }, campaignId: string, runId: string): Promise<RunReviewResponse> {
  for (let i = 0; i < 200; i++) {
    const review = await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${campaignId}/runs/${runId}`)
    assert.equal(review.status, 200, JSON.stringify(review.body))
    if (review.body.run.status !== 'running') return review.body
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('the run did not finish')
}

const startRun = (s: Closed, body: object = {}) => send<{ run: AllocationRun } & { error?: string, message?: string }>(s, s.anna, 'POST', `/api/admin/campaigns/${s.campaign.id}/runs`, body)

test('the bound of a solve grows with what the request permits the solver', () => {
  const request = { levels: ['a', 'b'], limits: { deterministicTimePerLevel: 5 } } as never
  assert.equal(solveTimeoutMs(request, 15 * 60_000), 15 * 60_000, 'the floor for a small request')
  const large = { levels: new Array<string>(13).fill('l'), limits: { deterministicTimePerLevel: 60 } } as never
  assert.equal(solveTimeoutMs(large, 15 * 60_000), 13 * 60 * 30_000 + 60_000)
})

test('a run on a closed campaign: compiled, solved, validated, stored and reviewed; the campaign in review; both audited', DB, async (t) => {
  const s = await closedSchool(t)
  const id = s.campaign.id

  const status = await get<{ configured: boolean, reachable: boolean, ortools: string | null }>(s, s.anna, '/api/admin/solver')
  assert.deepEqual(status.body, { configured: true, reachable: true, ortools: '0.0.0-fake', contract: 'allocation/v2' })

  const started = await startRun(s, { seed: 42 })
  assert.equal(started.status, 202, JSON.stringify(started.body))
  assert.equal(started.body.run.seq, 1)
  assert.equal(started.body.run.status, 'running')
  assert.equal(started.body.run.seed, 42)
  assert.equal(started.body.run.limits.deterministicTimePerLevel, 5)

  const review = await finished(s, id, started.body.run.id)
  assert.equal(review.run.status, 'succeeded', JSON.stringify(review.run))
  assert.equal(review.run.failure, null)
  assert.deepEqual(review.run.versions, { solver: 'fake', ortools: '0.0.0-fake' })
  assert.deepEqual(review.run.passes.map((p) => [p.pass, p.status, p.levels.length]), [[1, 'OPTIMAL', 6], [2, 'OPTIMAL', 6]])
  assert.equal(review.stale, false)
  assert.equal(s.solver.requests.length, 2, 'two passes')
  assert.deepEqual(s.solver.requests[0]?.students.map((st) => st.s), [0], 'the first pass: Sara alone, who saved in the first window')
  assert.equal(s.solver.requests[1]?.students.length, 2, 'the second pass: Tim as well')
  assert.equal(s.solver.requests[1]?.fixed.length, 1, 'Sara\'s Monday held')

  const sara = review.students.find((st) => st.displayName === SARA.name)
  const tim = review.students.find((st) => st.displayName === TIM.name)
  const named = (itemId: string) => Object.entries(s.items).find(([, id]) => id === itemId)?.[0] ?? itemId
  assert.deepEqual(sara?.items.map((i) => `${named(i.itemId)}:${i.source}:${i.rank}`).sort(), ['tanz:wish:1', 'wien:fixed:null'])
  assert.equal(sara?.window, 'first')
  assert.deepEqual(sara?.days.map((d) => d.deficit), [0, 0], 'Tanz covers Monday, the trip Tuesday')
  assert.equal(tim?.window, null)
  assert.deepEqual(tim?.items.map((i) => i.source).sort(), ['fallback', 'fixed'], 'a non-submitter gets a fee-free Monday place and his trip')
  assert.deepEqual(review.summary?.students, { total: 2, choosing: 2, covered: 2, withDeficit: 0, withFallback: 1, missingRule: 0, late: 0, nonSubmitters: 1 })
  assert.equal(review.items.find((i) => i.itemId === s.items.wien)?.fixed, 2)
  assert.ok((review.items.find((i) => i.itemId === s.items.tanz)?.assigned ?? 0) >= 1)
  const timItems = tim?.items.map((i) => named(i.itemId)).sort() ?? []
  assert.ok(['klettern,wien', 'tanz,wien'].includes(timItems.join(',')), `a 210-minute fee-free Monday item and his trip, got ${timItems.join(',')}`)
  assert.deepEqual(review.projectDays, s.campaign.projectDays)
  assert.equal((await get<{ campaign: Campaign }>(s, s.anna, `/api/campaigns/${id}`)).body.campaign.state, 'review')

  const rows = await s.owner.query<{ source: string, n: string }>('select source, count(*)::text as n from assignment where run_id = $1 group by source order by source', [started.body.run.id])
  assert.deepEqual(rows.rows, [{ source: 'fallback', n: '1' }, { source: 'fixed', n: '2' }, { source: 'solver', n: '1' }])

  const list = await get<{ runs: AllocationRun[], solverConfigured: boolean }>(s, s.anna, `/api/admin/campaigns/${id}/runs`)
  assert.equal(list.body.solverConfigured, true)
  assert.deepEqual(list.body.runs.map((r) => [r.seq, r.status]), [[1, 'succeeded']])

  const xlsx = await s.app.inject({ method: 'GET', url: `/api/admin/campaigns/${id}/runs/${started.body.run.id}/export.xlsx`, headers: { cookie: s.anna.header() } })
  assert.equal(xlsx.statusCode, 200)
  assert.equal(xlsx.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.match(String(xlsx.headers['content-disposition']), /zuteilung-berechnung-1\.xlsx/)

  const actions = (await readAudit(s.db, id)).map((e) => `${e.action}:${typeof e.metadata.to === 'string' ? e.metadata.to : typeof e.metadata.status === 'string' ? e.metadata.status : ''}`)
  assert.deepEqual(actions.filter((a) => a.startsWith('run.') || a.includes('allocating') || a.includes('review')), ['campaign.transitioned:allocating', 'run.started:', 'run.finished:succeeded', 'campaign.transitioned:review'])

  // Another run on the campaign as it stands: a second record of the same snapshot, with its own result.
  const again = await startRun(s, { seed: 42, deterministicTimePerLevel: 1 })
  assert.equal(again.status, 202, JSON.stringify(again.body))
  assert.equal(again.body.run.seq, 2)
  const second = await finished(s, id, again.body.run.id)
  assert.equal(second.run.status, 'succeeded')
  assert.equal(second.run.snapshotSha256, review.run.snapshotSha256, 'the same campaign as it stands')
  assert.equal(second.students.length, review.students.length)

  // Who may do what: a teacher sees no runs, an auditor reads but does not start.
  assert.equal((await get(s, s.bernd, `/api/admin/campaigns/${id}/runs`)).status, 403)
  assert.equal((await send(s, s.sara, 'POST', `/api/admin/campaigns/${id}/runs`, {})).status, 403)
  assert.equal((await get(s, s.sara, `/api/admin/campaigns/${id}/runs/${started.body.run.id}`)).status, 403)
  assert.equal((await get(s, s.anna, `/api/admin/campaigns/${id}/runs/00000000-0000-4000-8000-000000000000`)).status, 404)
})

test('a run is refused where it cannot start: an open window, no daily minimum, no solver; a wrong answer, an infeasible model and a solver that is gone leave a failed run and the campaign in review', DB, async (t) => {
  const solver = await startFakeSolver()
  t.after(() => solver.close())
  const s = await school(t, { SOLVER_URL: solver.baseUrl })
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  const id = s.campaign.id
  const start = (body: object = {}) => send<{ run: AllocationRun, error?: string, message?: string }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs`, body)

  assert.equal((await start()).status, 409, 'published: the window has not even opened')
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })
  assert.equal((await start()).body.error, 'campaign_state')
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'closed' })
  const noMinimum = await start()
  assert.equal(noMinimum.status, 422)
  assert.equal(noMinimum.body.error, 'daily_minimum_missing')
  assert.equal(noMinimum.body.message, '9')
  assert.equal((await get<{ campaign: Campaign }>(s, s.anna, `/api/campaigns/${id}`)).body.campaign.state, 'closed', 'nothing moved')
  // The minimum the organizer forgot is set after the close, which the window's other settings are not.
  const settings = { name: s.campaign.name, schoolYear: s.campaign.schoolYear, projectDays: s.campaign.projectDays }
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, wishesPerGroup: 2 })).status, 409, 'the window is frozen')
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, dailyMinimum: { 9: 200 } })).status, 200, 'the allocation\'s input is not')

  // The solver answers one place too many: the validator refuses, the run fails, nothing is stored, the campaign is in review.
  solver.answer = (_request, computed) => ({ ...computed, assign: [...computed.assign, ...computed.assign.slice(0, 1)] })
  const tampered = await start()
  assert.equal(tampered.status, 202, JSON.stringify(tampered.body))
  const failed = await finished(s, id, tampered.body.run.id)
  assert.equal(failed.run.status, 'failed')
  assert.equal(failed.run.failure, 'validation_failed')
  assert.ok(failed.run.problems.some((p) => p.code === 'assigned_twice'), JSON.stringify(failed.run.problems))
  assert.equal(failed.summary, null)
  assert.equal((await owner.query('select count(*)::text as n from assignment where run_id = $1', [tampered.body.run.id])).rows[0]?.n, '0')
  assert.equal((await get<{ campaign: Campaign }>(s, s.anna, `/api/campaigns/${id}`)).body.campaign.state, 'review')

  solver.answer = (_request, computed) => ({ ...computed, status: 'INFEASIBLE', levels: [], assign: [], cancelled: [], detail: 'level students_with_deficit: INFEASIBLE' })
  const infeasible = await finished(s, id, (await start()).body.run.id)
  assert.equal(infeasible.run.failure, 'solver_infeasible')
  assert.match(infeasible.run.detail ?? '', /pass 1: INFEASIBLE/)

  solver.answer = () => ({ nonsense: true } as never)
  const offContract = await finished(s, id, (await start()).body.run.id)
  assert.equal(offContract.run.failure, 'solver_answer_invalid')

  // A level the solver reports wrongly is a mismatch the validator names.
  solver.answer = (_request, computed) => ({ ...computed, levels: computed.levels.map((l) => (l.name === 'total_cost' ? { ...l, value: l.value + 1 } : l)) })
  const wrongLevel = await finished(s, id, (await start()).body.run.id)
  assert.equal(wrongLevel.run.failure, 'validation_failed')
  assert.ok(wrongLevel.run.problems.some((p) => p.code === 'level_mismatch' && p.level === 'total_cost'))

  await solver.close()
  const gone = await finished(s, id, (await start()).body.run.id)
  assert.equal(gone.run.failure, 'solver_unreachable')
  const list = await get<{ runs: AllocationRun[] }>(s, s.anna, `/api/admin/campaigns/${id}/runs`)
  assert.deepEqual(list.body.runs.map((r) => [r.seq, r.status, r.failure]), [[5, 'failed', 'solver_unreachable'], [4, 'failed', 'validation_failed'], [3, 'failed', 'solver_answer_invalid'], [2, 'failed', 'solver_infeasible'], [1, 'failed', 'validation_failed']])
})

test('without SOLVER_URL no run starts; a run left running by a restart is marked interrupted and its campaign moved to review; a late answer changes nothing', DB, async (t) => {
  const s = await closedSchool(t)
  const id = s.campaign.id
  const off = await school(t)
  assert.equal((await send(off, off.anna, 'POST', `/api/admin/campaigns/${off.campaign.id}/transition`, { to: 'open' })).status, 200)
  assert.equal((await send(off, off.anna, 'POST', `/api/admin/campaigns/${off.campaign.id}/transition`, { to: 'closed' })).status, 200)
  const noSolver = await send<{ error: string }>(off, off.anna, 'POST', `/api/admin/campaigns/${off.campaign.id}/runs`, {})
  assert.equal(noSolver.status, 409)
  assert.equal(noSolver.body.error, 'solver_off')
  assert.deepEqual((await get<{ configured: boolean, reachable: boolean }>(off, off.anna, '/api/admin/solver')).body, { configured: false, reachable: false, ortools: null, contract: null })

  // The solver holds its answer; the process "restarts" meanwhile.
  let release: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  // Whatever the test finds, the stand-in is let go, so nothing waits on it at the end.
  t.after(() => release?.())
  s.solver.answer = async (_request, computed) => {
    await held
    return computed
  }
  const started = await startRun(s)
  assert.equal(started.status, 202)
  assert.equal((await startRun(s)).body.error, 'run_in_progress')
  assert.equal(await recoverInterruptedRuns(s.db), 1)
  const interrupted = await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${id}/runs/${started.body.run.id}`)
  assert.equal(interrupted.body.run.status, 'interrupted')
  assert.equal((await get<{ campaign: Campaign }>(s, s.anna, `/api/campaigns/${id}`)).body.campaign.state, 'review')
  assert.ok((await readAudit(s.db, id)).some((e) => e.action === 'run.interrupted' && e.actor.name === 'Systemstart'))
  release?.()
  // The job's late result finds a run that is no longer running and leaves it be.
  await new Promise((resolve) => setTimeout(resolve, 200))
  const after = await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${id}/runs/${started.body.run.id}`)
  assert.equal(after.body.run.status, 'interrupted')
  assert.equal((await s.owner.query('select count(*)::text as n from assignment where run_id = $1', [started.body.run.id])).rows[0]?.n, '0')

  // The next run goes through, and a catalogue change afterwards makes the review stale.
  s.solver.answer = null
  const next = await finished(s, id, (await startRun(s)).body.run.id)
  assert.equal(next.run.status, 'succeeded')
  assert.equal(next.stale, false)
  await s.owner.query('update catalog_item set places = places + 1 where id = $1', [s.items.darts])
  assert.equal((await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${id}/runs/${next.run.id}`)).body.stale, true, 'the snapshot is not the campaign as it stands')

  // Klettern, fixed for 5A after the close: the next run places the class into it before freezing its input (D-24).
  await s.owner.query('update catalog_item set fixed_classes = \'{5A}\', places = 0 where id = $1', [s.items.klettern])
  const placed = await finished(s, id, (await startRun(s)).body.run.id)
  assert.equal(placed.run.status, 'succeeded', JSON.stringify(placed.run))
  assert.equal(placed.items.find((i) => i.itemId === s.items.klettern)?.fixed, 2, 'Sara and Tim are placed into Klettern by class')
  assert.equal((await s.owner.query('select count(*)::text as n from pre_assignment where campaign_id = $1 and item_id = $2 and exempted_at is null', [id, s.items.klettern])).rows[0]?.n, '2')
  // Withdrawn afterwards, the item still labels what the run gave.
  await s.owner.query('update catalog_item set state = \'withdrawn\', withdrawn_at = now(), withdrawn_by = (select id from app_user limit 1), withdraw_reason = \'Test\' where id = $1', [s.items.klettern])
  const labelled = await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${id}/runs/${placed.run.id}`)
  assert.equal(labelled.body.items.find((i) => i.itemId === s.items.klettern)?.title, 'Klettern')
  assert.equal(labelled.body.stale, true, 'and the run is stale, as it must be')
})
