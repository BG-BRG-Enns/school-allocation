// Planning with teachers on a real database: a teacher sets their own
// availability on the days of a registration taking proposals and on no
// other; an organizer sets anyone's, audited in the registration's chain;
// the activity form sees who is not plainly available; the lead is the
// creator when among the teachers, else the first named; the overview
// shows per teacher and day what they lead and accompany, also as a
// workbook; the place headroom is a registration setting.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CampaignAvailabilityResponse, MyAvailabilityResponse, PlanningResponse } from '@school-allocation/api-contracts/planning'
import { verifyAuditChain } from '../lib/audit-chain.ts'
import { readAudit } from '../lib/audit.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item } from '../lib/models/items.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { DB, get, harness, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA } from './helpers/personas.ts'

const DAYS = ['2027-06-21', '2027-06-22', '2027-06-23']
const MONDAY = { startsAt: '2027-06-21T09:00:00+02:00', endsAt: '2027-06-21T13:00:00+02:00', credits: [{ date: '2027-06-21', minutes: 210 }] }
const VIENNA = { startsAt: '2027-06-22T08:00:00+02:00', endsAt: '2027-06-23T13:00:00+02:00', credits: [{ date: '2027-06-22', minutes: 360 }, { date: '2027-06-23', minutes: 240 }] }

interface Ready extends Harness {
  anna: CookieJar
  bernd: CookieJar
  sara: CookieJar
  annaPerson: string
  berndPerson: string
  carlaPerson: string
}

/** Anna (administrator), Bernd and Carla teach; Sara is a student; all but Carla signed in. */
async function school(t: Parameters<typeof harness>[0]): Promise<Ready> {
  const h = await harness(t, { BOOTSTRAP_ADMINS: ANNA.email ?? '' })
  const anna = await signIn(h, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind',
    `${SARA.email};Sara;Schülerin;5A;9;student`,
    `${ANNA.email};Anna;Lehrerin;;;teacher`, `${BERND.email};Bernd;Lehrer;;;teacher`, `${CARLA.email};Carla;Kollegin;;;teacher`,
  ].join('\n')
  const batch = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  const person = (name: string) => committed.body.diff.added.find((e) => e.displayName === name)?.personId ?? ''
  return { ...h, anna: await signIn(h, ANNA), bernd: await signIn(h, BERND), sara: await signIn(h, SARA), annaPerson: person(ANNA.name), berndPerson: person(BERND.name), carlaPerson: person(CARLA.name) }
}

async function draftCampaign(s: Ready): Promise<Campaign> {
  const created = await send<Campaign>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  return created.body
}

const transition = async (s: Ready, id: string, to: string) => assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to })).status, 200, to)

test('a teacher sets their own days while a registration takes proposals; an organizer sets anyone\'s, audited, the same status again a no-op', DB, async (t) => {
  const s = await school(t)
  const campaign = await draftCampaign(s)
  const mine = (jar: CookieJar) => get<MyAvailabilityResponse>(s, jar, '/api/my-availability')
  const setMine = (jar: CookieJar, date: string, status: string) => send<MyAvailabilityResponse & { error?: string }>(s, jar, 'PUT', `/api/my-availability/${date}`, { status })

  // Being set up, the registration takes no proposals: no days of one's own yet.
  assert.deepEqual((await mine(s.bernd)).body.days, [])
  assert.equal((await setMine(s.bernd, DAYS[0] ?? '', 'unavailable')).body.error, 'campaign_state')

  await transition(s, campaign.id, 'catalogue')
  const open = await mine(s.bernd)
  assert.equal(open.status, 200)
  assert.deepEqual(open.body.days.map((d) => [d.date, d.status, d.campaigns.map((c) => c.name)]), DAYS.map((date) => [date, 'available', ['Projektwoche 2027']]))
  const set = await setMine(s.bernd, '2027-06-21', 'unavailable')
  assert.equal(set.status, 200, JSON.stringify(set.body))
  assert.equal(set.body.days[0]?.status, 'unavailable')
  assert.equal((await setMine(s.bernd, '2027-06-22', 'if_needed')).status, 200)
  assert.equal((await setMine(s.bernd, '2027-06-22', 'available')).body.days[1]?.status, 'available', 'available again removes the row')
  assert.equal((await setMine(s.bernd, '2027-06-22', 'if_needed')).status, 200)
  assert.equal((await setMine(s.bernd, '2027-06-28', 'unavailable')).body.error, 'campaign_state', 'not a day of a registration taking proposals')
  assert.equal((await setMine(s.bernd, '2027-06-21', 'away')).status, 400)
  assert.equal((await setMine(s.sara, '2027-06-21', 'unavailable')).status, 403, 'a student has no availability')
  assert.equal((await mine(s.sara)).status, 403)
  assert.equal((await get(s, undefined, '/api/my-availability')).status, 401)
  const rows = await s.db.query<{ status: string }>('select status from teacher_availability where person_id = $1 order by day', [s.berndPerson])
  assert.deepEqual(rows.rows.map((r) => r.status), ['unavailable', 'if_needed'])

  // The activity form's view, for whoever proposes: who is not plainly available on which day.
  const limited = await get<CampaignAvailabilityResponse>(s, s.anna, `/api/campaigns/${campaign.id}/availability`)
  assert.equal(limited.status, 200)
  assert.deepEqual(limited.body.limited, [
    { personId: s.berndPerson, date: '2027-06-21', status: 'unavailable' },
    { personId: s.berndPerson, date: '2027-06-22', status: 'if_needed' },
  ])

  // The organizer, for anyone on the registration's days; once published too.
  await transition(s, campaign.id, 'published')
  assert.deepEqual((await mine(s.bernd)).body.days, [], 'published, the days are the organizer\'s to change')
  assert.equal((await setMine(s.bernd, '2027-06-21', 'available')).body.error, 'campaign_state')
  const forCarla = (jar: CookieJar, personId: string, date: string, status: string) => send<PlanningResponse & { error?: string }>(s, jar, 'PUT', `/api/admin/campaigns/${campaign.id}/availability/${personId}/${date}`, { status })
  const changed = await forCarla(s.anna, s.carlaPerson, '2027-06-23', 'if_needed')
  assert.equal(changed.status, 200, JSON.stringify(changed.body))
  assert.equal(changed.body.teachers.find((teacher) => teacher.personId === s.carlaPerson)?.days[2]?.status, 'if_needed')
  assert.equal((await forCarla(s.anna, s.carlaPerson.toUpperCase(), '2027-06-23', 'if_needed')).status, 200, 'the same status again')
  assert.equal((await forCarla(s.bernd, s.carlaPerson, '2027-06-23', 'available')).status, 403, 'not an organizer')
  assert.equal((await forCarla(s.anna, s.carlaPerson, '2027-06-24', 'available')).status, 404, 'not a project day of the registration')
  assert.equal((await forCarla(s.anna, '00000000-0000-4000-8000-000000000000', '2027-06-23', 'available')).body.error, 'teacher_unknown')
  const sarasPerson = (await get<{ person: { id: string } }>(s, s.sara, '/api/auth/me')).body.person.id
  assert.equal((await forCarla(s.anna, sarasPerson, '2027-06-23', 'unavailable')).body.error, 'teacher_unknown', 'a student is not one of the planning\'s teachers')
  assert.equal((await forCarla(s.anna, s.berndPerson, '2027-06-21', 'available')).status, 200)

  const events = (await readAudit(s.db, campaign.id)).filter((e) => e.action === 'availability.changed')
  assert.deepEqual(events.map((e) => e.metadata), [
    { personId: s.carlaPerson, date: '2027-06-23', status: 'if_needed' },
    { personId: s.berndPerson, date: '2027-06-21', status: 'available' },
  ], 'the organizer\'s changes, once each; a teacher\'s own are not the registration\'s')
  assert.equal(verifyAuditChain(await readAudit(s.db, campaign.id)).valid, true)
})

test('the lead is the creator when among the teachers, else the first named; the overview shows who leads and accompanies what on each day', DB, async (t) => {
  const s = await school(t)
  const campaign = await draftCampaign(s)
  await transition(s, campaign.id, 'catalogue')
  const url = `/api/campaigns/${campaign.id}/items`

  // Bernd creates it and names Carla first: he leads.
  const climbing = await send<Item>(s, s.bernd, 'POST', url, { title: 'Klettern', places: 12, teachers: [s.carlaPerson, s.berndPerson], sessions: [MONDAY] })
  assert.equal(climbing.status, 201, JSON.stringify(climbing.body))
  assert.equal(climbing.body.proposedBy.personId, s.berndPerson)
  assert.deepEqual(climbing.body.teachers.map((teacher) => [teacher.personId, teacher.lead]), [[s.carlaPerson, false], [s.berndPerson, true]])
  // Anna, a teacher too, creates one for Carla and Bernd: named first as its creator, she leads; once she takes herself off, the first named does.
  const vienna = await send<Item>(s, s.anna, 'POST', url, { title: 'Wien', places: 8, teachers: [s.carlaPerson, s.berndPerson], sessions: [VIENNA] })
  assert.equal(vienna.status, 201, JSON.stringify(vienna.body))
  assert.deepEqual(vienna.body.teachers.map((teacher) => [teacher.personId, teacher.lead]), [[s.annaPerson, true], [s.carlaPerson, false], [s.berndPerson, false]])
  const handedOver = await send<Item>(s, s.anna, 'PATCH', `/api/items/${vienna.body.id}`, { title: 'Wien', places: 8, teachers: [s.carlaPerson, s.berndPerson], sessions: [VIENNA] })
  assert.equal(handedOver.status, 200, JSON.stringify(handedOver.body))
  assert.deepEqual(handedOver.body.teachers.map((teacher) => [teacher.personId, teacher.lead]), [[s.carlaPerson, true], [s.berndPerson, false]])
  // A withdrawn activity is nobody's work.
  const dropped = await send<Item>(s, s.bernd, 'POST', url, { title: 'Schach', places: 8, teachers: [s.annaPerson], sessions: [MONDAY] })
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${dropped.body.id}/propose`)).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${dropped.body.id}/withdraw`, { reason: 'abgesagt' })).status, 200)
  // The lead is the same in the list as on creation.
  const listed = await get<{ items: Item[] }>(s, s.bernd, url)
  assert.deepEqual(listed.body.items.filter((i) => i.state !== 'withdrawn').map((i) => [i.title, i.teachers.find((teacher) => teacher.lead)?.personId]), [['Klettern', s.berndPerson], ['Wien', s.carlaPerson]])

  const overview = await get<PlanningResponse>(s, s.anna, `/api/admin/campaigns/${campaign.id}/planning`)
  assert.equal(overview.status, 200, JSON.stringify(overview.body))
  assert.deepEqual(overview.body.days, DAYS)
  assert.equal(overview.body.editable, true)
  const doing = (personId: string) => overview.body.teachers.find((teacher) => teacher.personId === personId)?.days.map((d) => [d.date, d.leads.map((i) => i.title), d.accompanies.map((i) => i.title)])
  assert.deepEqual(overview.body.teachers.map((teacher) => teacher.displayName), [ANNA.name, BERND.name, CARLA.name])
  assert.deepEqual(doing(s.annaPerson), [['2027-06-21', [], []], ['2027-06-22', [], []], ['2027-06-23', [], []]], 'free: the chess she was named for is withdrawn')
  assert.deepEqual(doing(s.berndPerson), [['2027-06-21', ['Klettern'], []], ['2027-06-22', [], ['Wien']], ['2027-06-23', [], ['Wien']]])
  assert.deepEqual(doing(s.carlaPerson), [['2027-06-21', [], ['Klettern']], ['2027-06-22', ['Wien'], []], ['2027-06-23', ['Wien'], []]])
  assert.equal((await get(s, s.bernd, `/api/admin/campaigns/${campaign.id}/planning`)).status, 403)
  assert.equal((await get(s, s.anna, '/api/admin/campaigns/00000000-0000-4000-8000-000000000000/planning')).status, 404)

  // The workbook: one row per teacher and day.
  const sheet = await s.app.inject({ method: 'GET', url: `/api/admin/campaigns/${campaign.id}/export/planning.xlsx`, headers: { cookie: s.anna.header() } })
  assert.equal(sheet.statusCode, 200)
  assert.equal(sheet.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.match(sheet.headers['content-disposition'] as string, /lehrkraefte-2026-27\.xlsx/)
  assert.equal(sheet.rawPayload.subarray(0, 2).toString('latin1'), 'PK')
  assert.equal((await s.app.inject({ method: 'GET', url: `/api/admin/campaigns/${campaign.id}/export/planning.xlsx`, headers: { cookie: s.bernd.header() } })).statusCode, 403)

  // The activity form's view is for whoever proposes, not for a student once the catalogue is out.
  await transition(s, campaign.id, 'published')
  assert.equal((await get(s, s.sara, `/api/campaigns/${campaign.id}/availability`)).status, 403)
  assert.equal((await get(s, s.bernd, `/api/campaigns/${campaign.id}/availability`)).status, 200)
})

test('the place headroom is a registration setting, 20 % unless changed, from 0 to 100, while the window may change', DB, async (t) => {
  const s = await school(t)
  const campaign = await draftCampaign(s)
  assert.equal(campaign.placeHeadroomPercent, 20)
  const change = (percent: number) => send<Campaign & { error?: string }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${campaign.id}`, { name: campaign.name, schoolYear: campaign.schoolYear, projectDays: DAYS, placeHeadroomPercent: percent })
  const changed = await change(35)
  assert.equal(changed.status, 200, JSON.stringify(changed.body))
  assert.equal(changed.body.placeHeadroomPercent, 35)
  assert.equal((await change(101)).status, 400)
  assert.equal((await change(-1)).status, 400)
  assert.equal((await change(0)).body.placeHeadroomPercent, 0)
  const events = (await readAudit(s.db, campaign.id)).filter((e) => e.action === 'campaign.changed')
  assert.deepEqual(events.map((e) => e.metadata.window), [true, true], 'a change of the window\'s settings, in the registration\'s chain')
})
