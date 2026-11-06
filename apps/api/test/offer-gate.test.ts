// The school's rules on new offers, end to end on a real database: a
// registration that locks new offers refuses a teacher's submission once
// every cell it would serve has reached its target, never an organizer's,
// and judges a resubmission by what it adds; a class is in one class
// activity at a time, at the submission and at an organizer's change; the
// first submission's time stays through a return; the check tells the form
// what a submission would meet.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item } from '../lib/models/items.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { DB, get, harness, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const DAYS = ['2027-06-21', '2027-06-22']
const MONDAY = '2027-06-21'
const TUESDAY = '2027-06-22'
const session = (day: string, from: string, to: string, minutes: number) => ({ startsAt: `${day}T${from}:00+02:00`, endsAt: `${day}T${to}:00+02:00`, credits: [{ date: day, minutes }] })

interface Ready extends Harness {
  anna: CookieJar
  bernd: CookieJar
  carla: CookieJar
  berndPerson: string
  carlaPerson: string
  campaign: Campaign
}

type GateCell = { date: string, period: number | null, grade: number, needing: number, target: number, offered: number, reached: boolean }
type Conflict = { className: string, itemId: string, title: string, lead: { displayName: string, shortName: string | null }, startsAt: string, endsAt: string }
type Check = { before: unknown[], after: unknown[], served: GateCell[], cells: GateCell[], refused: boolean, locked: boolean, conflicts: Conflict[] }

/** Sara and Tim in 5A (grade 9, so the target of a cell is 3 places), three teachers; a registration taking proposals, Monday framed 2–6. */
async function school(t: Parameters<typeof harness>[0]): Promise<Ready> {
  const h = await harness(t, ADMIN)
  const anna0 = await signIn(h, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind',
    `${SARA.email};Sara;Pfnäxthuber;5A;9;student`, `${TIM.email};Tim;Gnöxwieser;5A;9;student`,
    `${ANNA.email};Anna;Zwexmhofer;;;teacher`, `${BERND.email};Bernd;Pfnöxlhofer;;;teacher`, `${CARLA.email};Carla;Knoxbrunner;;;teacher`,
  ].join('\n')
  const batch = await send<BatchDetail>(h, anna0, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(h, anna0, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  const person = (name: string) => committed.body.diff.added.find((e) => e.displayName === name)?.personId ?? ''
  const anna = await signIn(h, ANNA)
  const created = await send<Campaign>(h, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS, frames: { [MONDAY]: { from: 2, to: 6 } } })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const opened = await send<Campaign>(h, anna, 'POST', `/api/admin/campaigns/${created.body.id}/transition`, { to: 'catalogue' })
  assert.equal(opened.status, 200)
  return { ...h, anna, bernd: await signIn(h, BERND), carla: await signIn(h, CARLA), berndPerson: person(BERND.name), carlaPerson: person(CARLA.name), campaign: opened.body }
}

const setUp = (c: Campaign) => ({ name: c.name, schoolYear: c.schoolYear, projectDays: c.projectDays })

test('with the lock on, a teacher\'s submission is refused once every cell it serves has reached its target; an organizer\'s never; a resubmission is judged by what it adds', DB, async (t) => {
  const s = await school(t)
  const id = s.campaign.id
  const url = `/api/campaigns/${id}/items`
  // The lock is a setting of the window: off unless the organizer turns it on.
  assert.equal(s.campaign.lockNewOffers, false)
  const locked = await send<Campaign>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp(s.campaign), lockNewOffers: true })
  assert.equal(locked.status, 200, JSON.stringify(locked.body))
  assert.equal(locked.body.lockNewOffers, true)
  assert.equal((await send(s, s.bernd, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp(s.campaign), lockNewOffers: false })).status, 403)

  // Nothing offered yet: Bernd's course over the 3rd to the 6th period is allowed and approved; grade 9 then has 12 places where 2 students need 3 in each of those periods.
  const first = await send<Item>(s, s.bernd, 'POST', url, { title: 'Klettern', places: 12, teachers: [s.berndPerson], sessions: [session(MONDAY, '09:25', '13:10', 210)] })
  assert.equal(first.status, 201, JSON.stringify(first.body))
  assert.equal(first.body.firstProposedAt, null, 'a draft was never submitted')
  const proposed = await send<Item>(s, s.bernd, 'POST', `/api/items/${first.body.id}/propose`)
  assert.equal(proposed.status, 200, JSON.stringify(proposed.body))
  assert.notEqual(proposed.body.firstProposedAt, null)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${first.body.id}/approve`)).status, 200)

  // A second course in the 3rd and 4th period: every cell it serves has reached its target, so Bernd's submission is refused with them.
  const second = await send<Item>(s, s.bernd, 'POST', url, { title: 'Yoga', places: 5, teachers: [s.berndPerson], sessions: [session(MONDAY, '09:25', '11:20', 100)] })
  assert.equal(second.status, 201)
  const refused = await send<{ error: string, cells: GateCell[] }>(s, s.bernd, 'POST', `/api/items/${second.body.id}/propose`)
  assert.equal(refused.status, 409, JSON.stringify(refused.body))
  assert.equal(refused.body.error, 'target_reached')
  assert.deepEqual(refused.body.cells, [
    { date: MONDAY, period: 3, grade: 9, needing: 2, target: 3, offered: 12, reached: true },
    { date: MONDAY, period: 4, grade: 9, needing: 2, target: 3, offered: 12, reached: true },
  ])
  assert.equal((await get<Item[]>(s, s.bernd, url)).status, 200)
  assert.equal(((await get<{ items: Item[] }>(s, s.bernd, url)).body.items.find((i) => i.id === second.body.id) as Item).state, 'draft', 'it stays a draft')

  // The check says the same before the submission, and shows the demand without and with it.
  const check = await send<Check>(s, s.bernd, 'POST', `/api/campaigns/${id}/items/check`, { itemId: second.body.id })
  assert.equal(check.status, 200, JSON.stringify(check.body))
  assert.deepEqual([check.body.locked, check.body.refused, check.body.cells.length, check.body.conflicts], [true, true, 2, []])
  const asSent = await send<Check>(s, s.bernd, 'POST', `/api/campaigns/${id}/items/check`, { item: { title: 'Yoga', places: 5, teachers: [s.berndPerson], sessions: [session(MONDAY, '09:25', '11:20', 100)] } })
  assert.deepEqual(asSent.body.cells, check.body.cells, 'the form\'s body or the stored item: the same cells')
  // Into the 2nd period, where nothing is offered yet: allowed, since one cell is short.
  const longer = await send<Check>(s, s.bernd, 'POST', `/api/campaigns/${id}/items/check`, { item: { title: 'Yoga', places: 5, teachers: [s.berndPerson], sessions: [session(MONDAY, '08:30', '11:20', 150)] } })
  assert.deepEqual([longer.body.refused, longer.body.cells.map((c) => [c.period, c.reached])], [false, [[2, false], [3, true], [4, true]]])
  assert.equal((await send(s, s.carla, 'POST', `/api/campaigns/${id}/items/check`, { itemId: second.body.id })).status, 404, 'another teacher\'s draft is not theirs to check')
  assert.equal((await send(s, s.anna, 'POST', `/api/campaigns/${id}/items/check`, { itemId: second.body.id })).status, 200, 'the organizer checks anyone\'s')
  assert.equal((await send(s, s.bernd, 'POST', `/api/campaigns/${id}/items/check`, {})).status, 400, 'an item or an id')
  // Moved into the 2nd period, it is submitted.
  assert.equal((await send(s, s.bernd, 'PATCH', `/api/items/${second.body.id}`, { title: 'Yoga', places: 5, teachers: [s.berndPerson], sessions: [session(MONDAY, '08:30', '11:20', 150)] })).status, 200)
  const yoga = await send<Item>(s, s.bernd, 'POST', `/api/items/${second.body.id}/propose`)
  assert.equal(yoga.status, 200, JSON.stringify(yoga.body))
  const firstTime = yoga.body.firstProposedAt
  assert.notEqual(firstTime, null)

  // Anna, an organizer, fills the 2nd period too (never gated); yoga, returned and resubmitted unchanged, is allowed although every cell of it has reached its target meanwhile, and the first submission's time stays.
  const third = await send<Item>(s, s.anna, 'POST', url, { title: 'Tanz', places: 10, teachers: [s.carlaPerson], sessions: [session(MONDAY, '08:30', '09:20', 50)] })
  assert.equal((await send(s, s.anna, 'POST', `/api/items/${third.body.id}/propose`)).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${second.body.id}/return`, { note: 'Bitte den Ort angeben.' })).status, 200)
  const unchanged = await send<Check>(s, s.bernd, 'POST', `/api/campaigns/${id}/items/check`, { itemId: second.body.id })
  assert.deepEqual([unchanged.body.cells.length, unchanged.body.served.length, unchanged.body.refused], [0, 3, false], 'nothing added: no cell to judge, the three it serves still named')
  // The form's shape with the stored id: judged as the resubmission it would be (more places: every cell), the stored activity left out of the demand.
  const grownCheck = await send<Check>(s, s.bernd, 'POST', `/api/campaigns/${id}/items/check`, { itemId: second.body.id, item: { title: 'Yoga', places: 8, teachers: [s.berndPerson], sessions: [session(MONDAY, '08:30', '11:20', 150)] } })
  assert.deepEqual([grownCheck.body.refused, grownCheck.body.cells.length], [true, 3])
  const again = await send<Item>(s, s.bernd, 'POST', `/api/items/${second.body.id}/propose`)
  assert.equal(again.status, 200, JSON.stringify(again.body))
  assert.equal(again.body.firstProposedAt, firstTime, 'the first submission counts')
  // Returned again and resubmitted with more places: every cell has reached its target, and the places grew, so it is refused.
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${second.body.id}/return`, { note: 'Mehr Plätze?' })).status, 200)
  assert.equal((await send(s, s.bernd, 'PATCH', `/api/items/${second.body.id}`, { title: 'Yoga', places: 8, teachers: [s.berndPerson], sessions: [session(MONDAY, '08:30', '11:20', 150)] })).status, 200)
  const grown = await send<{ error: string }>(s, s.bernd, 'POST', `/api/items/${second.body.id}/propose`)
  assert.deepEqual([grown.status, grown.body.error], [409, 'target_reached'])
  // Back to the places it had: a correction, allowed.
  assert.equal((await send(s, s.bernd, 'PATCH', `/api/items/${second.body.id}`, { title: 'Yoga am Montag', places: 5, teachers: [s.berndPerson], sessions: [session(MONDAY, '08:30', '11:20', 150)] })).status, 200)
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${second.body.id}/propose`)).status, 200)

  // An organizer is never gated: Anna's own activity on a reached cell goes through, and the check tells her so.
  const annas = await send<Item>(s, s.anna, 'POST', url, { title: 'Schach', places: 4, teachers: [s.carlaPerson], sessions: [session(MONDAY, '09:25', '10:15', 50)] })
  assert.equal(annas.status, 201)
  assert.deepEqual((await send<Check>(s, s.anna, 'POST', `/api/campaigns/${id}/items/check`, { itemId: annas.body.id })).body.refused, true)
  assert.equal((await send(s, s.anna, 'POST', `/api/items/${annas.body.id}/propose`)).status, 200)
  // Outside every frame (Tuesday has none, so the whole day is one cell short of its target): allowed.
  const tuesday = await send<Item>(s, s.bernd, 'POST', url, { title: 'Wandern', places: 4, teachers: [s.berndPerson], sessions: [session(TUESDAY, '08:00', '13:00', 250)] })
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${tuesday.body.id}/propose`)).status, 200)
  // The organizer's demand carries the shares per activity; a teacher's does not.
  const demand = await get<{ shares: { itemId: string, period: number | null, grade: number, places: number }[] }>(s, s.anna, `/api/campaigns/${id}/demand`)
  assert.ok(demand.body.shares.some((x) => x.itemId === first.body.id && x.period === 3 && x.grade === 9 && x.places === 12))
  assert.deepEqual((await get<{ shares: unknown[] }>(s, s.bernd, `/api/campaigns/${id}/demand`)).body.shares, [])
  // With the lock off everything goes through.
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp(s.campaign), lockNewOffers: false })).status, 200)
  const free = await send<Item>(s, s.bernd, 'POST', url, { title: 'Noch ein Kurs', places: 5, teachers: [s.berndPerson], sessions: [session(MONDAY, '09:25', '11:20', 100)] })
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${free.body.id}/propose`)).status, 200)
})

test('a class is in one class activity at a time: refused at the submission with the other activity named, and at an organizer\'s change; a class activity is never gated', DB, async (t) => {
  const s = await school(t)
  const id = s.campaign.id
  const url = `/api/campaigns/${id}/items`
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp(s.campaign), lockNewOffers: true })).status, 200)
  // Carla takes 5A to Vienna on Tuesday; with the lock on, a class activity is still allowed.
  const trip = await send<Item>(s, s.carla, 'POST', url, { title: 'Wien', places: 0, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.carlaPerson], sessions: [session(TUESDAY, '08:00', '18:00', 420)] })
  assert.equal(trip.status, 201, JSON.stringify(trip.body))
  assert.equal((await send(s, s.carla, 'POST', `/api/items/${trip.body.id}/propose`)).status, 200)
  // Bernd's hike with 5A on Tuesday morning: refused, with the trip, its lead and the time they share.
  const hike = await send<Item>(s, s.bernd, 'POST', url, { title: 'Wanderung', places: 0, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.berndPerson], sessions: [session(TUESDAY, '09:00', '12:00', 150)] })
  assert.equal(hike.status, 201)
  const check = await send<Check>(s, s.bernd, 'POST', `/api/campaigns/${id}/items/check`, { itemId: hike.body.id })
  assert.deepEqual(check.body.conflicts, [{ className: '5A', itemId: trip.body.id, title: 'Wien', lead: { displayName: CARLA.name, shortName: null }, startsAt: '2027-06-22T07:00:00.000Z', endsAt: '2027-06-22T10:00:00.000Z' }])
  assert.equal(check.body.refused, false, 'the gate leaves class activities alone')
  const refused = await send<{ error: string, conflicts: Conflict[] }>(s, s.bernd, 'POST', `/api/items/${hike.body.id}/propose`)
  assert.deepEqual([refused.status, refused.body.error, refused.body.conflicts.length], [409, 'class_conflict', 1])
  // In the evening, apart in time: allowed.
  assert.equal((await send(s, s.bernd, 'PATCH', `/api/items/${hike.body.id}`, { title: 'Nachtwanderung', places: 0, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.berndPerson], sessions: [session(TUESDAY, '18:00', '20:00', 100)] })).status, 200)
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${hike.body.id}/propose`)).status, 200)
  // The organizer's change of a submitted class activity back into the trip's time: refused as well; a change of its words is not.
  const moved = await send<{ error: string }>(s, s.anna, 'PATCH', `/api/items/${hike.body.id}`, { title: 'Nachtwanderung', places: 0, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.berndPerson], sessions: [session(TUESDAY, '09:00', '12:00', 150)] })
  assert.deepEqual([moved.status, moved.body.error], [409, 'class_conflict'])
  assert.equal((await send(s, s.anna, 'PATCH', `/api/items/${hike.body.id}`, { title: 'Nachtwanderung am Dienstag', places: 0, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.berndPerson], sessions: [session(TUESDAY, '18:00', '20:00', 100)] })).status, 200)
  // Approving the trip and the hike: no conflict between them; the organizer withdrawing the trip frees its time.
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${trip.body.id}/approve`)).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${hike.body.id.toUpperCase()}/approve`)).status, 200, 'the id in capitals: the activity does not meet itself')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${trip.body.id}/withdraw`, { reason: 'Kein Bus.' })).status, 200)
  const morning = await send<Item>(s, s.bernd, 'POST', url, { title: 'Morgenwanderung', places: 0, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.berndPerson], sessions: [session(TUESDAY, '09:00', '12:00', 150)] })
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${morning.body.id}/propose`)).status, 200, 'a withdrawn activity holds no class')
})

test('an activity of its teachers alone (no places, no class) is never gated and serves no cell; it takes companions, counts for its lead, and is nothing a student sees', DB, async (t) => {
  const s = await school(t)
  const id = s.campaign.id
  const url = `/api/campaigns/${id}/items`
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...setUp(s.campaign), lockNewOffers: true })).status, 200)
  // Bernd's climbing fills the 3rd to the 6th period for grade 9; a further course there is refused to Carla.
  const climbing = await send<Item>(s, s.bernd, 'POST', url, { title: 'Klettern', places: 12, teachers: [s.berndPerson], sessions: [session(MONDAY, '09:25', '13:10', 210)] })
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${climbing.body.id}/propose`)).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${climbing.body.id}/approve`)).status, 200)
  const yoga = await send<Item>(s, s.carla, 'POST', url, { title: 'Yoga', places: 5, teachers: [s.carlaPerson], sessions: [session(MONDAY, '09:25', '11:20', 100)] })
  assert.equal((await send<{ error: string }>(s, s.carla, 'POST', `/api/items/${yoga.body.id}/propose`)).body.error, 'target_reached')

  // Her supervision in the same periods has no places: it serves no cell, the check refuses nothing, and the submission goes through.
  const duty = await send<Item>(s, s.carla, 'POST', url, { title: 'Aufsicht Bibliothek', places: 0, teachers: [s.carlaPerson], companionsWanted: 1, sessions: [session(MONDAY, '09:25', '11:20', 100)] })
  assert.equal(duty.status, 201, JSON.stringify(duty.body))
  const check = await send<Check>(s, s.carla, 'POST', `/api/campaigns/${id}/items/check`, { itemId: duty.body.id })
  assert.deepEqual([check.body.locked, check.body.refused, check.body.served, check.body.cells], [true, false, [], []])
  const proposed = await send<Item>(s, s.carla, 'POST', `/api/items/${duty.body.id}/propose`)
  assert.equal(proposed.status, 200, JSON.stringify(proposed.body))
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${duty.body.id}/approve`)).status, 200)
  // A minimum makes no sense without places.
  assert.equal((await send(s, s.carla, 'POST', url, { title: 'Aufsicht Hof', places: 0, minParticipants: 2, teachers: [s.carlaPerson], sessions: [session(TUESDAY, '09:25', '11:20', 100)] })).status, 422)

  // It seeks a companion like any activity, and Anna joins; the planning counts Carla as leading it on Monday, beside her draft.
  const joined = await send<Item>(s, s.anna, 'POST', `/api/items/${duty.body.id}/companions/me`)
  assert.equal(joined.status, 200, JSON.stringify(joined.body))
  assert.deepEqual(joined.body.teachers.map((teacher) => teacher.lead), [true, false])
  const planning = await get<{ teachers: { personId: string, days: { date: string, leads: { title: string }[] }[] }[] }>(s, s.anna, `/api/admin/campaigns/${id}/planning`)
  assert.deepEqual(planning.body.teachers.find((teacher) => teacher.personId === s.carlaPerson)?.days.find((d) => d.date === MONDAY)?.leads.map((i) => i.title).sort((x, y) => x.localeCompare(y, 'de')), ['Aufsicht Bibliothek', 'Yoga'])

  // Published: teachers and organizers see it in the list, a student neither there nor in the catalogue, which is what students choose from.
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })).status, 200)
  const titles = async (jar: CookieJar, path: string) => (await get<{ items: Item[] }>(s, jar, path)).body.items.map((i) => i.title).sort((a, b) => a.localeCompare(b, 'de'))
  const sara = await signIn(s, SARA)
  assert.deepEqual(await titles(s.bernd, url), ['Aufsicht Bibliothek', 'Klettern'])
  assert.deepEqual(await titles(s.anna, url), ['Aufsicht Bibliothek', 'Klettern', 'Yoga'])
  assert.deepEqual(await titles(sara, url), ['Klettern'])
  assert.deepEqual(await titles(sara, `/api/campaigns/${id}/catalogue`), ['Klettern'])
  assert.deepEqual(await titles(s.anna, `/api/campaigns/${id}/catalogue`), ['Klettern'])
})
