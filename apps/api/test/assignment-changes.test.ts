// Changes after publication on a real database (docs/domain-and-api.md §3
// rule 7, §8): a student's move in the swap window with every refusal the
// rules know, first come first served into the last place; the class
// teacher's placement of a student short of minutes and who may not; the
// organizer's change by hand with the override and what it never
// overrides; the notices, the change log, the audit trail, the workbook,
// and the swap window set after the close.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AllocationRun, AssignmentChange, ClassStatus, MyResultResponse, ParticipantsResponse, RunReviewResponse } from '@school-allocation/api-contracts'
import { readAudit } from '../lib/audit.ts'
import { createDatabase } from '../lib/db.ts'
import { startFakeSolver } from './helpers/fake-solver.ts'
import { DB, get, send, signIn } from './helpers/harness.ts'
import { CARLA, SARA, TIM } from './helpers/personas.ts'
import { school, type Ready, type View } from './helpers/school.ts'

const hour = 3_600_000
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

/** The campaign through the window to a published run: Sara's ranking, Tim's on his behalf (or none), one run, published. */
async function published(s: Ready, ranking: (view: View) => { sara: Record<string, string[]>, tim: Record<string, string[]> | null }): Promise<string> {
  const id = s.campaign.id
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })
  const view = await get<View>(s, s.sara, `/api/campaigns/${id}/my-choice`)
  const lists = ranking(view.body)
  assert.equal((await send(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: lists.sara })).status, 200)
  if (lists.tim !== null) assert.equal((await send(s, s.anna, 'PUT', `/api/admin/campaigns/${id}/choices/${s.timPerson}`, { ranking: lists.tim, reason: 'Test' })).status, 200)
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'closed' })
  const started = await send<{ run: AllocationRun }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs`, { seed: 7 })
  assert.equal(started.status, 202, JSON.stringify(started.body))
  let review: RunReviewResponse | undefined
  for (let i = 0; i < 200 && review?.run.status !== 'succeeded'; i++) {
    review = (await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${id}/runs/${started.body.run.id}`)).body
    if (review.run.status === 'running') await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(review?.run.status, 'succeeded', JSON.stringify(review?.run))
  const done = await send<{ campaign: { state: string } }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs/${started.body.run.id}/publish`, { cancelledItemIds: review?.run.cancelledItemIds ?? [] })
  assert.equal(done.status, 200, JSON.stringify(done.body))
  return started.body.run.id
}

test('a student moves in the swap window: every refusal by its code, the last place to the first comer, the notice, the log; the window set after the close', DB, async (t) => {
  const solver = await startFakeSolver()
  t.after(() => solver.close())
  const s = await school(t, { SOLVER_URL: solver.baseUrl })
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  const id = s.campaign.id
  const settings = { name: s.campaign.name, schoolYear: s.campaign.schoolYear, projectDays: s.campaign.projectDays }
  // A minimum of 200 a day; the swap window set for tomorrow, so the run's result arrives with it closed.
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, dailyMinimum: { 9: 200 }, swapFrom: iso(24 * hour), swapUntil: iso(48 * hour) })).status, 200)
  // Klettern has one place; Tanz needs one participant.
  await owner.query('update catalog_item set places = 1 where id = $1', [s.items.klettern])
  await owner.query('update catalog_item set min_participants = 1 where id = $1', [s.items.tanz])
  await published(s, (view) => {
    const [monday, swim] = view.groups.map((g) => g.key) as [string, string]
    return { sara: { [monday]: [s.items.tanz, s.items.klettern], [swim]: [s.items.schwimmen] }, tim: { [monday]: [s.items.klettern] } }
  })
  const result = (jar: Ready['sara']) => get<MyResultResponse & { error?: string }>(s, jar, `/api/campaigns/${id}/my-result`)
  const swap = (jar: Ready['sara'], itemId: string) => send<MyResultResponse & { error?: string, message?: string }>(s, jar, 'POST', `/api/campaigns/${id}/swap`, { itemId })
  assert.deepEqual((await result(s.sara)).body.explanation.items.map((e) => e.source).sort(), ['fixed', 'wish'], 'Sara has Tanz')
  assert.equal((await result(s.sara)).body.offers, null, 'the window is not open: nothing on offer')

  // Before the window: refused. Then the organizer moves the window to now (it has not begun), and nothing else of the window changes any more.
  assert.equal((await swap(s.sara, s.items.klettern)).body.error, 'swap_closed')
  assert.equal((await send<{ error: string }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, opensAt: iso(-100 * hour) })).body.error, 'campaign_state', 'the window\'s dates are history')
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, swapFrom: iso(-hour), swapUntil: iso(24 * hour) })).status, 200, 'the swap window may still be set')
  assert.equal((await send<{ error: string }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, swapFrom: iso(-2 * hour), swapUntil: iso(24 * hour) })).body.error, 'campaign_state', 'but not once it has begun')

  // The refusals, each by its rule.
  assert.equal((await swap(s.sara, s.items.klettern)).body.error, 'below_minimum', 'Tanz needs one, and Sara is the one')
  assert.equal((await swap(s.tim, s.items.schwimmen)).body.error, 'coverage_lost', '90 minutes where Klettern credits 210')
  assert.equal((await swap(s.sara, s.items.darts)).body.error, 'not_offered', 'overlaps the class trip')
  assert.equal((await swap(s.sara, s.items.wien)).body.error, 'not_offered', 'the class activity she is in by class')
  assert.equal((await swap(s.sara, s.items.tanz)).body.error, 'already_placed')
  assert.equal((await swap(s.bernd, s.items.tanz)).status, 403, 'a teacher has no result to change')
  assert.equal((await swap(s.sara, '00000000-0000-4000-8000-000000000000')).body.error, 'not_offered')
  const before = await result(s.sara)
  assert.deepEqual(before.body.offers?.map((o) => [o.itemId, o.free, o.leaves.length, o.problems.map((p) => p.code)]).sort(), [
    [s.items.klettern, 0, 1, ['below_minimum', 'item_full']],
    [s.items.schwimmen, 20, 1, ['below_minimum', 'coverage_lost']],
  ].sort(), 'what the page shows: each item she may enter with why not; Darts overlaps the trip and is not on offer at all')

  // Tim moves into Tanz (Klettern left; Tanz has two now); then Sara into the place he left, Tanz keeping Tim; then Tim cannot come back.
  const tim = await swap(s.tim, s.items.tanz)
  assert.equal(tim.status, 200, JSON.stringify(tim.body))
  assert.deepEqual(tim.body.explanation.items.map((e) => [e.source, e.rank]).sort(), [['fixed', null], ['swap', null]])
  assert.deepEqual(tim.body.changes.map((c) => [c.kind, c.toItemId, c.leftItemIds]), [['swap', s.items.tanz, [s.items.klettern]]])
  const sara = await swap(s.sara, s.items.klettern)
  assert.equal(sara.status, 200, JSON.stringify(sara.body))
  assert.deepEqual(sara.body.items.map((i) => i.title).sort(), ['Klettern', 'Schwimmen', 'Tanz', 'Wien'], 'the places given, the item left, the item on offer')
  assert.equal((await swap(s.tim, s.items.klettern)).body.error, 'below_minimum', 'Tim is Tanz\'s one now; and Klettern is Sara\'s, which the offers say')
  assert.deepEqual((await result(s.tim)).body.offers?.find((o) => o.itemId === s.items.klettern)?.problems.map((p) => p.code), ['below_minimum', 'item_full'], 'first come first served')

  // The rows: Tanz and Klettern each superseded once, a swap row each; the history complete.
  const rows = await owner.query<{ item_id: string, source: string, superseded: boolean }>('select item_id, source, superseded_by is not null as superseded from assignment where run_id = (select id from allocation_run where campaign_id = $1 and published_at is not null) order by item_id, source', [id])
  assert.deepEqual(rows.rows.filter((r) => r.source === 'swap').map((r) => r.superseded), [false, false])
  assert.deepEqual(rows.rows.filter((r) => r.superseded).map((r) => r.source).sort(), ['solver', 'solver'])
  await assert.rejects(owner.query('delete from assignment where source = \'swap\''), /never removed/)
  await assert.rejects(owner.query('update assignment set superseded_by = null where superseded_by is not null'), /never changes/)
  await assert.rejects(owner.query('update assignment_change set reason = \'x\''), /never changed/)

  // Who sees what: the participants moved with them; the log names both moves; the notices went to both; the audit has both.
  const klettern = await get<ParticipantsResponse>(s, s.anna, `/api/campaigns/${id}/items/${s.items.klettern}/participants`)
  assert.deepEqual(klettern.body.participants.map((p) => [p.displayName, p.source]), [[SARA.name, 'swap']])
  const log = await get<{ changes: AssignmentChange[] }>(s, s.anna, `/api/admin/campaigns/${id}/assignments`)
  assert.deepEqual(log.body.changes.map((c) => [c.seq, c.kind, c.displayName, c.toItemId, c.leftItemIds, c.reason, c.forced]), [
    [1, 'swap', TIM.name, s.items.tanz, [s.items.klettern], null, false],
    [2, 'swap', SARA.name, s.items.klettern, [s.items.tanz], null, false],
  ])
  assert.equal((await get(s, s.sara, `/api/admin/campaigns/${id}/assignments`)).status, 403)
  const mails = await owner.query<{ to_address: string, body: string }>('select to_address, body from outbox_mail where campaign_id = $1 and kind = \'swap_confirmed\' order by created_at', [id])
  assert.deepEqual(mails.rows.map((m) => m.to_address), [TIM.email, SARA.email])
  assert.match(mails.rows[1]?.body ?? '', /Klettern/)
  assert.doesNotMatch(mails.rows[1]?.body ?? '', /Tanz/)
  assert.equal((await readAudit(s.db, id)).filter((e) => e.action === 'assignment.swapped').length, 2)
  const xlsx = await s.app.inject({ method: 'GET', url: `/api/admin/campaigns/${id}/export/assignments.xlsx`, headers: { cookie: s.anna.header() } })
  assert.equal(xlsx.statusCode, 200)
})

test('the class teacher places a student short of minutes into a gap; the organizer changes by hand, forcing a full item and a minimum, never a class activity', DB, async (t) => {
  const solver = await startFakeSolver()
  t.after(() => solver.close())
  const s = await school(t, { SOLVER_URL: solver.baseUrl })
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  const id = s.campaign.id
  const settings = { name: s.campaign.name, schoolYear: s.campaign.schoolYear, projectDays: s.campaign.projectDays }
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, dailyMinimum: { 9: 200 } })).status, 200)
  // Every Monday item has a fee, so a non-submitter gets no fallback; Tanz has one place and needs one participant.
  await owner.query('update catalog_item set fee_cents = 500 where id = $1', [s.items.klettern])
  await owner.query('update catalog_item set fee_cents = 300, places = 1, min_participants = 1 where id = $1', [s.items.tanz])
  await owner.query('update catalog_item set fee_cents = 100 where id = $1', [s.items.schwimmen])
  await published(s, (view) => {
    const [monday] = view.groups.map((g) => g.key) as [string]
    return { sara: { [monday]: [s.items.tanz] }, tim: null }
  })
  const carla = await signIn(s, CARLA)
  const status = (jar: Ready['sara'], className = '5A') => get<ClassStatus & { error?: string }>(s, jar, `/api/campaigns/${id}/classes/${className}/status`)
  const place = (jar: Ready['sara'], personId: string, itemId: string, className = '5A') => send<ClassStatus & { error?: string }>(s, jar, 'POST', `/api/campaigns/${id}/classes/${className}/place`, { personId, itemId, reason: 'Lücke am Montag' })
  const change = (body: object) => send<{ change: AssignmentChange, error?: string, message?: string }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/assignments`, body)

  // Tim has nothing on Monday; the class page offers what fits the gap, the full item named as full.
  const before = await status(carla)
  const tim = before.body.students.find((st) => st.displayName === TIM.name)
  assert.equal(tim?.placement?.deficit, 200)
  assert.deepEqual(tim?.placement?.offers.map((o) => [o.title, o.free, o.problems]).sort(), [['Klettern', 12, []], ['Schwimmen', 20, []], ['Tanz', 0, ['item_full']]])
  assert.deepEqual(before.body.students.find((st) => st.displayName === SARA.name)?.placement?.offers, [], 'nothing to fill')

  // Who may: the class teacher of the class and the organizer; not another teacher, not for another class, not a student without a gap.
  assert.equal((await place(s.bernd, s.timPerson, s.items.klettern)).status, 403)
  assert.equal((await place(carla, s.timPerson, s.items.klettern, '5B')).status, 403)
  assert.equal((await place(carla, s.saraPerson, s.items.klettern)).body.error, 'fully_placed')
  assert.equal((await place(carla, s.timPerson, s.items.tanz)).body.error, 'item_full')
  assert.equal((await place(carla, s.timPerson, s.items.darts)).body.error, 'not_offered', 'Tuesday is the class trip')
  const placed = await place(carla, s.timPerson, s.items.klettern)
  assert.equal(placed.status, 200, JSON.stringify(placed.body))
  const after = placed.body.students.find((st) => st.displayName === TIM.name)
  assert.deepEqual(after?.placement?.items.map((i) => [i.title, i.source]).sort(), [['Klettern', 'manual'], ['Wien', 'fixed']])
  assert.equal(after?.placement?.deficit, 0)
  assert.equal((await place(carla, s.timPerson, s.items.schwimmen)).body.error, 'fully_placed')
  const notice = await owner.query<{ to_address: string, body: string }>('select to_address, body from outbox_mail where campaign_id = $1 and kind = \'assignment_changed\' order by created_at', [id])
  assert.deepEqual(notice.rows.map((m) => m.to_address), [TIM.email])
  assert.match(notice.rows[0]?.body ?? '', /von deinem Klassenvorstand geändert: neu .*Klettern/)
  assert.doesNotMatch(notice.rows[0]?.body ?? '', /Lücke am Montag/, 'the reason stays with the organizer')

  // The organizer: a class activity is never left; a minimum and a full item only with force, recorded; a removal may cost coverage; nothing is no change.
  assert.equal((await change({ personId: s.timPerson, removeItemId: s.items.wien, reason: 'Test' })).body.error, 'leaves_fixed')
  assert.equal((await change({ personId: s.saraPerson, itemId: s.items.klettern, removeItemId: s.items.tanz, reason: 'Test' })).body.error, 'below_minimum', 'Sara alone in Tanz, which needs one')
  const forced = await change({ personId: s.saraPerson, itemId: s.items.klettern, removeItemId: s.items.tanz, reason: 'Sara klettert lieber', force: true })
  assert.equal(forced.status, 200, JSON.stringify(forced.body))
  assert.deepEqual([forced.body.change.kind, forced.body.change.forced, forced.body.change.leftItemIds, forced.body.change.toItemId], ['move', true, [s.items.tanz], s.items.klettern])
  assert.equal((await change({ personId: s.timPerson, itemId: s.items.tanz, removeItemId: s.items.klettern, reason: 'Tim tanzt' })).status, 200, 'Tanz\'s one place is free again')
  assert.equal((await change({ personId: s.saraPerson, itemId: s.items.tanz, removeItemId: s.items.klettern, reason: 'Test' })).body.error, 'item_full')
  const overridden = await change({ personId: s.saraPerson, itemId: s.items.tanz, removeItemId: s.items.klettern, reason: 'Ein Platz mehr geht', force: true })
  assert.equal(overridden.status, 200, JSON.stringify(overridden.body))
  assert.equal(overridden.body.change.forced, true)
  assert.equal((await change({ personId: s.timPerson, removeItemId: s.items.klettern, reason: 'Test' })).body.error, 'not_placed')
  assert.equal((await change({ personId: s.saraPerson, itemId: s.items.schwimmen, reason: 'Test', force: true })).body.error, 'overlap', 'into a gap means into a gap')
  // A fee changed after publication is not the student's: the notice names the run's.
  await owner.query('update catalog_item set fee_cents = 9900 where id = $1', [s.items.tanz])
  const removed = await change({ personId: s.timPerson, removeItemId: s.items.tanz, reason: 'Tim ist krank' })
  assert.equal(removed.status, 200, JSON.stringify(removed.body))
  assert.deepEqual([removed.body.change.kind, removed.body.change.forced], ['remove', false])
  assert.equal((await change({ personId: s.saraPerson, reason: 'Test' })).body.error, 'no_change')
  assert.equal((await change({ personId: s.saraPerson, itemId: s.items.tanz, removeItemId: s.items.tanz, reason: 'Test' })).body.error, 'no_change')
  assert.equal((await change({ personId: '00000000-0000-4000-8000-000000000000', itemId: s.items.tanz, reason: 'Test' })).status, 404)
  assert.equal((await send(s, s.bernd, 'POST', `/api/admin/campaigns/${id}/assignments`, { personId: s.saraPerson, itemId: s.items.tanz, reason: 'Test' })).status, 403)

  // The catalogue after publication: the words of an item may change, what the allocation computed with may not.
  const items = await get<{ items: { id: string, title: string, feeCents: number, places: number, minParticipants: number, cancellableBelowMin: boolean, fixedClasses: string[], eligibleGrades: number[], eligibleClasses: string[], teachers: { personId: string }[], sessions: { startsAt: string, endsAt: string, credits: { date: string, minutes: number }[] }[] }[] }>(s, s.anna, `/api/campaigns/${id}/items`)
  const klettern = items.body.items.find((i) => i.id === s.items.klettern)
  assert.ok(klettern)
  // The body as the form sends it: the optional texts left out when empty.
  const body = { title: klettern.title, feeCents: klettern.feeCents, places: klettern.places, minParticipants: klettern.minParticipants, cancellableBelowMin: klettern.cancellableBelowMin, fixedClasses: klettern.fixedClasses, eligibleGrades: klettern.eligibleGrades, eligibleClasses: klettern.eligibleClasses, teachers: klettern.teachers.map((t) => t.personId), sessions: klettern.sessions.map((x) => ({ startsAt: x.startsAt, endsAt: x.endsAt, credits: x.credits })) }
  const worded = await send<{ error?: string }>(s, s.anna, 'PATCH', `/api/items/${s.items.klettern}`, { ...body, description: 'Mit Helm.' })
  assert.equal(worded.status, 200, JSON.stringify(worded.body))
  assert.equal((await send<{ error: string }>(s, s.anna, 'PATCH', `/api/items/${s.items.klettern}`, { ...body, places: 30 })).body.error, 'campaign_state', 'the places the run was computed with')
  assert.equal((await send<{ error: string }>(s, s.anna, 'PATCH', `/api/items/${s.items.klettern}`, { ...body, sessions: [{ ...body.sessions[0], endsAt: '2027-06-21T13:00:00+02:00' }] })).body.error, 'campaign_state')

  // What is left: Sara in Tanz, Tim short of Monday again, as the class page and the student's result say; the log carries every change with its reason.
  const now = await status(s.anna)
  assert.deepEqual(now.body.students.map((st) => [st.displayName, st.placement?.deficit]), [[SARA.name, 0], [TIM.name, 200]])
  const result = await get<MyResultResponse>(s, s.sara, `/api/campaigns/${id}/my-result`)
  assert.deepEqual(result.body.changes.map((c) => c.kind), ['move', 'move'])
  assert.deepEqual(result.body.explanation.items.map((e) => e.source).sort(), ['fixed', 'manual'])
  assert.deepEqual(result.body.items.map((i) => i.title).sort(), ['Klettern', 'Tanz', 'Wien'], 'the items her changes name are there to be named')
  const log = await get<{ changes: AssignmentChange[] }>(s, s.anna, `/api/admin/campaigns/${id}/assignments`)
  assert.deepEqual(log.body.changes.map((c) => [c.seq, c.kind, c.displayName, c.forced, c.reason]), [
    [1, 'place', TIM.name, false, 'Lücke am Montag'],
    [2, 'move', SARA.name, true, 'Sara klettert lieber'],
    [3, 'move', TIM.name, false, 'Tim tanzt'],
    [4, 'move', SARA.name, true, 'Ein Platz mehr geht'],
    [5, 'remove', TIM.name, false, 'Tim ist krank'],
  ])
  const actions = (await readAudit(s.db, id)).map((e) => e.action)
  assert.equal(actions.filter((a) => a === 'assignment.placed').length, 1)
  assert.equal(actions.filter((a) => a === 'assignment.changed').length, 4)
  const changed = await owner.query<{ to_address: string, body: string }>('select to_address, body from outbox_mail where campaign_id = $1 and kind = \'assignment_changed\' order by created_at', [id])
  assert.equal(changed.rows.length, 5)
  assert.match(changed.rows[1]?.body ?? '', /von der Organisation geändert: statt .*Tanz jetzt .*Klettern/)
  assert.match(changed.rows[4]?.body ?? '', /nicht mehr .*Tanz/)
  assert.match(changed.rows[3]?.body ?? '', /Tanz – Beitrag 3,00 €/, 'the fee the run froze, not the 99 € of today')
  assert.doesNotMatch(changed.rows[4]?.body ?? '', /99,00/)
})
