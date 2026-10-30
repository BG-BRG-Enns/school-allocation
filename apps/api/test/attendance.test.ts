// Attendance on a real database (docs/domain-and-api.md §1 Attendance, §8;
// PW12): the class teacher records their class's students in a session,
// not another class's and not a student the session's item does not have;
// a correction replaces; the organizer records anyone; the workbooks; the
// archive ends the recording and the changes, and keeps the result readable.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AllocationRun, ClassAttendanceResponse, RunReviewResponse } from '@school-allocation/api-contracts'
import { readAudit } from '../lib/audit.ts'
import { startFakeSolver } from './helpers/fake-solver.ts'
import { DB, get, send, signIn } from './helpers/harness.ts'
import { CARLA, SARA, TIM } from './helpers/personas.ts'
import { school, type View } from './helpers/school.ts'

test('the class teacher records attendance for their class, session by session; the organizer archives, and nothing changes afterwards', DB, async (t) => {
  const solver = await startFakeSolver()
  t.after(() => solver.close())
  const s = await school(t, { SOLVER_URL: solver.baseUrl })
  const id = s.campaign.id
  const settings = { name: s.campaign.name, schoolYear: s.campaign.schoolYear, projectDays: s.campaign.projectDays }
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, dailyMinimum: { 9: 200 }, swapFrom: new Date(Date.now() - 3_600_000).toISOString(), swapUntil: new Date(Date.now() + 86_400_000).toISOString() })).status, 200)
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })
  const view = await get<View>(s, s.sara, `/api/campaigns/${id}/my-choice`)
  const [monday] = view.body.groups.map((g) => g.key) as [string]
  assert.equal((await send(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { [monday]: [s.items.tanz] } })).status, 200)
  assert.equal((await send(s, s.anna, 'PUT', `/api/admin/campaigns/${id}/choices/${s.timPerson}`, { ranking: { [monday]: [s.items.klettern] }, reason: 'Test' })).status, 200)
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'closed' })
  const carla = await signIn(s, CARLA)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'archived' })).status, 409, 'nothing to archive before publication')
  const started = await send<{ run: AllocationRun }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs`, { seed: 7 })
  let review: RunReviewResponse | undefined
  for (let i = 0; i < 200 && review?.run.status !== 'succeeded'; i++) {
    review = (await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${id}/runs/${started.body.run.id}`)).body
    if (review.run.status === 'running') await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(review?.run.status, 'succeeded')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs/${started.body.run.id}/publish`, { cancelledItemIds: review?.run.cancelledItemIds ?? [] })).status, 200)

  // The class's days: Monday Sara in Tanz and Tim in Klettern, Tuesday both in Vienna; nothing recorded yet; Carla may record.
  const attendance = (jar: typeof carla, className = '5A') => get<ClassAttendanceResponse & { error?: string }>(s, jar, `/api/campaigns/${id}/classes/${className}/attendance`)
  const before = await attendance(carla)
  assert.equal(before.status, 200, JSON.stringify(before.body))
  assert.equal(before.body.recordable, true)
  assert.deepEqual(before.body.days.map((d) => [d.date, d.rows.map((r) => [r.displayName, r.title, r.status])]), [
    ['2027-06-21', [[TIM.name, 'Klettern', null], [SARA.name, 'Tanz', null]]],
    ['2027-06-22', [[SARA.name, 'Wien', null], [TIM.name, 'Wien', null]]],
  ])
  assert.equal((await attendance(s.bernd)).status, 403, 'a teacher who is not the class teacher')
  assert.equal((await attendance(s.sara)).status, 403)
  assert.equal((await attendance(carla, '5B')).status, 403)
  const tanz = before.body.days[0]?.rows.find((r) => r.title === 'Tanz')?.sessionId ?? ''
  const klettern = before.body.days[0]?.rows.find((r) => r.title === 'Klettern')?.sessionId ?? ''
  const wien = before.body.days[1]?.rows[0]?.sessionId ?? ''

  // Recording: Carla for her students in the session's item; not a student the item does not have; Bernd not at all; a correction replaces.
  const record = (jar: typeof carla, sessionId: string, entries: object[]) => send<{ recorded: number, error?: string }>(s, jar, 'PUT', `/api/sessions/${sessionId}/attendance`, { entries })
  assert.equal((await record(carla, tanz, [{ personId: s.saraPerson, status: 'present' }])).body.recorded, 1)
  assert.equal((await record(carla, tanz, [{ personId: s.timPerson, status: 'present' }])).body.error, 'not_assigned', 'Tim is in Klettern')
  assert.equal((await record(s.bernd, klettern, [{ personId: s.timPerson, status: 'present' }])).status, 403)
  assert.equal((await record(carla, '00000000-0000-4000-8000-000000000000', [{ personId: s.timPerson, status: 'present' }])).status, 404)
  assert.equal((await record(s.anna, wien, [{ personId: s.saraPerson, status: 'absent', note: 'krank' }, { personId: s.timPerson, status: 'excused' }])).body.recorded, 2)
  assert.equal((await record(carla, tanz, [{ personId: s.saraPerson, status: 'excused' }])).body.recorded, 1, 'corrected')
  const after = await attendance(carla)
  assert.deepEqual(after.body.days.flatMap((d) => d.rows.map((r) => [r.displayName, r.title, r.status, r.note])), [
    [TIM.name, 'Klettern', null, ''], [SARA.name, 'Tanz', 'excused', ''], [SARA.name, 'Wien', 'absent', 'krank'], [TIM.name, 'Wien', 'excused', ''],
  ])
  assert.equal((await readAudit(s.db, id)).filter((e) => e.action === 'attendance.recorded').length, 3)
  const result = await get<{ explanation: { items: unknown[] } }>(s, s.sara, `/api/campaigns/${id}/my-result`)
  assert.equal(result.body.explanation.items.length, 2, 'attendance leaves the assignment alone (PW12)')

  // An item with attendance recorded still takes an edit of its words: its sessions stay, and with them the records.
  const items = await get<{ items: { id: string, title: string, feeCents: number, places: number, minParticipants: number, cancellableBelowMin: boolean, fixedClasses: string[], eligibleGrades: number[], eligibleClasses: string[], teachers: { personId: string }[], sessions: { startsAt: string, endsAt: string, credits: { date: string, minutes: number }[] }[] }[] }>(s, s.anna, `/api/campaigns/${id}/items`)
  const tanzItem = items.body.items.find((i) => i.id === s.items.tanz)
  assert.ok(tanzItem)
  const body = { title: tanzItem.title, feeCents: tanzItem.feeCents, places: tanzItem.places, minParticipants: tanzItem.minParticipants, cancellableBelowMin: tanzItem.cancellableBelowMin, fixedClasses: tanzItem.fixedClasses, eligibleGrades: tanzItem.eligibleGrades, eligibleClasses: tanzItem.eligibleClasses, teachers: tanzItem.teachers.map((t) => t.personId), sessions: tanzItem.sessions.map((x) => ({ startsAt: x.startsAt, endsAt: x.endsAt, credits: x.credits })) }
  const worded = await send<{ error?: string }>(s, s.anna, 'PATCH', `/api/items/${s.items.tanz}`, { ...body, description: 'Mit Musik.' })
  assert.equal(worded.status, 200, JSON.stringify(worded.body))
  assert.equal((await attendance(carla)).body.days[0]?.rows.find((r) => r.title === 'Tanz')?.status, 'excused', 'the session kept its id and its record')
  const relocated = await send<{ error?: string }>(s, s.anna, 'PATCH', `/api/items/${s.items.tanz}`, { ...body, sessions: body.sessions.map((x) => ({ ...x, location: 'Turnsaal 2' })) })
  assert.equal(relocated.status, 200, JSON.stringify(relocated.body))
  assert.equal((await attendance(carla)).body.days[0]?.rows.find((r) => r.title === 'Tanz')?.status, 'excused', 'a location written in place keeps the session too')

  // The workbooks: the class's for Carla, the campaign's for Anna; Sara neither.
  for (const [jar, url, name] of [[carla, `/api/campaigns/${id}/classes/5A/attendance.xlsx`, 'anwesenheit-5A-2026-27.xlsx'], [s.anna, `/api/admin/campaigns/${id}/export/attendance.xlsx`, 'anwesenheit-2026-27.xlsx']] as const) {
    const xlsx = await s.app.inject({ method: 'GET', url, headers: { cookie: jar.header() } })
    assert.equal(xlsx.statusCode, 200, url)
    assert.match(String(xlsx.headers['content-disposition']), new RegExp(name))
  }
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}/classes/5A/attendance.xlsx`)).status, 403)
  assert.equal((await get(s, carla, `/api/admin/campaigns/${id}/export/attendance.xlsx`)).status, 403)

  // The archive: the organizer's move, after which nothing changes and everything stays readable.
  assert.equal((await send(s, carla, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'archived' })).status, 403)
  const archived = await send<{ state: string }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'archived' })
  assert.equal(archived.status, 200, JSON.stringify(archived.body))
  assert.equal(archived.body.state, 'archived')
  assert.equal((await record(carla, klettern, [{ personId: s.timPerson, status: 'present' }])).body.error, 'campaign_state')
  assert.equal((await send<{ error: string }>(s, s.sara, 'POST', `/api/campaigns/${id}/swap`, { itemId: s.items.klettern })).body.error, 'campaign_state')
  assert.equal((await send<{ error: string }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/assignments`, { personId: s.timPerson, removeItemId: s.items.klettern, reason: 'Test' })).body.error, 'campaign_state')
  assert.equal((await attendance(carla)).body.recordable, false)
  assert.equal((await send<{ error: string }>(s, s.anna, 'PATCH', `/api/items/${s.items.tanz}`, { ...body, description: 'Nachher.' })).body.error, 'campaign_state', 'the catalogue changes no more')
  assert.equal((await send<{ error: string }>(s, s.anna, 'POST', `/api/admin/items/${s.items.tanz}/withdraw`, { reason: 'Test' })).body.error, 'campaign_state')
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}/my-result`)).status, 200, 'the result stays readable')
  assert.equal((await get<{ campaigns: { id: string }[] }>(s, s.sara, '/api/campaigns')).body.campaigns.some((c) => c.id === id), true, 'and listed')
})
