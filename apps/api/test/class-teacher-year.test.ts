// A class teacher's right is the school year's (docs/identity-and-roles.md
// §5; PW12): class teachers are base data of a year, a class name recurs
// every year, and a campaign asks for the class teachers of its own year.
// The teacher of next year's 5A has no right to the 5A of the campaign
// before, in results or archived; the class teacher of that year keeps it,
// as long as they are a teacher of the roster in force.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AllocationRun, ClassAttendanceResponse, RunReviewResponse } from '@school-allocation/api-contracts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import { startFakeSolver } from './helpers/fake-solver.ts'
import { DB, get, send, signIn } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'
import { school, type View } from './helpers/school.ts'

type Jar = Awaited<ReturnType<typeof signIn>>

test('a class teacher\'s right is the school year\'s: next year\'s teacher of a class of the same name has none to the earlier cohort', DB, async (t) => {
  const solver = await startFakeSolver()
  t.after(() => solver.close())
  const s = await school(t, { SOLVER_URL: solver.baseUrl })
  const id = s.campaign.id
  const settings = { name: s.campaign.name, schoolYear: s.campaign.schoolYear, projectDays: s.campaign.projectDays }
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, dailyMinimum: { 9: 200 } })).status, 200)
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })
  const view = await get<View>(s, s.sara, `/api/campaigns/${id}/my-choice`)
  const [monday] = view.body.groups.map((g) => g.key) as [string]
  assert.equal((await send(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { [monday]: [s.items.tanz] } })).status, 200)
  assert.equal((await send(s, s.anna, 'PUT', `/api/admin/campaigns/${id}/choices/${s.timPerson}`, { ranking: { [monday]: [s.items.klettern] }, reason: 'Test' })).status, 200)
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'closed' })
  const started = await send<{ run: AllocationRun }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs`, { seed: 7 })
  let review: RunReviewResponse | undefined
  for (let i = 0; i < 200 && review?.run.status !== 'succeeded'; i++) {
    review = (await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${id}/runs/${started.body.run.id}`)).body
    if (review.run.status === 'running') await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(review?.run.status, 'succeeded')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs/${started.body.run.id}/publish`, { cancelledItemIds: review?.run.cancelledItemIds ?? [] })).status, 200)
  const carla = await signIn(s, CARLA)
  const berndPerson = (await get<{ teachers: { personId: string, displayName: string }[] }>(s, s.anna, '/api/admin/classes/teachers?q=Bernd')).body.teachers.find((te) => te.displayName === BERND.name)?.personId ?? ''
  assert.ok(berndPerson)

  // Every class endpoint of campaign A, and what a class teacher of 5A gets from each.
  const may = (jar: Jar, campaignId = id) => get<{ may: { classTeacherOf: string[] } }>(s, jar, `/api/campaigns/${campaignId}`)
  const status = (jar: Jar, campaignId = id) => get<{ error?: string }>(s, jar, `/api/campaigns/${campaignId}/classes/5A/status`)
  const attendance = (jar: Jar) => get<ClassAttendanceResponse & { error?: string }>(s, jar, `/api/campaigns/${id}/classes/5A/attendance`)
  // Raw: a workbook is no JSON.
  const workbook = async (jar: Jar) => {
    const response = await s.app.inject({ method: 'GET', url: `/api/campaigns/${id}/classes/5A/attendance.xlsx`, headers: { cookie: jar.header() } })
    return { status: response.statusCode, body: response.statusCode === 200 ? '' : response.body }
  }
  const place = (jar: Jar) => send<{ error?: string }>(s, jar, 'POST', `/api/campaigns/${id}/classes/5A/place`, { personId: s.saraPerson, itemId: s.items.schwimmen, reason: 'Test' })
  const record = (jar: Jar, sessionId: string, status: 'present' | 'excused') => send<{ recorded?: number, error?: string }>(s, jar, 'PUT', `/api/sessions/${sessionId}/attendance`, { entries: [{ personId: s.saraPerson, status }] })
  const reads = async (jar: Jar, expected: number, why: string) => {
    for (const [name, call] of [['status', status], ['attendance', attendance], ['attendance.xlsx', workbook]] as const) {
      const response = await call(jar)
      assert.equal(response.status, expected, `${why}: ${name} ${JSON.stringify(response.body)}`)
    }
  }
  const tanz = (await attendance(carla)).body.days[0]?.rows.find((r) => r.title === 'Tanz')?.sessionId ?? ''
  assert.ok(tanz)

  // 2026/27, the campaign's year: Carla is 5A's class teacher by the roster's column, Bernd nobody's.
  await reads(carla, 200, 'the class teacher of the year')
  assert.equal((await place(carla)).body.error, 'fully_placed', 'allowed, and Sara has every day covered')
  await reads(s.bernd, 403, 'a teacher of the roster, no class teacher')
  assert.equal((await record(s.bernd, tanz, 'present')).status, 403)
  assert.equal((await place(s.bernd)).status, 403)
  assert.deepEqual((await may(s.bernd)).body.may.classTeacherOf, [])

  // Assigned in the app for 2026/27: Bernd is a class teacher of 5A in that year, and the campaign opens to him; revoked, it closes.
  assert.equal((await send(s, s.anna, 'PUT', '/api/admin/classes/5A/teachers', { teachers: [berndPerson] })).status, 200)
  await reads(s.bernd, 200, 'assigned in the app for the year')
  assert.deepEqual((await may(s.bernd)).body.may.classTeacherOf, ['5A'])
  assert.equal((await record(s.bernd, tanz, 'present')).body.recorded, 1)
  assert.equal((await send(s, s.anna, 'PUT', '/api/admin/classes/5A/teachers', { teachers: [] })).status, 200)
  await reads(s.bernd, 403, 'revoked')

  // The next school year: a roster in which Bernd is 5A's class teacher by the column and Carla a teacher without a class.
  const roster = (teachers: string[]) => [
    'email;given_name;family_name;class;grade;kind;class_teacher_email',
    `${SARA.email};Sara;Schülerin;5A;10;student;${BERND.email}`, `${TIM.email};Tim;Schüler;5A;10;student;${BERND.email}`,
    ...teachers,
  ].join('\n')
  const commit = async (csv: string) => {
    const batch = await send<BatchDetail>(s, s.anna, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2027/28' })
    assert.ok(batch.body.id, JSON.stringify(batch.body))
    assert.equal((await send(s, s.anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)).status, 200)
  }
  await commit(roster([`${ANNA.email};Anna;Lehrerin;;;teacher;`, `${BERND.email};Bernd;Lehrer;;;teacher;`, `${CARLA.email};Carla;Kollegin;;;teacher;`]))

  // Campaign A is 2026/27's: Bernd's new right is 2027/28's, not the earlier cohort's; Carla's stands, she is a teacher of the roster in force still.
  await reads(s.bernd, 403, 'class teacher of the 5A of 2027/28, not of the 5A of 2026/27')
  assert.equal((await record(s.bernd, tanz, 'present')).status, 403)
  assert.equal((await place(s.bernd)).status, 403)
  assert.deepEqual((await may(s.bernd)).body.may.classTeacherOf, [])
  await reads(carla, 200, 'the class teacher of the 5A of 2026/27')
  assert.equal((await record(carla, tanz, 'excused')).body.recorded, 1)
  assert.deepEqual((await may(carla)).body.may.classTeacherOf, ['5A'])

  // A campaign of 2027/28: Bernd's class there, not Carla's.
  const next = await send<Campaign>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2028', schoolYear: '2027/28', projectDays: ['2028-06-19', '2028-06-20'] })
  assert.equal(next.status, 201, JSON.stringify(next.body))
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${next.body.id}/transition`, { to: 'catalogue' })).status, 200)
  assert.deepEqual((await may(s.bernd, next.body.id)).body.may.classTeacherOf, ['5A'])
  assert.deepEqual((await may(carla, next.body.id)).body.may.classTeacherOf, [])
  assert.equal((await status(s.bernd, next.body.id)).status, 200)
  assert.equal((await status(carla, next.body.id)).status, 403)

  // The archive keeps the earlier year's reads for its class teacher, and for nobody new.
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'archived' })).status, 200)
  await reads(carla, 200, 'archived, readable for the class teacher of the year')
  await reads(s.bernd, 403, 'archived, closed to next year\'s class teacher')

  // Out of the roster in force: Carla's binding and her class-teacher address of 2026/27 stay, her right does not.
  await commit(roster([`${ANNA.email};Anna;Lehrerin;;;teacher;`, `${BERND.email};Bernd;Lehrer;;;teacher;`]))
  await reads(carla, 403, 'no teacher of the roster in force')
  assert.deepEqual((await may(carla)).body.may.classTeacherOf, [])
})
