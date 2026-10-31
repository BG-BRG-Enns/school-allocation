// The API against the real solver (apps/solver), where SOLVER_URL names
// one: a synthetic campaign of forty students over two days, run twice
// with one seed, gives identical rows and level values. The
// reproducibility the design promises (docs/domain-and-api.md §5, PW4), at
// the API's level. CI runs it against the solver image; locally, start the
// solver and set SOLVER_URL.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AllocationRun, RunReviewResponse } from '@school-allocation/api-contracts'
import { createDatabase } from '../lib/db.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item } from '../lib/models/items.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import { DB, get, harness, send, signIn } from './helpers/harness.ts'
import { ANNA, BERND } from './helpers/personas.ts'

const SOLVER = process.env.SOLVER_URL
const GATE = { skip: DB.skip || (SOLVER ? false : 'SOLVER_URL is not set') }
const DAYS = ['2027-06-21', '2027-06-22']

test('the real solver: the same seed gives the same allocation, validated and stored', GATE, async (t) => {
  const h = await harness(t, { BOOTSTRAP_ADMINS: ANNA.email ?? '', SOLVER_URL: SOLVER ?? '' })
  const anna = await signIn(h, ANNA)
  const owner = createDatabase(h.ownerUrl, () => {})
  t.after(() => owner.close())

  // Forty students in four classes, two teachers.
  const classes = [['5A', 9], ['5B', 9], ['6A', 10], ['6B', 10]] as const
  const rows = ['email;given_name;family_name;class;grade;kind;class_teacher_email']
  for (const [className, grade] of classes) {
    for (let i = 1; i <= 10; i++) rows.push(`s${className.toLowerCase()}${i}@schule.example.org;Kind;${className}-${i};${className};${grade};student;`)
  }
  rows.push(`${ANNA.email};Anna;Zwexmhofer;;;teacher;`, `${BERND.email};Bernd;Pfnöxlhofer;;;teacher;`)
  const batch = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv: rows.join('\n'), schoolYear: '2026/27' })
  assert.equal(batch.status, 201, JSON.stringify(batch.body))
  const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  assert.equal(committed.status, 200)
  const students = committed.body.diff.added.filter((e) => e.kind === 'student').map((e) => e.personId as string)
  const bernd = committed.body.diff.added.find((e) => e.displayName === BERND.name)?.personId as string
  assert.equal(students.length, 40)

  const created = await send<Campaign>(h, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Synthetische Woche', schoolYear: '2026/27', projectDays: DAYS })
  const id = created.body.id
  await send(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'catalogue' })
  const berndJar = await signIn(h, BERND)
  const session = (day: string, from: string, to: string, minutes: number) => ({ startsAt: `${day}T${from}:00+02:00`, endsAt: `${day}T${to}:00+02:00`, credits: [{ date: day, minutes }] })
  const items: string[] = []
  const propose = async (body: Record<string, unknown>) => {
    const item = await send<Item>(h, berndJar, 'POST', `/api/campaigns/${id}/items`, { teachers: [bernd], ...body })
    assert.equal(item.status, 201, JSON.stringify(item.body))
    await send(h, berndJar, 'POST', `/api/items/${item.body.id}/propose`)
    assert.equal((await send(h, anna, 'POST', `/api/admin/items/${item.body.id}/approve`)).status, 200)
    items.push(item.body.id)
    return item.body.id
  }
  // Monday: four morning items (210 minutes) of twelve places, a paid one among them; Tuesday: three full-day items of fifteen places and one cancellable below eight.
  const morning: string[] = []
  for (const [title, fee] of [['Klettern', 0], ['Tanz', 0], ['Chemie', 0], ['Segeln', 2500]] as const) morning.push(await propose({ title, places: 12, feeCents: fee, sessions: [session(DAYS[0] as string, '08:30', '12:15', 210)] }))
  const tuesday: string[] = []
  for (const title of ['Museum', 'Wandern', 'Schwimmen']) tuesday.push(await propose({ title, places: 15, sessions: [session(DAYS[1] as string, '08:30', '13:30', 300)] }))
  tuesday.push(await propose({ title: 'Theater', places: 15, minParticipants: 8, cancellableBelowMin: true, sessions: [session(DAYS[1] as string, '08:30', '13:30', 300)] }))
  const window = { name: 'Synthetische Woche', schoolYear: '2026/27', projectDays: DAYS, opensAt: '2027-03-01T08:00:00+01:00', closesAt: '2027-03-08T20:00:00+01:00', lateUntil: '2027-03-12T20:00:00+01:00', dailyMinimum: { 9: 200, 10: 200 } }
  assert.equal((await send(h, anna, 'PATCH', `/api/admin/campaigns/${id}`, window)).status, 200)
  await send(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })
  assert.equal((await send(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })).status, 200)

  // Rankings on behalf, with a skew towards the first items; every fourth student stays silent, every fifth is late.
  const view = await get<{ groups: { key: string, items: { id: string }[] }[] }>(h, anna, `/api/admin/campaigns/${id}/choices/${students[0] as string}`)
  assert.equal(view.status, 200, JSON.stringify(view.body))
  const [monday, tue] = view.body.groups.map((g) => g.key) as [string, string]
  const rotate = <T>(list: T[], by: number): T[] => [...list.slice(by % list.length), ...list.slice(0, by % list.length)]
  const late: string[] = []
  for (const [index, personId] of students.entries()) {
    if (index % 4 === 3) continue
    const ranking = { [monday]: rotate(morning, index % 3).slice(0, 3), [tue]: rotate(tuesday, index % 2).slice(0, 3) }
    if (index % 5 === 4) {
      late.push(personId)
      continue
    }
    const saved = await send(h, anna, 'PUT', `/api/admin/campaigns/${id}/choices/${personId}`, { ranking, reason: 'synthetisch' })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
  }
  // The late lists: saved after the close, before the clock moved on.
  await owner.query('update campaign set opens_at = now() - interval \'2 hours\', closes_at = now() - interval \'1 hour\', late_until = now() + interval \'1 hour\' where id = $1', [id])
  for (const [index, personId] of late.entries()) {
    const saved = await send(h, anna, 'PUT', `/api/admin/campaigns/${id}/choices/${personId}`, { ranking: { [monday]: rotate(morning, index).slice(0, 3), [tue]: rotate(tuesday, index).slice(0, 3) }, reason: 'synthetisch, spät' })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
  }
  assert.equal((await send(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'closed' })).status, 200)

  const run = async (): Promise<RunReviewResponse> => {
    const started = await send<{ run: AllocationRun }>(h, anna, 'POST', `/api/admin/campaigns/${id}/runs`, { seed: 20270621, deterministicTimePerLevel: 2 })
    assert.equal(started.status, 202, JSON.stringify(started.body))
    for (let i = 0; i < 2400; i++) {
      const review = await get<RunReviewResponse>(h, anna, `/api/admin/campaigns/${id}/runs/${started.body.run.id}`)
      if (review.body.run.status !== 'running') return review.body
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('the run did not finish in ten minutes')
  }
  const first = await run()
  assert.equal(first.run.status, 'succeeded', `${first.run.failure ?? ''}: ${first.run.detail ?? ''} ${JSON.stringify(first.run.problems.slice(0, 3))}`)
  assert.ok(first.run.versions?.ortools, 'the real solver names its OR-Tools')
  assert.equal(first.summary?.students.total, 40)
  assert.equal(first.summary?.students.nonSubmitters, 10)
  assert.equal(first.summary?.students.late, 6, 'every fifth, unless silent as every fourth')
  assert.equal(first.summary?.students.withDeficit, 0, 'enough places for everyone')
  assert.equal(first.run.passes.length, 2)
  assert.ok(first.students.every((s) => s.items.length === 2), 'one item per day each')
  const paid = first.students.filter((s) => s.items.some((e) => e.itemId === morning[3]))
  assert.ok(paid.every((s) => s.items.find((e) => e.itemId === morning[3])?.source === 'wish'), 'nobody is placed into the paid item without having ranked it')

  const second = await run()
  assert.equal(second.run.status, 'succeeded')
  assert.deepEqual(second.students.map((s) => [s.personId, s.items.map((e) => `${e.itemId}:${e.source}:${e.rank}`).sort()]), first.students.map((s) => [s.personId, s.items.map((e) => `${e.itemId}:${e.source}:${e.rank}`).sort()]), 'the same seed, the same rows')
  assert.deepEqual(second.run.passes, first.run.passes, 'the same level values')
  assert.deepEqual(second.run.cancelledItemIds, first.run.cancelledItemIds)
})
