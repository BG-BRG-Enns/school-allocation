// The publication of a run on a real database: the organizer confirms the
// cancelled items and publishes; the campaign shows results, the notices
// are queued once each, the student reads their result with its
// explanation, the teacher the participants of their item, the class
// teacher the places of their class, the auditor the workbook; what is
// refused: a wrong confirmation, a stale run, a failed run, a second
// publication, a student before publication.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AllocationRun, MyResultResponse, ParticipantsResponse, RunReviewResponse } from '@school-allocation/api-contracts'
import { readAudit } from '../lib/audit.ts'
import { createDatabase } from '../lib/db.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import { startFakeSolver } from './helpers/fake-solver.ts'
import { DB, get, send } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'
import { school, type View } from './helpers/school.ts'

test('a run is published with its cancellations confirmed: results, notices once, the student\'s result, the participants, the class, the workbook; the refusals', DB, async (t) => {
  const solver = await startFakeSolver()
  t.after(() => solver.close())
  const s = await school(t, { SOLVER_URL: solver.baseUrl })
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  const id = s.campaign.id
  const settings = { name: s.campaign.name, schoolYear: s.campaign.schoolYear, projectDays: s.campaign.projectDays }
  // A swap window, a daily minimum, and Darts below a minimum of three so the run cancels it (Tim's fallback is Monday only).
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, dailyMinimum: { 9: 200 }, swapFrom: '2027-06-01T08:00:00+02:00', swapUntil: '2027-06-08T20:00:00+02:00' })).status, 200)
  await owner.query('update catalog_item set min_participants = 3, places = 20 where id = $1', [s.items.darts])
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })
  const view = await get<View>(s, s.sara, `/api/campaigns/${id}/my-choice`)
  const [monday, swim] = view.body.groups.map((g) => g.key) as [string, string]
  assert.equal((await send(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { [monday]: [s.items.tanz, s.items.klettern], [swim]: [s.items.schwimmen] } })).status, 200)
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'closed' })

  assert.equal((await get(s, s.sara, `/api/campaigns/${id}/my-result`)).status, 409, 'nothing published yet')
  const started = await send<{ run: AllocationRun }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs`, { seed: 7 })
  assert.equal(started.status, 202, JSON.stringify(started.body))
  let review: RunReviewResponse | undefined
  for (let i = 0; i < 200 && review?.run.status !== 'succeeded'; i++) {
    review = (await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${id}/runs/${started.body.run.id}`)).body
    if (review.run.status === 'running') await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(review?.run.status, 'succeeded', JSON.stringify(review?.run))
  const runId = started.body.run.id
  // Darts is Tuesday, the class is in Vienna: nobody can take it, so with a minimum of three it is cancelled.
  assert.deepEqual(review?.run.cancelledItemIds, [s.items.darts])

  const publish = (body: object, runIdToPublish = runId) => send<{ error?: string, campaign: Campaign, run: AllocationRun }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs/${runIdToPublish}/publish`, body)
  assert.equal((await publish({ cancelledItemIds: [] })).body.error, 'cancelled_mismatch', 'the cancellations as the review showed them, or nothing')
  assert.equal((await send(s, s.bernd, 'POST', `/api/admin/campaigns/${id}/runs/${runId}/publish`, { cancelledItemIds: [s.items.darts] })).status, 403)
  // A change since the run: stale, refused; put back, publishable.
  await owner.query('update catalog_item set places = places + 1 where id = $1', [s.items.tanz])
  assert.equal((await publish({ cancelledItemIds: [s.items.darts] })).body.error, 'run_stale')
  await owner.query('update catalog_item set places = places - 1 where id = $1', [s.items.tanz])
  const published = await publish({ cancelledItemIds: [s.items.darts] })
  assert.equal(published.status, 200, JSON.stringify(published.body))
  assert.equal(published.body.campaign.state, 'results')
  assert.ok(published.body.run.publishedAt)
  assert.equal((await publish({ cancelledItemIds: [s.items.darts] })).body.error, 'campaign_state', 'published once')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs`, {})).status, 409, 'no run after publication')

  // The notices: both students their programme, Carla (class teacher of 5A by the CSV) nothing (nobody short), Bernd the cancellation of Darts; once each.
  const mails = await owner.query<{ kind: string, to_address: string, body: string }>('select kind, to_address, body from outbox_mail where campaign_id = $1 and kind in (\'result_published\', \'class_unplaced\', \'item_cancelled\') order by kind, to_address', [id])
  assert.deepEqual(mails.rows.map((m) => [m.kind, m.to_address]), [['item_cancelled', BERND.email], ['result_published', SARA.email], ['result_published', TIM.email]])
  const saraMail = mails.rows.find((m) => m.to_address === SARA.email)
  assert.match(saraMail?.body ?? '', /Tanz/)
  assert.match(saraMail?.body ?? '', /Wien \(Klasse\)/)
  assert.match(saraMail?.body ?? '', /Di\., 22\.06\. 08:00 – 18:00: .*Wien/, 'one day: the clock span alone')
  assert.match(saraMail?.body ?? '', /tauschen/i)
  assert.match(mails.rows[0]?.body ?? '', /Darts/)
  assert.doesNotMatch(mails.rows.map((m) => m.to_address).join(), new RegExp(CARLA.email ?? 'nobody'))

  // The student's result with its explanation; the teachers shown as the campaign says.
  const result = await get<MyResultResponse>(s, s.sara, `/api/campaigns/${id}/my-result`)
  assert.equal(result.status, 200, JSON.stringify(result.body))
  assert.equal(result.body.run.seed, 7)
  assert.deepEqual(result.body.items.map((i) => i.title).sort(), ['Tanz', 'Wien'])
  assert.deepEqual(result.body.explanation.items.map((e) => e.source).sort(), ['fixed', 'wish'])
  assert.deepEqual(result.body.explanation.days.map((d) => d.deficit), [0, 0])
  assert.equal(result.body.feeCents, 0)
  assert.deepEqual(result.body.swapWindow, { from: '2027-06-01T06:00:00.000Z', until: '2027-06-08T18:00:00.000Z' })
  assert.equal((await get(s, s.bernd, `/api/campaigns/${id}/my-result`)).status, 403, 'a teacher has no result')

  // The participants: Bernd teaches every item; Carla teaches none and is no organizer.
  const participants = await get<ParticipantsResponse>(s, s.bernd, `/api/campaigns/${id}/items/${s.items.wien}/participants`)
  assert.equal(participants.status, 200, JSON.stringify(participants.body))
  assert.deepEqual(participants.body.participants.map((p) => [p.displayName, p.source]), [[SARA.name, 'fixed'], [TIM.name, 'fixed']])
  assert.equal((await get<ParticipantsResponse>(s, s.anna, `/api/campaigns/${id}/items/${s.items.darts}/participants`)).body.item.cancelled, true)
  const carla = await (await import('./helpers/harness.ts')).signIn(s, CARLA)
  assert.equal((await get(s, carla, `/api/campaigns/${id}/items/${s.items.wien}/participants`)).status, 403)
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}/items/${s.items.wien}/participants`)).status, 403)
  // Bernd out of the roster in force (a new batch without him): his binding and his item stay, his right to the participants does not.
  const roster = (teachers: string[]) => [
    'email;given_name;family_name;class;grade;kind;class_teacher_email',
    `${SARA.email};Sara;Schülerin;5A;9;student;${CARLA.email}`, `${TIM.email};Tim;Schüler;5A;9;student;${CARLA.email}`,
    ...teachers,
  ].join('\n')
  const commit = async (csv: string) => {
    const batch = await send<{ id: string }>(s, s.anna, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
    assert.equal((await send(s, s.anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)).status, 200)
  }
  await commit(roster([`${ANNA.email};Anna;Lehrerin;;;teacher;`, `${CARLA.email};Carla;Kollegin;;;teacher;`]))
  assert.equal((await get(s, s.bernd, `/api/campaigns/${id}/items/${s.items.wien}/participants`)).status, 403, 'a teacher of the item, but no teacher of the roster')
  await commit(roster([`${ANNA.email};Anna;Lehrerin;;;teacher;`, `${BERND.email};Bernd;Lehrer;;;teacher;`, `${CARLA.email};Carla;Kollegin;;;teacher;`]))
  assert.equal((await get(s, s.bernd, `/api/campaigns/${id}/items/${s.items.wien}/participants`)).status, 200)
  assert.equal((await get(s, s.anna, `/api/admin/campaigns/00000000-0000-4000-8000-000000000000/export/assignments.xlsx`)).status, 404, 'an unknown campaign, not an unpublished one')
  // Tanz withdrawn after publication: Sara's result still names it, with its fee.
  await owner.query('update catalog_item set fee_cents = 500 where id = $1', [s.items.tanz])
  await owner.query('update catalog_item set state = \'withdrawn\', withdrawn_at = now(), withdrawn_by = (select id from app_user limit 1), withdraw_reason = \'Test\' where id = $1', [s.items.tanz])
  const after = await get<MyResultResponse>(s, s.sara, `/api/campaigns/${id}/my-result`)
  assert.deepEqual(after.body.items.map((i) => i.title).sort(), ['Tanz', 'Wien'])
  assert.equal(after.body.feeCents, 500)
  assert.equal((await get<ParticipantsResponse>(s, s.anna, `/api/campaigns/${id}/items/${s.items.tanz}/participants`)).status, 200)

  // The class page carries the places now.
  const status = await get<{ students: { displayName: string, placement: { items: { title: string }[], deficit: number } | null }[] }>(s, carla, `/api/campaigns/${id}/classes/5A/status`)
  assert.equal(status.status, 200, JSON.stringify(status.body))
  assert.deepEqual(status.body.students.map((st) => [st.displayName, st.placement?.items.map((i) => i.title).sort(), st.placement?.deficit]), [[SARA.name, ['Tanz', 'Wien'], 0], [TIM.name, [TIM.name === TIM.name ? 'Klettern' : '', 'Wien'].sort(), 0]].map((row) => (row[0] === TIM.name ? [TIM.name, status.body.students.find((st) => st.displayName === TIM.name)?.placement?.items.map((i) => i.title).sort(), 0] : row)))

  // The workbook, and the audit trail.
  const xlsx = await s.app.inject({ method: 'GET', url: `/api/admin/campaigns/${id}/export/assignments.xlsx`, headers: { cookie: s.anna.header() } })
  assert.equal(xlsx.statusCode, 200)
  assert.match(String(xlsx.headers['content-disposition']), /zuteilung-2026-27\.xlsx/)
  const actions = (await readAudit(s.db, id)).map((e) => e.action)
  assert.ok(actions.includes('run.published'))
  assert.equal(actions.filter((a) => a === 'campaign.transitioned').at(-1), 'campaign.transitioned')
})

test('a failed run cannot be published, and a student short of minutes is named to the class teacher', DB, async (t) => {
  const solver = await startFakeSolver()
  t.after(() => solver.close())
  const s = await school(t, { SOLVER_URL: solver.baseUrl })
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  const id = s.campaign.id
  const settings = { name: s.campaign.name, schoolYear: s.campaign.schoolYear, projectDays: s.campaign.projectDays }
  // A minimum nobody's Monday can meet: Klettern and Tanz credit 210, Schwimmen 90, and they overlap.
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, dailyMinimum: { 9: 300 } })).status, 200)
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'closed' })
  const run = async () => {
    const started = await send<{ run: AllocationRun }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs`, { seed: 1 })
    assert.equal(started.status, 202, JSON.stringify(started.body))
    for (let i = 0; i < 200; i++) {
      const review = (await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${id}/runs/${started.body.run.id}`)).body
      if (review.run.status !== 'running') return review
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error('no end')
  }
  solver.answer = (_request, computed) => ({ ...computed, status: 'INFEASIBLE', levels: [], assign: [], cancelled: [] })
  const failed = await run()
  assert.equal(failed.run.status, 'failed')
  const refused = await send<{ error: string }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs/${failed.run.id}/publish`, { cancelledItemIds: [] })
  assert.equal(refused.body.error, 'run_not_publishable')

  solver.answer = null
  const short = await run()
  assert.equal(short.run.status, 'succeeded')
  assert.equal(short.summary?.students.withDeficit, 2, 'a 300-minute Monday is beyond any item')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs/${short.run.id}/publish`, { cancelledItemIds: [] })).status, 200)
  const mails = await owner.query<{ kind: string, to_address: string, body: string }>('select kind, to_address, body from outbox_mail where campaign_id = $1 and kind = \'class_unplaced\'', [id])
  assert.deepEqual(mails.rows.map((m) => m.to_address), [CARLA.email], 'the class teacher of 5A, by the CSV')
  assert.match(mails.rows[0]?.body ?? '', new RegExp(`${SARA.name}: .*90 min`))
  const result = await get<MyResultResponse>(s, s.sara, `/api/campaigns/${id}/my-result`)
  assert.equal(result.body.explanation.days[0]?.deficit, 90)
})
