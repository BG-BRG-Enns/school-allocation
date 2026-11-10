// The view as a teacher, end to end on a real database: a request with the
// header `x-view-as: teacher` is answered as for the same person without
// their roles. It only ever takes roles away; a view that does not exist
// is refused, and a request without the header is untouched.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item } from '../lib/models/items.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { asBrowser, DB, get, harness, me, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const DAYS = ['2027-06-21', '2027-06-22']

/** A request in the view named: the header beside the browser's own. */
async function viewing<T = unknown>(h: Harness, jar: CookieJar, view: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object): Promise<{ status: number, body: T }> {
  const response = await h.app.inject(asBrowser(jar, { method, url, headers: { 'x-view-as': view }, ...(payload === undefined ? {} : { payload }) }))
  return { status: response.statusCode, body: response.statusCode === 204 ? undefined as T : response.json<T>() }
}

test('with the view as a teacher a request is answered as for the same person without their roles; it never adds one', DB, async (t) => {
  const s = await harness(t, ADMIN)
  const anna0 = await signIn(s, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind',
    `${ANNA.email};Anna;Zwexmhofer;;;teacher`, `${BERND.email};Bernd;Pfnöxlhofer;;;teacher`,
  ].join('\n')
  const batch = await send<BatchDetail>(s, anna0, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(s, anna0, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  const person = (name: string) => committed.body.diff.added.find((e) => e.displayName === name)?.personId ?? ''
  const anna = await signIn(s, ANNA)
  const bernd = await signIn(s, BERND)
  const setUp = { name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS }
  const session = { startsAt: '2027-06-21T08:30:00+02:00', endsAt: '2027-06-21T12:15:00+02:00' }

  // A registration taking proposals with Bernd's draft in it, and one still in preparation.
  const created = await send<Campaign>(s, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', ...setUp })
  const id = created.body.id
  assert.equal((await send(s, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'catalogue' })).status, 200)
  const prepared = await send<Campaign>(s, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', ...setUp, name: 'Projektwoche 2028' })
  const draft = await send<Item>(s, bernd, 'POST', `/api/campaigns/${id}/items`, { title: 'Klettern', places: 12, teachers: [person(BERND.name)], sessions: [session] })
  assert.equal(draft.status, 201, JSON.stringify(draft.body))

  // Her own view: the roles, the stranger's draft, the registration in preparation, the settings.
  assert.deepEqual((await me(s, anna)).body.roles, ['school_admin'])
  assert.deepEqual((await get<{ items: Item[] }>(s, anna, `/api/campaigns/${id}/items`)).body.items.map((item) => item.title), ['Klettern'])
  assert.equal((await get(s, anna, `/api/campaigns/${prepared.body.id}`)).status, 200)

  // The view as a teacher: herself without the role, on every route.
  const asTeacher = await viewing<{ roles: string[], person: { id: string, kind: string } }>(s, anna, 'teacher', 'GET', '/api/auth/me')
  assert.equal(asTeacher.status, 200)
  assert.deepEqual(asTeacher.body.roles, [])
  assert.deepEqual([asTeacher.body.person.id, asTeacher.body.person.kind], [person(ANNA.name), 'teacher'], 'the same person of the roster')
  assert.deepEqual((await viewing<{ items: Item[] }>(s, anna, 'teacher', 'GET', `/api/campaigns/${id}/items`)).body.items, [], 'another teacher\'s draft is not in a teacher\'s list')
  const view = await viewing<{ may: { propose: boolean, organize: boolean }, counts: unknown }>(s, anna, 'teacher', 'GET', `/api/campaigns/${id}`)
  assert.deepEqual([view.body.may.propose, view.body.may.organize, view.body.counts], [true, false, null])
  assert.equal((await viewing(s, anna, 'teacher', 'GET', `/api/campaigns/${prepared.body.id}`)).status, 404, 'a registration in preparation does not exist for a teacher')
  assert.equal((await viewing(s, anna, 'teacher', 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, lockNewOffers: true })).status, 403)
  assert.equal((await viewing(s, anna, 'teacher', 'GET', '/api/admin/roles')).status, 403)
  // What she does there, she does as the teacher she is: a draft of her own.
  const own = await viewing<Item>(s, anna, 'teacher', 'POST', `/api/campaigns/${id}/items`, { title: 'Schach', places: 10, teachers: [person(ANNA.name)], sessions: [session] })
  assert.equal(own.status, 201, JSON.stringify(own.body))
  assert.deepEqual((await viewing<{ items: Item[] }>(s, anna, 'teacher', 'GET', `/api/campaigns/${id}/items`)).body.items.map((item) => item.title), ['Schach'])

  // The next request without the header has the roles again: nothing was stored.
  assert.deepEqual((await me(s, anna)).body.roles, ['school_admin'])
  assert.equal((await send(s, anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, lockNewOffers: true })).status, 200)

  // A view that does not exist is refused, not taken for the full one.
  assert.deepEqual(await viewing(s, anna, 'student', 'GET', '/api/auth/me'), { status: 400, body: { error: 'validation_failed' } })
  assert.deepEqual(await viewing(s, anna, 'Teacher', 'GET', `/api/campaigns/${id}/items`), { status: 400, body: { error: 'validation_failed' } })

  // It never adds: a teacher without roles is who they were, and nobody signed in stays nobody.
  assert.deepEqual((await viewing<{ roles: string[] }>(s, bernd, 'teacher', 'GET', '/api/auth/me')).body.roles, [])
  assert.equal((await viewing(s, bernd, 'teacher', 'PATCH', `/api/admin/campaigns/${id}`, setUp)).status, 403)
  const nobody = await s.app.inject({ method: 'GET', url: '/api/auth/me', headers: { 'x-view-as': 'teacher', 'sec-fetch-site': 'same-origin' } })
  assert.equal(nobody.statusCode, 204)
  const unguarded = await s.app.inject({ method: 'GET', url: `/api/campaigns/${id}/items`, headers: { 'x-view-as': 'teacher', 'sec-fetch-site': 'same-origin' } })
  assert.equal(unguarded.statusCode, 401)
})
