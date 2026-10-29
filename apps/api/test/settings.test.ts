// The school's settings and the classes on a real database: the period
// grid everyone reads and an administrator replaces; the class teachers,
// assigned in the app or named by the roster, and what a class teacher
// may see; the campaign's window settings with their order; the demand
// per day and grade; whether students see who teaches.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import type { Campaign } from '../lib/campaigns.ts'
import type { ClassWithTeachers } from '../lib/class-teachers.ts'
import { createDatabase } from '../lib/db.ts'
import type { Item } from '../lib/items.ts'
import type { BatchDetail } from '../lib/roster.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { DB, get, harness, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const DAYS = ['2027-06-21', '2027-06-22']

interface Ready extends Harness {
  anna: CookieJar
  bernd: CookieJar
  carla: CookieJar
  sara: CookieJar
  berndPerson: string
  carlaPerson: string
}

/** A school with a roster in force: Sara and Tim in 5A (Carla named as their class teacher by the CSV), Anna, Bernd and Carla teachers. */
async function school(t: Parameters<typeof harness>[0]): Promise<Ready> {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind;class_teacher_email',
    `${SARA.email};Sara;Schülerin;5A;9;student;${CARLA.email}`, `${TIM.email};Tim;Schüler;5A;9;student;${CARLA.email}`,
    `${ANNA.email};Anna;Lehrerin;;;teacher;`, `${BERND.email};Bernd;Lehrer;;;teacher;`, `${CARLA.email};Carla;Kollegin;;;teacher;`,
  ].join('\n')
  const batch = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  assert.equal(committed.status, 200, JSON.stringify(committed.body))
  const person = (name: string) => committed.body.diff.added.find((e) => e.displayName === name)?.personId ?? ''
  return { ...h, anna: await signIn(h, ANNA), bernd: await signIn(h, BERND), carla: await signIn(h, CARLA), sara: await signIn(h, SARA), berndPerson: person(BERND.name), carlaPerson: person(CARLA.name) }
}

test('the period grid starts with the Austrian default, is read by everyone signed in and replaced by an administrator within the rules, audited', DB, async (t) => {
  const s = await school(t)
  const initial = await get<{ periods: { period: number, starts: string, ends: string }[] }>(s, s.sara, '/api/settings/periods')
  assert.equal(initial.status, 200)
  assert.equal(initial.body.periods.length, 10)
  assert.deepEqual(initial.body.periods[1], { period: 2, starts: '08:30', ends: '09:20' })
  assert.deepEqual(initial.body.periods[3], { period: 4, starts: '10:30', ends: '11:20' })
  assert.equal((await get(s, undefined, '/api/settings/periods')).status, 401)

  const six = [1, 2, 3, 4, 5, 6].map((period) => ({ period, starts: `${String(7 + period).padStart(2, '0')}:00`, ends: `${String(7 + period).padStart(2, '0')}:50` }))
  assert.equal((await send(s, s.bernd, 'PUT', '/api/admin/settings/periods', { periods: six })).status, 403)
  const gap = await send<{ error: string, problems: string[] }>(s, s.anna, 'PUT', '/api/admin/settings/periods', { periods: [six[0], { ...six[2] }] })
  assert.equal(gap.status, 422)
  assert.deepEqual(gap.body, { error: 'period_grid_invalid', problems: ['period_numbering'] })
  const overlap = await send<{ problems: string[] }>(s, s.anna, 'PUT', '/api/admin/settings/periods', { periods: [six[0], { period: 2, starts: '08:40', ends: '09:30' }] })
  assert.deepEqual(overlap.body.problems, ['periods_overlap'])
  assert.equal((await send(s, s.anna, 'PUT', '/api/admin/settings/periods', { periods: [{ period: 1, starts: '8:00', ends: '08:50' }] })).status, 400, 'the shape is the schema\'s')
  assert.equal((await send(s, s.anna, 'PUT', '/api/admin/settings/periods', { periods: [] })).status, 422)

  const replaced = await send<{ periods: unknown[] }>(s, s.anna, 'PUT', '/api/admin/settings/periods', { periods: six })
  assert.equal(replaced.status, 200)
  assert.deepEqual(replaced.body.periods, six)
  assert.deepEqual((await get<{ periods: unknown[] }>(s, s.bernd, '/api/settings/periods')).body.periods, six)
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  const events = await readAudit(owner, SCHOOL_SCOPE)
  assert.deepEqual(events.at(-1)?.action, 'settings.periods-changed')
  assert.deepEqual(events.at(-1)?.metadata, { periods: 6, first: '08:00', last: '13:50' })
})

test('class teachers come from the roster\'s address column and from the app; a class teacher sees their class in a campaign, nobody else does', DB, async (t) => {
  const s = await school(t)
  const classes = await get<{ classes: ClassWithTeachers[] }>(s, s.anna, '/api/admin/classes')
  assert.equal(classes.status, 200)
  assert.deepEqual(classes.body.classes, [{ className: '5A', grade: 9, students: 2, teachers: [{ personId: s.carlaPerson, displayName: CARLA.name, source: 'roster' }] }])
  assert.equal((await get(s, s.bernd, '/api/admin/classes')).status, 403)

  assert.equal((await send<{ error: string }>(s, s.anna, 'PUT', '/api/admin/classes/6A/teachers', { teachers: [s.berndPerson] })).status, 404)
  const stranger = await send<{ error: string }>(s, s.anna, 'PUT', '/api/admin/classes/5A/teachers', { teachers: ['00000000-0000-4000-8000-000000000001'] })
  assert.equal(stranger.status, 422)
  assert.equal(stranger.body.error, 'teacher_unknown')
  const assigned = await send<{ classes: ClassWithTeachers[] }>(s, s.anna, 'PUT', '/api/admin/classes/5A/teachers', { teachers: [s.berndPerson.toUpperCase()] })
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body))
  assert.deepEqual(assigned.body.classes[0]?.teachers, [
    { personId: s.berndPerson, displayName: BERND.name, source: 'app' },
    { personId: s.carlaPerson, displayName: CARLA.name, source: 'roster' },
  ])

  const created = await send<Campaign>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS })
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${created.body.id}/transition`, { to: 'catalogue' })
  const id = created.body.id
  // Both class teachers see 5A: Bernd by assignment, Carla by the roster's column; Sara is a student of it, not its teacher.
  const asBernd = await get<{ may: { classTeacherOf: string[] } }>(s, s.bernd, `/api/campaigns/${id}`)
  assert.deepEqual(asBernd.body.may.classTeacherOf, ['5A'])
  const status = await get<{ className: string, students: { displayName: string }[], classActivities: unknown[] }>(s, s.carla, `/api/campaigns/${id}/classes/5A/status`)
  assert.equal(status.status, 200, JSON.stringify(status.body))
  assert.deepEqual(status.body.students.map((st) => st.displayName), [SARA.name, TIM.name])
  assert.deepEqual(status.body.classActivities, [])
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}/classes/5A/status`)).status, 404, 'a campaign taking proposals does not exist for a student')
  assert.equal((await get(s, s.bernd, `/api/campaigns/${id}/classes/6A/status`)).status, 403)
  assert.equal((await get(s, s.anna, `/api/campaigns/${id}/classes/6A/status`)).status, 404, 'an organizer may ask for any class; this one does not exist')

  // Bernd takes 5A to Vienna: the class page shows it.
  const trip = await send<Item>(s, s.bernd, 'POST', `/api/campaigns/${id}/items`, {
    title: 'Wien', places: 0, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.berndPerson],
    sessions: [{ startsAt: '2027-06-22T08:00:00+02:00', endsAt: '2027-06-22T18:00:00+02:00', credits: [{ date: '2027-06-22', minutes: 420 }] }],
  })
  assert.equal(trip.status, 201, JSON.stringify(trip.body))
  await send(s, s.bernd, 'POST', `/api/items/${trip.body.id}/propose`)
  const withTrip = await get<{ classActivities: { title: string, state: string }[] }>(s, s.bernd, `/api/campaigns/${id}/classes/5A/status`)
  assert.deepEqual(withTrip.body.classActivities.map((a) => [a.title, a.state]), [['Wien', 'proposed']])

  // Revoked: Bernd is a teacher of the roster again, nothing more.
  const revoked = await send<{ classes: ClassWithTeachers[] }>(s, s.anna, 'PUT', '/api/admin/classes/5A/teachers', { teachers: [] })
  assert.deepEqual(revoked.body.classes[0]?.teachers.map((te) => te.source), ['roster'])
  assert.equal((await get(s, s.bernd, `/api/campaigns/${id}/classes/5A/status`)).status, 403)
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  const events = (await readAudit(owner, SCHOOL_SCOPE)).filter((e) => e.action === 'class.teachers-changed')
  assert.deepEqual(events.map((e) => e.metadata), [{ schoolYear: '2026/27', className: '5A', teachers: 1 }, { schoolYear: '2026/27', className: '5A', teachers: 0 }])
})

test('the window\'s settings are kept in order and changeable until it opens; the demand counts proposals per day and grade; students see teachers only when the school says so', DB, async (t) => {
  const s = await school(t)
  const created = await send<Campaign>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS })
  const id = created.body.id
  assert.deepEqual([created.body.opensAt, created.body.closesAt, created.body.wishesPerGroup, created.body.dailyMinimum, created.body.showTeachers], [null, null, 3, {}, true])
  const setUp = { name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS }

  const reversed = await send<{ error: string }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, opensAt: '2027-03-08T00:00:00+01:00', closesAt: '2027-03-01T00:00:00+01:00' })
  assert.equal(reversed.status, 422)
  assert.equal(reversed.body.error, 'window_order')
  assert.equal((await send<{ error: string }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, closesAt: '2027-03-08T00:00:00+01:00', lateUntil: '2027-03-07T00:00:00+01:00' })).body.error, 'grace_order')
  assert.equal((await send<{ error: string }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, swapFrom: '2027-03-16T00:00:00+01:00', swapUntil: '2027-03-15T00:00:00+01:00' })).body.error, 'swap_order')
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, dailyMinimum: { 14: 100 } })).status, 400, 'grades 1 to 13')
  const window = { opensAt: '2027-03-01T00:00:00+01:00', closesAt: '2027-03-08T00:00:00+01:00', lateUntil: '2027-03-12T00:00:00+01:00', swapFrom: '2027-03-15T00:00:00+01:00', swapUntil: '2027-03-19T00:00:00+01:00', wishesPerGroup: 5, dailyMinimum: { 9: 240 }, showTeachers: false }
  const set = await send<Campaign>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, ...window })
  assert.equal(set.status, 200, JSON.stringify(set.body))
  assert.deepEqual([set.body.opensAt, set.body.lateUntil, set.body.swapUntil, set.body.wishesPerGroup, set.body.dailyMinimum, set.body.showTeachers],
    ['2027-02-28T23:00:00.000Z', '2027-03-11T23:00:00.000Z', '2027-03-18T23:00:00.000Z', 5, { 9: 240 }, false])
  // A setting left out stays; the grace week is dropped by sending null.
  const partial = await send<Campaign>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, lateUntil: null })
  assert.deepEqual([partial.body.opensAt, partial.body.lateUntil, partial.body.wishesPerGroup], ['2027-02-28T23:00:00.000Z', null, 5])

  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'catalogue' })
  // Bernd proposes a course for the 9th grade on Monday; Carla a trip that takes 5A on Tuesday with two extra places.
  const course = await send<Item>(s, s.bernd, 'POST', `/api/campaigns/${id}/items`, {
    title: 'Klettern', places: 12, eligibleGrades: [9], teachers: [s.berndPerson],
    sessions: [{ startsAt: '2027-06-21T09:00:00+02:00', endsAt: '2027-06-21T13:00:00+02:00', credits: [{ date: '2027-06-21', minutes: 210 }] }],
  })
  assert.equal(course.status, 201, JSON.stringify(course.body))
  const trip = await send<Item>(s, s.carla, 'POST', `/api/campaigns/${id}/items`, {
    title: 'Wien', places: 2, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.carlaPerson],
    sessions: [{ startsAt: '2027-06-22T08:00:00+02:00', endsAt: '2027-06-22T18:00:00+02:00', credits: [{ date: '2027-06-22', minutes: 420 }] }],
  })
  assert.equal(trip.status, 201)
  type Demand = { date: string, grades: { grade: number, students: number, fixed: number, needing: number, offered: number }[] }[]
  const drafts = await get<{ demand: Demand }>(s, s.bernd, `/api/campaigns/${id}/demand`)
  assert.equal(drafts.status, 200)
  assert.deepEqual(drafts.body.demand.map((d) => d.grades[0]?.offered), [0, 0], 'drafts count for nothing')
  await send(s, s.bernd, 'POST', `/api/items/${course.body.id}/propose`)
  await send(s, s.carla, 'POST', `/api/items/${trip.body.id}/propose`)
  const demand = await get<{ demand: Demand }>(s, s.anna, `/api/campaigns/${id}/demand`)
  assert.deepEqual(demand.body.demand, [
    { date: '2027-06-21', grades: [{ grade: 9, students: 2, fixed: 0, needing: 2, offered: 12 }] },
    { date: '2027-06-22', grades: [{ grade: 9, students: 2, fixed: 2, needing: 0, offered: 0 }] },
  ])
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}/demand`)).status, 404, 'a campaign taking proposals does not exist for a student')

  await send(s, s.anna, 'POST', `/api/admin/items/${course.body.id}/approve`)
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}/demand`)).status, 403)
  const forSara = await get<{ items: Item[] }>(s, s.sara, `/api/campaigns/${id}/catalogue`)
  assert.deepEqual(forSara.body.items.map((i) => i.teachers), [[]], 'the school chose not to name the teachers')
  assert.deepEqual((await get<{ items: Item[] }>(s, s.bernd, `/api/campaigns/${id}/catalogue`)).body.items[0]?.teachers.map((te) => te.displayName), [BERND.name])
  // Published: the window may still be set, the set-up may not.
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, showTeachers: true })).status, 200)
  assert.deepEqual((await get<{ items: Item[] }>(s, s.sara, `/api/campaigns/${id}/catalogue`)).body.items[0]?.teachers.map((te) => te.displayName), [BERND.name])
  assert.equal((await send<{ error: string }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, name: 'Anders' })).body.error, 'campaign_state')
})
