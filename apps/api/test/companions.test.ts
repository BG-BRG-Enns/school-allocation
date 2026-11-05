// Companions sought, end to end on a real database: a lead says how many
// teachers they want beside them; a teacher joins from the list while a
// place is sought, not twice, not over one of their own, not on a day they
// are unavailable; leaves again until the registration opens; the lead and
// an organizer set the companions alone; every change is in the campaign's
// audit chain.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readAudit } from '../lib/audit.ts'
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
  sara: CookieJar
  berndPerson: string
  carlaPerson: string
  campaign: Campaign
}

type Entry = { id: string, title: string, state: string, wanted: number, named: number, sought: number, leading: boolean, accompanying: boolean, join: { ok: boolean, problem?: string }, mayLeave: boolean }
type List = { mayJoin: boolean, days: { date: string, myStatus: string, items: Entry[] }[] }

/** Sara and Tim in 5A, three teachers (Anna organizes too); a registration taking proposals. */
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
  const created = await send<Campaign>(h, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const opened = await send<Campaign>(h, anna, 'POST', `/api/admin/campaigns/${created.body.id}/transition`, { to: 'catalogue' })
  assert.equal(opened.status, 200)
  return { ...h, anna, bernd: await signIn(h, BERND), carla: await signIn(h, CARLA), sara: await signIn(h, SARA), berndPerson: person(BERND.name), carlaPerson: person(CARLA.name), campaign: opened.body }
}

const entry = (list: List, date: string, id: string): Entry | undefined => list.days.find((d) => d.date === date)?.items.find((i) => i.id === id)

test('a teacher joins an activity that seeks a companion from the list, not twice, not over one of their own, not on a day they are unavailable; leaves until the registration opens; the lead and an organizer set the companions alone', DB, async (t) => {
  const s = await school(t)
  const id = s.campaign.id
  const url = `/api/campaigns/${id}/items`
  const propose = async (jar: CookieJar, body: object): Promise<Item> => {
    const made = await send<Item>(s, jar, 'POST', url, body)
    assert.equal(made.status, 201, JSON.stringify(made.body))
    const proposed = await send<Item>(s, jar, 'POST', `/api/items/${made.body.id}/propose`)
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body))
    return proposed.body
  }

  // Bernd's climbing wants one companion; the lone lead counts as none named, so one is sought.
  const climbing = await propose(s.bernd, { title: 'Klettern', places: 12, teachers: [s.berndPerson], companionsWanted: 1, sessions: [session(MONDAY, '08:30', '12:15', 210)] })
  assert.deepEqual([climbing.companionsWanted, climbing.teachers.length], [1, 1])
  assert.equal((await send(s, s.bernd, 'POST', url, { title: 'Zu viele', places: 12, teachers: [s.berndPerson], companionsWanted: 9, sessions: [session(MONDAY, '08:30', '12:15', 210)] })).status, 400, 'at most eight')

  // The list: a student does not see the registration while it takes proposals, let alone the list; Carla sees the climbing on Monday, sought 1, and may join; Bernd sees it as its lead.
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}/companions`)).status, 404)
  const carlaSees = await get<List>(s, s.carla, `/api/campaigns/${id}/companions`)
  assert.equal(carlaSees.status, 200, JSON.stringify(carlaSees.body))
  assert.deepEqual(carlaSees.body.days.map((d) => [d.date, d.myStatus, d.items.length]), [[MONDAY, 'available', 1], [TUESDAY, 'available', 0]])
  assert.deepEqual(entry(carlaSees.body, MONDAY, climbing.id), { id: climbing.id, title: 'Klettern', state: 'proposed', wanted: 1, named: 0, sought: 1, leading: false, accompanying: false, join: { ok: true }, mayLeave: false, ...({ number: null, sessions: [{ startsAt: '2027-06-21T06:30:00Z', endsAt: '2027-06-21T10:15:00Z' }], lead: { displayName: BERND.name, shortName: null } }) })
  assert.deepEqual(entry((await get<List>(s, s.bernd, `/api/campaigns/${id}/companions`)).body, MONDAY, climbing.id)?.leading, true)

  // Carla joins: a teacher of it beside the lead, nothing sought any more; joining again changes nothing; Anna finds it full.
  const joined = await send<Item>(s, s.carla, 'POST', `/api/items/${climbing.id}/companions/me`)
  assert.equal(joined.status, 200, JSON.stringify(joined.body))
  assert.deepEqual(joined.body.teachers.map((teacher) => [teacher.personId, teacher.lead]), [[s.berndPerson, true], [s.carlaPerson, false]])
  assert.equal((await send<Item>(s, s.carla, 'POST', `/api/items/${climbing.id}/companions/me`)).body.teachers.length, 2, 'once')
  const full = await send<{ error: string }>(s, s.anna, 'POST', `/api/items/${climbing.id}/companions/me`)
  assert.deepEqual([full.status, full.body.error], [409, 'companions_full'])
  const accompanying = entry((await get<List>(s, s.carla, `/api/campaigns/${id}/companions`)).body, MONDAY, climbing.id)
  assert.deepEqual([accompanying?.sought, accompanying?.accompanying, accompanying?.join, accompanying?.mayLeave], [0, true, { ok: false, problem: 'none_sought' }, true])
  assert.equal(entry((await get<List>(s, s.anna, `/api/campaigns/${id}/companions`)).body, MONDAY, climbing.id), undefined, 'full and not hers: off the list')

  // Over her own time: Bernd's dance in the climbing's hours is refused to Carla, and the list says why.
  const dance = await propose(s.bernd, { title: 'Tanz', places: 10, teachers: [s.berndPerson], companionsWanted: 1, sessions: [session(MONDAY, '10:00', '11:00', 50)] })
  assert.deepEqual(entry((await get<List>(s, s.carla, `/api/campaigns/${id}/companions`)).body, MONDAY, dance.id)?.join, { ok: false, problem: 'overlap' })
  const overlap = await send<{ error: string }>(s, s.carla, 'POST', `/api/items/${dance.id}/companions/me`)
  assert.deepEqual([overlap.status, overlap.body.error], [409, 'teacher_overlap'])

  // On a day she is unavailable: refused; "nur wenn nötig" passes.
  const darts = await propose(s.bernd, { title: 'Darts', places: 20, teachers: [s.berndPerson], companionsWanted: 1, sessions: [session(TUESDAY, '08:30', '12:15', 210)] })
  assert.equal((await send(s, s.carla, 'PUT', `/api/my-availability/${TUESDAY}`, { status: 'unavailable' })).status, 200)
  const tuesday = (await get<List>(s, s.carla, `/api/campaigns/${id}/companions`)).body.days.find((d) => d.date === TUESDAY)
  assert.deepEqual([tuesday?.myStatus, tuesday?.items[0]?.join], ['unavailable', { ok: false, problem: 'unavailable' }])
  const away = await send<{ error: string }>(s, s.carla, 'POST', `/api/items/${darts.id}/companions/me`)
  assert.deepEqual([away.status, away.body.error], [409, 'teacher_unavailable'])
  assert.equal((await send(s, s.carla, 'PUT', `/api/my-availability/${TUESDAY}`, { status: 'if_needed' })).status, 200)
  assert.equal((await send(s, s.carla, 'POST', `/api/items/${darts.id}/companions/me`)).status, 200)

  // She leaves the darts again while the catalogue is open; the lead does not leave this way; a stranger to it has nothing to leave.
  assert.equal((await send<Item>(s, s.carla, 'DELETE', `/api/items/${darts.id}/companions/me`)).body.teachers.length, 1)
  assert.equal((await send(s, s.bernd, 'DELETE', `/api/items/${climbing.id}/companions/me`)).status, 403)
  assert.equal((await send(s, s.anna, 'DELETE', `/api/items/${climbing.id}/companions/me`)).status, 403)

  // The companions alone: the lead sets them and the number wanted; another teacher may not; an organizer may; a stranger to the roster is refused.
  const widened = await send<Item>(s, s.bernd, 'PUT', `/api/items/${climbing.id}/companions`, { companions: [], wanted: 2 })
  assert.equal(widened.status, 200, JSON.stringify(widened.body))
  assert.deepEqual([widened.body.teachers.map((teacher) => teacher.personId), widened.body.companionsWanted, widened.body.state], [[s.berndPerson], 2, 'proposed'])
  assert.equal((await send(s, s.carla, 'PUT', `/api/items/${climbing.id}/companions`, { companions: [s.carlaPerson], wanted: 2 })).status, 403)
  const unknown = await send<{ error: string, unknownTeachers: string[] }>(s, s.anna, 'PUT', `/api/items/${climbing.id}/companions`, { companions: ['00000000-0000-4000-8000-000000000099'], wanted: 1 })
  assert.deepEqual([unknown.status, unknown.body.error, unknown.body.unknownTeachers.length], [422, 'item_invalid', 1])
  const set = await send<Item>(s, s.anna, 'PUT', `/api/items/${climbing.id}/companions`, { companions: [s.carlaPerson.toUpperCase(), s.berndPerson], wanted: 1 })
  assert.deepEqual(set.body.teachers.map((teacher) => [teacher.personId, teacher.lead]), [[s.berndPerson, true], [s.carlaPerson, false]], 'the lead stays first and is no companion')

  // Approved and published, the registration open: joining goes on for an activity that takes place, leaving on one's own does not.
  for (const item of [climbing, dance, darts]) assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${item.id}/approve`)).status, 200)
  const window = { name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS, opensAt: '2027-03-01T08:00:00+01:00', closesAt: '2027-03-08T20:00:00+01:00', lateUntil: '2027-03-12T20:00:00+01:00', reminderDays: 1 }
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, window)).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })).status, 200)
  const stays = await send<{ error: string }>(s, s.carla, 'DELETE', `/api/items/${climbing.id}/companions/me`)
  assert.deepEqual([stays.status, stays.body.error], [409, 'campaign_state'])
  assert.equal((await send(s, s.carla, 'POST', `/api/items/${darts.id}/companions/me`)).status, 200, 'the darts still seek one')
  assert.equal(entry((await get<List>(s, s.carla, `/api/campaigns/${id}/companions`)).body, TUESDAY, darts.id)?.mayLeave, false)

  // The campaign's chain has every step.
  const actions = (await readAudit(s.db, id)).map((event) => event.action).filter((action) => action.startsWith('item.companion'))
  assert.deepEqual(actions, ['item.companion-joined', 'item.companion-joined', 'item.companion-left', 'item.companions-changed', 'item.companions-changed', 'item.companion-joined'])
})
