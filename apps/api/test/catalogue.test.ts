// A campaign and its catalogue, end to end on a real database: an organizer
// sets the campaign up and opens it for proposals, a teacher proposes an
// activity within the rules, the organizer returns, approves and publishes,
// the approved items are numbered, and every reader sees what their role
// allows and nothing else.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readAudit } from '../lib/audit.ts'
import { verifyAuditChain } from '../lib/audit-chain.ts'
import type { Campaign } from '../lib/campaigns.ts'
import { createDatabase } from '../lib/db.ts'
import type { Item } from '../lib/items.ts'
import type { BatchDetail } from '../lib/roster.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { DB, get, harness, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const DAYS = ['2027-06-21', '2027-06-22', '2027-06-23']
// Monday 09:00–13:00 and Tuesday 08:00 – Wednesday 13:00, Vienna time.
const MONDAY = { startsAt: '2027-06-21T09:00:00+02:00', endsAt: '2027-06-21T13:00:00+02:00', credits: [{ date: '2027-06-21', minutes: 210 }] }
const VIENNA = { startsAt: '2027-06-22T08:00:00+02:00', endsAt: '2027-06-23T13:00:00+02:00', location: 'Wien', credits: [{ date: '2027-06-22', minutes: 360 }, { date: '2027-06-23', minutes: 240 }] }

interface Ready extends Harness {
  anna: CookieJar
  bernd: CookieJar
  carla: CookieJar
  sara: CookieJar
  annaPerson: string
  berndPerson: string
  carlaPerson: string
}

/** A school with a roster in force (two teachers, two students in 5A), everyone signed in and bound. */
async function school(t: Parameters<typeof harness>[0]): Promise<Ready> {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind',
    `${SARA.email};Sara;Schülerin;5A;9;student`, `${TIM.email};Tim;Schüler;5A;9;student`,
    `${ANNA.email};Anna;Lehrerin;;;teacher`, `${BERND.email};Bernd;Lehrer;;;teacher`, `${CARLA.email};Carla;Kollegin;;;teacher`,
  ].join('\n')
  const batch = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  const person = (name: string) => committed.body.diff.added.find((e) => e.displayName === name)?.personId ?? ''
  return { ...h, anna: await signIn(h, ANNA), bernd: await signIn(h, BERND), carla: await signIn(h, CARLA), sara: await signIn(h, SARA), annaPerson: person(ANNA.name), berndPerson: person(BERND.name), carlaPerson: person(CARLA.name) }
}

async function campaignTakingProposals(s: Ready): Promise<Campaign> {
  const created = await send<Campaign>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: [...DAYS].reverse() })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  assert.deepEqual(created.body.projectDays, DAYS, 'days are kept sorted')
  const opened = await send<Campaign>(s, s.anna, 'POST', `/api/admin/campaigns/${created.body.id}/transition`, { to: 'catalogue' })
  assert.equal(opened.status, 200)
  return opened.body
}

test('a campaign is visible by role and state; its settings change only while it is set up; the later states are not available yet', DB, async (t) => {
  const s = await school(t)
  const created = await send<Campaign>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS })
  assert.equal(created.status, 201)
  const id = created.body.id
  assert.equal((await send(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'x', schoolYear: '2026/27', projectDays: ['2027-06-21', '2027-06-21'] })).status, 422)
  assert.equal((await send(s, s.bernd, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'x', schoolYear: '2026/27', projectDays: DAYS })).status, 403)

  // A draft is the organizers' alone.
  assert.equal((await get(s, s.bernd, `/api/campaigns/${id}`)).status, 404)
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}`)).status, 404)
  assert.deepEqual((await get<{ campaigns: Campaign[] }>(s, s.bernd, '/api/campaigns')).body.campaigns, [])
  assert.equal((await get<{ campaigns: Campaign[] }>(s, s.anna, '/api/campaigns')).body.campaigns.length, 1)

  // The id in whatever case the URL carries it: the audit scope stays the stored one.
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id.toUpperCase()}`, { name: 'Projektwoche Juni 2027', schoolYear: '2026/27', projectDays: DAYS.slice(0, 2) })).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })).status, 409, 'published does not follow draft')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })).status, 400, 'not a transition this release offers')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'catalogue' })).status, 200)

  // Taking proposals: teachers see it, students do not.
  const bernd = await get<{ campaign: Campaign, counts: unknown, may: { propose: boolean, organize: boolean } }>(s, s.bernd, `/api/campaigns/${id}`)
  assert.equal(bernd.status, 200)
  assert.deepEqual(bernd.body.may, { propose: true, organize: false })
  assert.equal(bernd.body.counts, null)
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}`)).status, 404)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })).status, 200)
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: 'x', schoolYear: '2026/27', projectDays: DAYS })).status, 409, 'published, the days are final')
  const sara = await get<{ campaign: Campaign, may: { propose: boolean } }>(s, s.sara, `/api/campaigns/${id}`)
  assert.equal(sara.status, 200)
  assert.equal(sara.body.may.propose, false)
  assert.equal((await get(s, undefined, `/api/campaigns/${id}`)).status, 401)

  const db = createDatabase(s.ownerUrl, () => {})
  t.after(() => db.close())
  const events = await readAudit(db, id)
  assert.deepEqual(events.map((e) => e.action), ['campaign.changed', 'campaign.transitioned', 'campaign.transitioned'])
  assert.equal(verifyAuditChain(events).valid, true)
})

test('a teacher proposes within the rules, the organizer returns, approves and publishes, and the catalogue is numbered in print order', DB, async (t) => {
  const s = await school(t)
  const campaign = await campaignTakingProposals(s)
  const url = `/api/campaigns/${campaign.id}/items`

  // Pickers for the form.
  const classes = await get<{ classes: { className: string, grade: number }[] }>(s, s.bernd, `/api/campaigns/${campaign.id}/classes`)
  assert.deepEqual(classes.body.classes, [{ className: '5A', grade: 9 }])
  const teachers = await get<{ teachers: { personId: string, displayName: string }[] }>(s, s.bernd, `/api/campaigns/${campaign.id}/teachers?q=ko`)
  assert.deepEqual(teachers.body.teachers.map((x) => x.displayName), [CARLA.name])
  assert.equal((await get(s, s.sara, `/api/campaigns/${campaign.id}/classes`)).status, 404, 'students do not see a campaign taking proposals')

  // The rules, refused with their codes.
  const invalid = await send<{ error: string, problems: { code: string, session?: number }[], unknownTeachers: string[] }>(s, s.bernd, 'POST', url, {
    title: 'Falsch', places: 5, minParticipants: 10, fixedClasses: ['7C'], cancellableBelowMin: true, teachers: ['00000000-0000-4000-8000-000000000000'],
    sessions: [{ startsAt: '2027-06-28T09:00:00+02:00', endsAt: '2027-06-28T08:00:00+02:00', credits: [{ date: '2027-06-21', minutes: 60 }] }],
  })
  assert.equal(invalid.status, 422)
  assert.deepEqual(invalid.body.problems.map((p) => p.code).sort(), ['credit_date_outside_session', 'fixed_class_unknown', 'fixed_item_cancellable', 'min_above_places', 'session_ends_before_start', 'session_outside_project_days'])
  assert.deepEqual(invalid.body.unknownTeachers, ['00000000-0000-4000-8000-000000000000'])
  assert.equal((await send(s, s.bernd, 'POST', url, { title: 'x', places: 5, teachers: [], sessions: [MONDAY], extra: 1 })).status, 400)
  assert.equal((await send(s, s.sara, 'POST', url, { title: 'x', places: 5, teachers: [], sessions: [MONDAY] })).status, 404, 'a student cannot even see it')

  // Bernd's draft: he is its teacher without naming himself. Carla's trip for 5A with spare seats.
  const draft = await send<Item>(s, s.bernd, 'POST', url, { title: 'Klettern', description: 'Kletterhalle Linz', places: 12, minParticipants: 6, feeCents: 1500, feeNote: 'Eintritt', teachers: [], sessions: [MONDAY] })
  assert.equal(draft.status, 201, JSON.stringify(draft.body))
  assert.equal(draft.body.state, 'draft')
  assert.deepEqual(draft.body.teachers.map((x) => x.displayName), [BERND.name])
  assert.equal(draft.body.sessions[0]?.startsAt, '2027-06-21T07:00:00Z')
  const trip = await send<Item>(s, s.carla, 'POST', url, { title: 'Wien', places: 8, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.berndPerson], sessions: [VIENNA] })
  assert.equal(trip.status, 201, JSON.stringify(trip.body))
  assert.deepEqual(trip.body.teachers.map((x) => x.displayName), [CARLA.name, BERND.name])
  assert.deepEqual(trip.body.fixedClasses, ['5A'])

  // Own drafts are edited and seen by their teachers, by nobody else but organizers.
  assert.equal((await send(s, s.carla, 'PATCH', `/api/items/${draft.body.id}`, { title: 'Klettern!', places: 12, teachers: [s.berndPerson], sessions: [MONDAY] })).status, 403)
  assert.equal((await send(s, s.bernd, 'PATCH', `/api/items/${draft.body.id}`, { title: 'Klettern und Bouldern', places: 12, minParticipants: 6, teachers: [s.berndPerson], sessions: [MONDAY] })).status, 200)
  assert.deepEqual((await get<{ items: Item[] }>(s, s.carla, url)).body.items.map((i) => i.title), ['Wien'], 'Carla sees her own only')
  assert.deepEqual((await get<{ items: Item[] }>(s, s.bernd, url)).body.items.map((i) => i.title).sort(), ['Klettern und Bouldern', 'Wien'], 'Bernd teaches on both')
  assert.deepEqual((await get<{ items: Item[] }>(s, s.anna, url)).body.items.length, 2)

  // Propose, return with a note, propose again, approve; the audit log of the campaign records the organizer's steps.
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${draft.body.id}/approve`)).status, 409, 'a draft is not approved')
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${draft.body.id}/propose`)).status, 200)
  assert.equal((await send(s, s.bernd, 'PATCH', `/api/items/${draft.body.id}`, { title: 'x', places: 12, teachers: [s.berndPerson], sessions: [MONDAY] })).status, 409, 'a proposal is not edited by its teacher')
  const returned = await send<Item>(s, s.anna, 'POST', `/api/admin/items/${draft.body.id}/return`, { note: 'Bitte den Treffpunkt ergänzen.' })
  assert.equal(returned.status, 200, JSON.stringify(returned.body))
  assert.equal(returned.body.state, 'draft')
  assert.equal(returned.body.reviewNote, 'Bitte den Treffpunkt ergänzen.')
  assert.equal((await send(s, s.bernd, 'PATCH', `/api/items/${draft.body.id}`, { title: 'Klettern und Bouldern', location: 'Treffpunkt Bahnhof', places: 12, minParticipants: 6, teachers: [s.berndPerson], sessions: [MONDAY] })).status, 200)
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${draft.body.id}/propose`)).status, 200)
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${draft.body.id}/unpropose`)).status, 200)
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${draft.body.id}/propose`)).status, 200)
  assert.equal((await send(s, s.carla, 'POST', `/api/items/${trip.body.id}/propose`)).status, 200)
  const approved = await send<Item>(s, s.anna, 'POST', `/api/admin/items/${draft.body.id}/approve`)
  assert.equal(approved.status, 200)
  assert.equal(approved.body.state, 'approved')
  assert.equal(approved.body.number, null, 'numbered at publication')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${trip.body.id}/approve`)).status, 200)
  // An organizer's change to someone else's item is audited, and does not make the organizer (a roster teacher herself) one of its teachers.
  const corrected = await send<Item>(s, s.anna, 'PATCH', `/api/items/${trip.body.id}`, { title: 'Wien-Exkursion', places: 8, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.carlaPerson, s.berndPerson], sessions: [VIENNA] })
  assert.equal(corrected.status, 200)
  assert.deepEqual(corrected.body.teachers.map((t) => t.displayName), [CARLA.name, BERND.name])
  // A day with sessions on it cannot be taken from the campaign.
  assert.equal((await send<{ error: string }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${campaign.id}`, { name: campaign.name, schoolYear: '2026/27', projectDays: [DAYS[0]] })).body.error, 'sessions_outside_days')
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${campaign.id}`, { name: campaign.name, schoolYear: '2026/27', projectDays: [...DAYS, '2027-06-24'] })).status, 200)

  // Students see nothing until publication; then the catalogue in print order: Monday's climbing before Tuesday's trip.
  assert.equal((await get(s, s.sara, `/api/campaigns/${campaign.id}/catalogue`)).status, 404)
  const published = await send<Campaign>(s, s.anna, 'POST', `/api/admin/campaigns/${campaign.id}/transition`, { to: 'published' })
  assert.equal(published.status, 200)
  const catalogue = await get<{ campaign: Campaign, items: Item[] }>(s, s.sara, `/api/campaigns/${campaign.id}/catalogue`)
  assert.equal(catalogue.status, 200)
  assert.deepEqual(catalogue.body.items.map((i) => [i.number, i.title]), [[1, 'Klettern und Bouldern'], [2, 'Wien-Exkursion']])
  assert.deepEqual((await get<{ items: Item[] }>(s, s.sara, url)).body.items.map((i) => i.number), [1, 2])
  assert.equal((await send(s, s.bernd, 'POST', url, { title: 'Zu spät', places: 5, teachers: [], sessions: [MONDAY] })).status, 409, 'proposals are closed')
  // A late item an organizer proposes and approves gets the next number.
  const late = await send<Item>(s, s.anna, 'POST', url, { title: 'Nachzügler', places: 5, teachers: [s.carlaPerson], sessions: [MONDAY] })
  assert.equal(late.status, 409, 'not even an organizer proposes into a published catalogue')
  // After publication an organizer corrects directly (audited) or withdraws; a return would strand the item.
  assert.equal((await send<{ error: string }>(s, s.anna, 'POST', `/api/admin/items/${draft.body.id}/return`, { note: 'x' })).body.error, 'campaign_state')
  assert.equal((await send(s, s.anna, 'PATCH', `/api/items/${draft.body.id}`, { title: 'Klettern und Bouldern', location: 'Treffpunkt Bahnhof, 8:45', places: 12, minParticipants: 6, teachers: [s.berndPerson], sessions: [MONDAY] })).status, 200)
  assert.equal((await send(s, s.bernd, 'DELETE', `/api/items/${draft.body.id}`)).status, 409, 'a numbered item is never removed')

  const db = createDatabase(s.ownerUrl, () => {})
  t.after(() => db.close())
  const events = await readAudit(db, campaign.id)
  assert.deepEqual(events.map((e) => e.action), ['campaign.transitioned', 'item.returned', 'item.approved', 'item.approved', 'item.changed', 'campaign.changed', 'campaign.transitioned', 'item.changed'])
  assert.equal(events[1]?.metadata.note, 'Bitte den Treffpunkt ergänzen.')
  assert.deepEqual(events[6]?.metadata.numbered, 2)
  assert.equal(verifyAuditChain(events).valid, true)
})

test('an organizer\'s edit of their own item is recorded once it needs organizer rights', DB, async (t) => {
  const s = await school(t)
  const campaign = await campaignTakingProposals(s)
  // Anna is a roster teacher too: her own draft is a teacher's business, unrecorded.
  const own = await send<Item>(s, s.anna, 'POST', `/api/campaigns/${campaign.id}/items`, { title: 'Schach', places: 10, teachers: [], sessions: [MONDAY] })
  assert.equal(own.status, 201)
  assert.equal((await send(s, s.anna, 'PATCH', `/api/items/${own.body.id}`, { title: 'Schach und Go', places: 10, teachers: [s.annaPerson], sessions: [MONDAY] })).status, 200)
  await send(s, s.anna, 'POST', `/api/items/${own.body.id}/propose`)
  await send(s, s.anna, 'POST', `/api/admin/items/${own.body.id}/approve`)
  // Approved, the same edit is an organizer's change, own item or not.
  assert.equal((await send(s, s.anna, 'PATCH', `/api/items/${own.body.id}`, { title: 'Schach, Go und Dame', places: 10, teachers: [s.annaPerson], sessions: [MONDAY] })).status, 200)
  const db = createDatabase(s.ownerUrl, () => {})
  t.after(() => db.close())
  const events = await readAudit(db, campaign.id)
  assert.deepEqual(events.map((e) => e.action), ['campaign.transitioned', 'item.approved', 'item.changed'])
})

test('a draft is deleted by its teacher, anything later is withdrawn by an organizer, and the catalogue is exported as a workbook', DB, async (t) => {
  const s = await school(t)
  const campaign = await campaignTakingProposals(s)
  const url = `/api/campaigns/${campaign.id}/items`
  const a = await send<Item>(s, s.bernd, 'POST', url, { title: 'A', places: 10, teachers: [], sessions: [MONDAY] })
  const b = await send<Item>(s, s.bernd, 'POST', url, { title: 'B', places: 10, teachers: [], sessions: [MONDAY] })
  assert.equal((await send(s, s.carla, 'DELETE', `/api/items/${a.body.id}`)).status, 403)
  // Drafting is the teachers' alone: an organizer neither removes nor proposes someone else's draft; she withdraws, audited.
  assert.equal((await send(s, s.anna, 'DELETE', `/api/items/${a.body.id}`)).status, 403)
  assert.equal((await send(s, s.anna, 'POST', `/api/items/${a.body.id}/propose`)).status, 403)
  assert.equal((await send(s, s.bernd, 'DELETE', `/api/items/${a.body.id}`)).status, 204)
  assert.equal((await get(s, s.bernd, `/api/items/${a.body.id}/propose`)).status, 404)
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${b.body.id}/propose`)).status, 200)
  assert.equal((await send(s, s.bernd, 'DELETE', `/api/items/${b.body.id}`)).status, 409, 'a proposal is not removed')
  assert.equal((await send(s, s.bernd, 'POST', `/api/admin/items/${b.body.id}/withdraw`, { reason: 'x' })).status, 403)
  const withdrawn = await send<Item>(s, s.anna, 'POST', `/api/admin/items/${b.body.id}/withdraw`, { reason: 'Doppelt eingereicht' })
  assert.equal(withdrawn.status, 200)
  assert.equal(withdrawn.body.state, 'withdrawn')
  assert.equal(withdrawn.body.withdrawReason, 'Doppelt eingereicht')
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${b.body.id}/propose`)).status, 409, 'withdrawn is the end')
  assert.equal((await send(s, s.anna, 'PATCH', `/api/items/${b.body.id}`, { title: 'B', places: 10, teachers: [s.berndPerson], sessions: [MONDAY] })).status, 409)

  const c = await send<Item>(s, s.carla, 'POST', url, { title: 'C', places: 4, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [], sessions: [VIENNA] })
  await send(s, s.carla, 'POST', `/api/items/${c.body.id}/propose`)
  await send(s, s.anna, 'POST', `/api/admin/items/${c.body.id}/approve`)
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${campaign.id}/transition`, { to: 'published' })

  const sheet = await s.app.inject({ method: 'GET', url: `/api/admin/campaigns/${campaign.id}/export/catalogue.xlsx`, headers: { cookie: s.anna.header() } })
  assert.equal(sheet.statusCode, 200)
  assert.equal(sheet.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.match(sheet.headers['content-disposition'] as string, /katalog-2026-27\.xlsx/)
  assert.equal(sheet.rawPayload.subarray(0, 2).toString('latin1'), 'PK', 'a zip, as every xlsx is')
  assert.equal((await s.app.inject({ method: 'GET', url: `/api/admin/campaigns/${campaign.id}/export/catalogue.xlsx`, headers: { cookie: s.bernd.header() } })).statusCode, 403)
  assert.equal((await s.app.inject({ method: 'GET', url: `/api/admin/campaigns/00000000-0000-4000-8000-000000000000/export/catalogue.xlsx`, headers: { cookie: s.anna.header() } })).statusCode, 404)
})

export type { Harness }
