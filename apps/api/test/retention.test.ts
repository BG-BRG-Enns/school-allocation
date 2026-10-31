// The retention purge on a real database (docs/open-decisions.md D-15): a
// school year with everything a project week leaves behind (roster, items,
// window, run, publication, a swap, attendance, the archive) is removed
// whole once its retention has passed and every campaign of it is
// archived; a later year beside it stays, with the persons it still names;
// the people nobody names any more go with their accounts; the school's
// audit chain stays intact and records the purge; the runtime role cannot
// delete a row itself; a year still in retention is refused.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AllocationRun, RunReviewResponse } from '@school-allocation/api-contracts'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { verifyAuditChain } from '../lib/audit-chain.ts'
import { createDatabase } from '../lib/db.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { ChoiceView } from '../lib/models/choices.ts'
import type { Item } from '../lib/models/items.ts'
import { startFakeSolver } from './helpers/fake-solver.ts'
import { DB, get, harness, send, signIn } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'

const MAX = 'max.muster@schule.example.org'
const teachers = [`${ANNA.email};Anna;Lehrerin;;;teacher;`, `${BERND.email};Bernd;Lehrer;;;teacher;`, `${CARLA.email};Carla;Kollegin;;;teacher;`]
const csv = (rows: string[]) => ['email;given_name;family_name;class;grade;kind;class_teacher_email', ...rows].join('\n')

test('a school year past its retention is purged whole; the next year, its people and the school\'s chain stay; the runtime role cannot delete', DB, async (t) => {
  const solver = await startFakeSolver()
  t.after(() => solver.close())
  const h = await harness(t, { BOOTSTRAP_ADMINS: ANNA.email ?? '', SOLVER_URL: solver.baseUrl })
  const owner = createDatabase(h.ownerUrl, () => {})
  t.after(() => owner.close())
  const anna = await signIn(h, ANNA)
  const commit = async (year: string, rows: string[]) => {
    const batch = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv: csv(rows), schoolYear: year })
    const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
    assert.equal(committed.status, 200, JSON.stringify(committed.body))
    // The persons exist from the commit on; the committed batch's diff names them.
    return committed.body
  }
  // 2023/24: Sara, Tim and Max in 5A with Carla as class teacher; Sara and Tim sign in, Max never does.
  const old = await commit('2023/24', [`${SARA.email};Sara;Schülerin;5A;9;student;${CARLA.email}`, `${TIM.email};Tim;Schüler;5A;9;student;${CARLA.email}`, `${MAX};Max;Muster;5A;9;student;${CARLA.email}`, ...teachers])
  const person = (name: string) => old.diff.added.find((e) => e.displayName === name)?.personId ?? ''
  const bernd = await signIn(h, BERND)
  const carla = await signIn(h, CARLA)
  const sara = await signIn(h, SARA)
  await signIn(h, TIM)

  // The project week of 2023/24, through to the archive.
  const created = await send<Campaign>(h, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2024', schoolYear: '2023/24', projectDays: ['2024-06-24'] })
  const id = created.body.id
  await send(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'catalogue' })
  const session = { startsAt: '2024-06-24T08:30:00+02:00', endsAt: '2024-06-24T12:15:00+02:00', credits: [{ date: '2024-06-24', minutes: 210 }] }
  const propose = async (title: string) => {
    const item = await send<Item>(h, bernd, 'POST', `/api/campaigns/${id}/items`, { title, places: 10, teachers: [person(BERND.name)], sessions: [session] })
    assert.equal(item.status, 201, JSON.stringify(item.body))
    await send(h, bernd, 'POST', `/api/items/${item.body.id}/propose`)
    assert.equal((await send(h, anna, 'POST', `/api/admin/items/${item.body.id}/approve`)).status, 200)
    return item.body.id
  }
  const klettern = await propose('Klettern')
  const tanz = await propose('Tanz')
  const windowed = await send<{ error?: string }>(h, anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: 'Projektwoche 2024', schoolYear: '2023/24', projectDays: ['2024-06-24'], opensAt: new Date(Date.now() - 86_400_000).toISOString(), closesAt: new Date(Date.now() + 86_400_000).toISOString(), lateUntil: new Date(Date.now() + 2 * 86_400_000).toISOString(), dailyMinimum: { 9: 200 }, swapFrom: new Date(Date.now() - 3_600_000).toISOString(), swapUntil: new Date(Date.now() + 86_400_000).toISOString() })
  assert.equal(windowed.status, 200, JSON.stringify(windowed.body))
  for (const to of ['published', 'open'] as const) {
    const moved = await send<{ error?: string }>(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to })
    assert.equal(moved.status, 200, `${to}: ${JSON.stringify(moved.body)}`)
  }
  const view = await get<ChoiceView>(h, sara, `/api/campaigns/${id}/my-choice`)
  const [monday] = view.body.groups.map((g) => g.key) as [string]
  assert.equal((await send(h, sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { [monday]: [tanz] } })).status, 200)
  assert.equal((await send(h, anna, 'PUT', `/api/admin/campaigns/${id}/choices/${person(TIM.name)}`, { ranking: { [monday]: [klettern] }, reason: 'Test' })).status, 200)
  assert.equal((await send(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'closed' })).status, 200)
  const started = await send<{ run: AllocationRun }>(h, anna, 'POST', `/api/admin/campaigns/${id}/runs`, { seed: 1 })
  let review: RunReviewResponse | undefined
  for (let i = 0; i < 200 && review?.run.status !== 'succeeded'; i++) {
    review = (await get<RunReviewResponse>(h, anna, `/api/admin/campaigns/${id}/runs/${started.body.run.id}`)).body
    if (review.run.status === 'running') await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(review?.run.status, 'succeeded', JSON.stringify(review?.run))
  assert.equal((await send(h, anna, 'POST', `/api/admin/campaigns/${id}/runs/${started.body.run.id}/publish`, { cancelledItemIds: review?.run.cancelledItemIds ?? [] })).status, 200)
  assert.equal((await send(h, sara, 'POST', `/api/campaigns/${id}/swap`, { itemId: klettern })).status, 200, 'a swap, so a change and a superseded row exist')
  const sessionId = (await get<{ days: { rows: { sessionId: string, title: string }[] }[] }>(h, carla, `/api/campaigns/${id}/classes/5A/attendance`)).body.days[0]?.rows.find((r) => r.title === 'Klettern')?.sessionId ?? ''
  assert.equal((await send(h, carla, 'PUT', `/api/sessions/${sessionId}/attendance`, { entries: [{ personId: person(SARA.name), status: 'present' }] })).status, 200)
  assert.equal((await send(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'archived' })).status, 200)
  // Bernd leads 5A by the app's assignment for the roster's year too.
  assert.equal((await send(h, anna, 'PUT', '/api/admin/classes/5A/teachers', { teachers: [person(BERND.name)] })).status, 200)

  // Where the runtime role may delete at all (a draft, by the catalogue's guard), the switch is not its to set: a guard honours it inside
  // the definer function alone, so the runtime role meets the guard's own refusal.
  await assert.rejects(h.db.tx(async (client) => {
    await client.query('set local schulwahl.purge = \'on\'')
    await client.query('delete from catalog_item where id = $1', [klettern])
  }), /withdrawn, not removed/)

  // 2026/27: a campaign being set up, which goes by the roster in force until its close; that roster is 2023/24's batch for now.
  const next = await send<Campaign>(h, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: ['2027-06-21'] })
  assert.equal(next.status, 201)
  const inForce = await get<{ years: { schoolYear: string, reached: boolean, campaigns: { state: string }[], batches: number, classTeachers: number }[] }>(h, anna, '/api/admin/retention')
  assert.deepEqual(inForce.body.years.map((y) => [y.schoolYear, y.batches, y.classTeachers]), [['2026/27', 0, 0], ['2023/24', 1, 1]])
  // Purging 2023/24 now keeps its batch: it is the roster in force, and the 2026/27 campaign reads it. Then a 2026/27 roster without Tim and Max.
  const kept = await send<{ error?: string, removed: { relation: string, count: number }[] }>(h, anna, 'POST', '/api/admin/purge', { schoolYear: '2023/24', reason: 'Probe' })
  assert.equal(kept.status, 200, JSON.stringify(kept.body))
  assert.deepEqual(kept.body.removed.filter((r) => ['import_batch', 'roster_entry', 'class_teacher', 'person', 'campaign'].includes(r.relation)).map((r) => [r.relation, r.count]), [['campaign', 1], ['roster_entry', 0], ['import_batch', 0], ['class_teacher', 0], ['person', 0]], 'the campaign went; the roster in force and its class teachers stayed')
  await commit('2026/27', [`${SARA.email};Sara;Schülerin;8A;12;student;${CARLA.email}`, ...teachers])

  // The overview: both years, the old one past its retention, the new one not.
  const overview = await get<{ years: { schoolYear: string, reached: boolean, campaigns: { state: string }[], batches: number }[] }>(h, anna, '/api/admin/retention')
  assert.equal(overview.status, 200, JSON.stringify(overview.body))
  assert.deepEqual(overview.body.years.map((y) => [y.schoolYear, y.reached, y.campaigns.map((c) => c.state), y.batches]), [['2026/27', false, ['draft'], 1], ['2023/24', true, [], 1]], 'the old year\'s batch is left to purge')
  assert.equal((await get(h, bernd, '/api/admin/retention')).status, 403)

  // Refusals: still in retention; not an administrator; a year nobody has.
  const purge = (jar: typeof anna, schoolYear: string) => send<{ error?: string, removed: { relation: string, count: number }[] }>(h, jar, 'POST', '/api/admin/purge', { schoolYear, reason: 'Aufbewahrungsfrist abgelaufen' })
  assert.equal((await purge(anna, '2026/27')).body.error, 'retention_not_reached')
  await assert.rejects(owner.query('select * from purge_school_year(\'2026/27\')'), /retention of 2026\/27 has not ended/, 'the function refuses it too, whoever calls')
  assert.equal((await purge(bernd, '2023/24')).status, 403)
  assert.equal((await purge(anna, '2019/20')).status, 404)
  await assert.rejects(h.db.query('delete from campaign where id = $1', [id]), /permission denied/, 'the runtime role deletes nothing itself')
  await assert.rejects(h.db.query('delete from audit_event where scope_id = $1', [id]), /permission denied/)

  // The purge: everything of 2023/24, counted; Tim and Max with their accounts; Sara, her account and the teachers stay.
  const before = await owner.query<{ users: string, persons: string }>('select (select count(*) from app_user) as users, (select count(*) from person) as persons')
  const done = await purge(anna, '2023/24')
  assert.equal(done.status, 200, JSON.stringify(done.body))
  const removed = Object.fromEntries(done.body.removed.map((r) => [r.relation, r.count]))
  assert.equal(removed.campaign, 0, 'went with the first purge')
  assert.equal(removed.roster_entry, 6)
  assert.equal(removed.class_teacher, 1, 'with the year\'s last batch')
  assert.equal(removed.import_batch, 1)
  assert.equal(removed.person, 2, 'Tim and Max')
  assert.equal(removed.app_user, 1, 'Tim signed in once; Max never did')
  assert.equal(removed.identity_binding, 1)
  const after = await owner.query<{ users: string, persons: string, batches: string }>('select (select count(*) from app_user) as users, (select count(*) from person) as persons, (select count(*) from import_batch) as batches')
  assert.equal(Number(before.rows[0]?.users) - Number(after.rows[0]?.users), 1)
  assert.equal(Number(before.rows[0]?.persons) - Number(after.rows[0]?.persons), 2)
  assert.equal(Number(after.rows[0]?.batches), 1)
  assert.equal((await owner.query('select 1 from app_user where oid = $1', [TIM.oid])).rowCount, 0)
  assert.equal((await owner.query('select 1 from app_user where oid = $1', [SARA.oid])).rowCount, 1)
  assert.equal((await owner.query('select 1 from identity_binding where oid = $1 and import_batch_id is null', [SARA.oid])).rowCount, 1, 'her binding stays, its batch reference cleared')
  assert.equal((await get(h, anna, `/api/campaigns/${id}`)).status, 404)
  const first = Object.fromEntries(kept.body.removed.map((r) => [r.relation, r.count]))
  assert.equal(first.catalog_item, 2)
  assert.equal(first.item_session, 2)
  assert.equal(first.item_teacher, 2)
  assert.equal(first.allocation_run, 1)
  assert.equal(first.assignment_change, 1)
  assert.ok((first.assignment ?? 0) >= 3, 'the run\'s rows and the swap\'s')
  assert.equal(first.attendance, 1)
  assert.ok((first.outbox_mail ?? 0) >= 3, 'the invitations, the results, the swap')
  assert.ok((first.audit_event ?? 0) >= 5)
  assert.equal((await get(h, anna, `/api/campaigns/${next.body.id}`)).status, 200)
  assert.equal((await get(h, sara, '/api/auth/me')).status, 200, 'Sara is still who she was')
  const events = await readAudit(h.db, SCHOOL_SCOPE)
  assert.equal(events.filter((e) => e.action === 'retention.purged').length, 2, 'both purges, the roster commit between them')
  assert.equal(events.at(-1)?.action, 'retention.purged')
  assert.deepEqual(events.at(-1)?.metadata.schoolYear, '2023/24')
  assert.equal(verifyAuditChain(events).valid, true, 'the school\'s chain is untouched')
  assert.equal((await purge(anna, '2023/24')).status, 404, 'nothing left of it')
})
