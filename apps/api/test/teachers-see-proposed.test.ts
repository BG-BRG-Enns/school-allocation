// Whether teachers see what others have submitted, end to end on a real
// database: a switch of the registration, off unless an organizer turns it
// on. With it a teacher of the roster gets the others' submitted
// activities in the list, and nothing else of theirs: no draft, no
// withdrawn activity, no right over the submitted one. A student never
// gets a submitted activity, and the switch is the window's: fixed from
// the opening.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item } from '../lib/models/items.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import { DB, get, harness, send, signIn } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const DAYS = ['2027-06-21', '2027-06-22']
const session = (day: string, from: string, to: string) => ({ startsAt: `${day}T${from}:00+02:00`, endsAt: `${day}T${to}:00+02:00` })

test('teachers see the activities others have submitted once the registration says so; drafts and withdrawn ones stay their own people\'s', DB, async (t) => {
  const s = await harness(t, ADMIN)
  const anna0 = await signIn(s, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind',
    `${SARA.email};Sara;Pfnäxthuber;5A;9;student`,
    `${ANNA.email};Anna;Zwexmhofer;;;teacher`, `${BERND.email};Bernd;Pfnöxlhofer;;;teacher`, `${CARLA.email};Carla;Knoxbrunner;;;teacher`,
  ].join('\n')
  const batch = await send<BatchDetail>(s, anna0, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(s, anna0, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  const berndPerson = committed.body.diff.added.find((e) => e.displayName === BERND.name)?.personId ?? ''
  const anna = await signIn(s, ANNA)
  const bernd = await signIn(s, BERND)
  const carla = await signIn(s, CARLA)
  const sara = await signIn(s, SARA)
  const created = await send<Campaign>(s, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const id = created.body.id
  assert.equal(created.body.teachersSeeProposed, false, 'off unless the organizer turns it on')
  assert.equal((await send(s, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'catalogue' })).status, 200)
  const url = `/api/campaigns/${id}/items`
  const setUp = { name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS }

  // Bernd's four: one approved, one submitted, one still a draft, one withdrawn after its submission.
  const draft = async (title: string) => {
    const item = await send<Item>(s, bernd, 'POST', url, { title, places: 12, teachers: [berndPerson], sessions: [session('2027-06-21', '08:30', '12:15')] })
    assert.equal(item.status, 201, JSON.stringify(item.body))
    return item.body.id
  }
  const submitted = async (title: string) => {
    const itemId = await draft(title)
    assert.equal((await send(s, bernd, 'POST', `/api/items/${itemId}/propose`)).status, 200)
    return itemId
  }
  const klettern = await submitted('Klettern')
  assert.equal((await send(s, anna, 'POST', `/api/admin/items/${klettern}/approve`)).status, 200)
  const schach = await submitted('Schach')
  await draft('Entwurf')
  const alt = await submitted('Abgesagt')
  assert.equal((await send(s, anna, 'POST', `/api/admin/items/${alt}/withdraw`, { reason: 'findet nicht statt' })).status, 200)

  const titles = async (jar: typeof carla) => {
    const list = await get<{ items: Item[] }>(s, jar, url)
    assert.equal(list.status, 200, JSON.stringify(list.body))
    return list.body.items.map((item) => `${item.title}:${item.state}`).sort((a, b) => a.localeCompare(b, 'de'))
  }

  // Off: of Bernd's, Carla sees the approved one alone; Bernd and the organizer see all four.
  assert.deepEqual(await titles(carla), ['Klettern:approved'])
  assert.deepEqual(await titles(bernd), ['Abgesagt:withdrawn', 'Entwurf:draft', 'Klettern:approved', 'Schach:proposed'])
  assert.deepEqual(await titles(anna), ['Abgesagt:withdrawn', 'Entwurf:draft', 'Klettern:approved', 'Schach:proposed'])

  // The switch is the organizer's.
  assert.equal((await send(s, carla, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, teachersSeeProposed: true })).status, 403)
  const on = await send<Campaign>(s, anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, teachersSeeProposed: true })
  assert.equal(on.status, 200, JSON.stringify(on.body))
  assert.equal(on.body.teachersSeeProposed, true)

  // On: the submitted one too, with its teachers; the draft and the withdrawn one stay Bernd's.
  assert.deepEqual(await titles(carla), ['Klettern:approved', 'Schach:proposed'])
  const seen = (await get<{ items: Item[] }>(s, carla, url)).body.items.find((item) => item.id === schach)
  assert.deepEqual(seen?.teachers.map((teacher) => teacher.displayName), [BERND.name], 'whom to talk to')
  assert.equal(seen?.reviewNote, '')
  // Seeing is all: it is not Carla's to change, to check or to place into.
  assert.equal((await send(s, carla, 'PATCH', `/api/items/${schach}`, { title: 'Schach II', places: 12, teachers: [berndPerson], sessions: [session('2027-06-21', '08:30', '12:15')] })).status, 403)
  assert.equal((await send(s, carla, 'POST', `/api/campaigns/${id}/items/check`, { itemId: schach })).status, 404)
  assert.equal((await get(s, carla, `/api/items/${schach}/placements`)).status, 403)
  assert.equal((await send(s, carla, 'POST', `/api/items/${schach}/unpropose`)).status, 403)

  // A setting that leaves the switch out keeps it.
  assert.equal((await send<Campaign>(s, anna, 'PATCH', `/api/admin/campaigns/${id}`, setUp)).body.teachersSeeProposed, true)

  // Published: a student gets the approved activity, never the submitted one.
  assert.equal((await send(s, anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, opensAt: '2027-03-01T08:00:00+01:00', closesAt: '2027-03-08T20:00:00+01:00' })).status, 200)
  assert.equal((await send(s, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })).status, 200)
  assert.deepEqual(await titles(sara), ['Klettern:approved'])
  assert.deepEqual(await titles(carla), ['Klettern:approved', 'Schach:proposed'], 'a teacher still does')
  // Still the window's to set, and off again takes it out of Carla's list.
  assert.equal((await send(s, anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, teachersSeeProposed: false })).status, 200)
  assert.deepEqual(await titles(carla), ['Klettern:approved'])

  // From the opening the switch is fixed, as the window's other settings are.
  assert.equal((await send(s, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })).status, 200)
  const late = await send<{ error: string }>(s, anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp, teachersSeeProposed: true })
  assert.deepEqual([late.status, late.body.error], [409, 'campaign_state'])
})
