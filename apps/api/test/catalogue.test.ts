// A campaign and its catalogue, end to end on a real database: an organizer
// sets the campaign up and opens it for proposals, a teacher proposes an
// activity within the rules, the organizer returns, approves and publishes,
// the approved items are numbered, and every reader sees what their role
// allows and nothing else.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { DEFAULT_PERIODS } from '@school-allocation/school-core'
import { verifyAuditChain } from '../lib/audit-chain.ts'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { createDatabase } from '../lib/db.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item } from '../lib/models/items.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { DB, get, harness, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const DAYS = ['2027-06-21', '2027-06-22', '2027-06-23']
// Monday 09:00–13:00 and Tuesday 08:00 – Wednesday 13:00, Vienna time.
const MONDAY = { startsAt: '2027-06-21T09:00:00+02:00', endsAt: '2027-06-21T13:00:00+02:00' }
const VIENNA = { startsAt: '2027-06-22T08:00:00+02:00', endsAt: '2027-06-23T13:00:00+02:00', location: 'Wien' }

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
    `${SARA.email};Sara;Pfnäxthuber;5A;9;student`, `${TIM.email};Tim;Gnöxwieser;5A;9;student`,
    `${ANNA.email};Anna;Zwexmhofer;;;teacher`, `${BERND.email};Bernd;Pfnöxlhofer;;;teacher`, `${CARLA.email};Carla;Knoxbrunner;;;teacher`,
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
  const created = await send<Campaign>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS, frames: { '2027-06-23': { from: 2, to: 6 } }, activityMinimums: { '2027-06-22': 240 } })
  assert.equal(created.status, 201)
  const id = created.body.id
  assert.deepEqual(created.body.days, [{ date: '2027-06-21', frame: null, minimumMinutes: null }, { date: '2027-06-22', frame: null, minimumMinutes: 240 }, { date: '2027-06-23', frame: { from: 2, to: 6 }, minimumMinutes: null }], 'a day has its frame and its minimum length, or none')
  assert.equal((await send<{ error: string }>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'x', schoolYear: '2026/27', projectDays: DAYS, frames: { '2027-06-24': { from: 2, to: 6 } } })).body.error, 'frame_invalid', 'a frame on a day the registration does not have')
  assert.equal((await send<{ error: string }>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'x', schoolYear: '2026/27', projectDays: DAYS, activityMinimums: { '2027-06-24': 100 } })).body.error, 'minimum_invalid', 'a minimum on a day the registration does not have')
  assert.equal((await send(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'x', schoolYear: '2026/27', projectDays: DAYS, activityMinimums: { '2027-06-22': 0 } })).status, 400, 'the shape holds it to 1 … 1440')
  assert.equal((await send(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'x', schoolYear: '2026/27', projectDays: ['2027-06-21', '2027-06-21'] })).status, 422)
  // A day the calendar does not have passes the shape and is refused here, not by the database.
  assert.equal((await send<{ error: string }>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'x', schoolYear: '2026/27', projectDays: ['2027-02-31'] })).body.error, 'invalid_date')
  assert.equal((await send(s, s.bernd, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'x', schoolYear: '2026/27', projectDays: DAYS })).status, 403)

  // A draft is the organizers' alone.
  assert.equal((await get(s, s.bernd, `/api/campaigns/${id}`)).status, 404)
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}`)).status, 404)
  assert.deepEqual((await get<{ campaigns: Campaign[] }>(s, s.bernd, '/api/campaigns')).body.campaigns, [])
  assert.equal((await get<{ campaigns: Campaign[] }>(s, s.anna, '/api/campaigns')).body.campaigns.length, 1)

  // The id in whatever case the URL carries it: the audit scope stays the stored one.
  const shortened = await send<Campaign>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id.toUpperCase()}`, { name: 'Projektwoche Juni 2027', schoolYear: '2026/27', projectDays: DAYS.slice(0, 2) })
  assert.equal(shortened.status, 200)
  assert.deepEqual(shortened.body.days.map((d) => d.frame), [null, null], 'the frame went with its day')
  assert.deepEqual(shortened.body.days.map((d) => d.minimumMinutes), [null, 240], 'a change without minimums keeps those of the days that stay')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })).status, 409, 'published does not follow draft')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'allocating' })).status, 400, 'not a transition this release offers')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'catalogue' })).status, 200)

  // Taking proposals: teachers see it, students do not.
  const bernd = await get<{ campaign: Campaign, counts: unknown, may: { propose: boolean, organize: boolean } }>(s, s.bernd, `/api/campaigns/${id}`)
  assert.equal(bernd.status, 200)
  assert.deepEqual(bernd.body.may, { propose: true, organize: false, seeDemand: true, classTeacherOf: [] })
  assert.equal(bernd.body.counts, null)
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}`)).status, 404)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })).status, 200)
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: 'x', schoolYear: '2026/27', projectDays: DAYS })).status, 409, 'published, the days are final')
  // The frames go with the window's settings: still set while published, fixed from the opening.
  const published = await get<{ campaign: Campaign }>(s, s.anna, `/api/campaigns/${id}`)
  const framed = await send<Campaign>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: published.body.campaign.name, schoolYear: '2026/27', projectDays: published.body.campaign.projectDays, frames: { '2027-06-21': { from: 1, to: 4 } } })
  assert.equal(framed.status, 200, JSON.stringify(framed.body))
  assert.deepEqual(framed.body.days[0]?.frame, { from: 1, to: 4 })
  // So does the minimum length of an activity: a rule of the catalogue, set until the window opens.
  const minimums = await send<Campaign>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: published.body.campaign.name, schoolYear: '2026/27', projectDays: published.body.campaign.projectDays, activityMinimums: { '2027-06-21': 200 } })
  assert.equal(minimums.status, 200, JSON.stringify(minimums.body))
  assert.deepEqual(minimums.body.days.map((d) => d.minimumMinutes), [200, null], 'replaced as sent: Tuesday\'s is gone')
  await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: published.body.campaign.name, schoolYear: '2026/27', projectDays: published.body.campaign.projectDays, opensAt: '2027-03-01T08:00:00+01:00', closesAt: '2027-03-08T20:00:00+01:00' })
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })).status, 200)
  assert.equal((await send<{ error: string }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: published.body.campaign.name, schoolYear: '2026/27', projectDays: published.body.campaign.projectDays, frames: {} })).body.error, 'campaign_state', 'open, the frames are what the students chose by')
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: published.body.campaign.name, schoolYear: '2026/27', projectDays: published.body.campaign.projectDays, frames: { '2027-06-21': { from: 1, to: 4 } } })).status, 200, 'the same frames again change nothing')
  assert.equal((await send<{ error: string }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: published.body.campaign.name, schoolYear: '2026/27', projectDays: published.body.campaign.projectDays, activityMinimums: {} })).body.error, 'campaign_state', 'open, the minimum lengths are fixed too')
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: published.body.campaign.name, schoolYear: '2026/27', projectDays: published.body.campaign.projectDays, activityMinimums: { '2027-06-21': 200 } })).status, 200, 'the same minimums again are no change')
  const sara = await get<{ campaign: Campaign, may: { propose: boolean } }>(s, s.sara, `/api/campaigns/${id}`)
  assert.equal(sara.status, 200)
  assert.equal(sara.body.may.propose, false)
  assert.equal((await get(s, undefined, `/api/campaigns/${id}`)).status, 401)

  const db = createDatabase(s.ownerUrl, () => {})
  t.after(() => db.close())
  const events = await readAudit(db, id)
  assert.deepEqual(events.map((e) => e.action), ['campaign.changed', 'campaign.transitioned', 'campaign.transitioned', 'campaign.changed', 'campaign.changed', 'campaign.changed', 'campaign.transitioned', 'campaign.changed', 'campaign.changed'])
  assert.deepEqual(events.filter((e) => e.action === 'campaign.changed').map((e) => [e.metadata.frames, e.metadata.minimums]), [[false, false], [true, false], [false, true], [false, false], [false, false], [false, false]], 'a frame goes with its day as a change of the set-up, one is set, the minimums replaced, the window alone, the same frames again, the same minimums again')
  assert.equal(verifyAuditChain(events).valid, true)
})

test('a teacher proposes within the rules, the organizer returns, approves and publishes, and the catalogue is numbered in print order', DB, async (t) => {
  const s = await school(t)
  const campaign = await campaignTakingProposals(s)
  const url = `/api/campaigns/${campaign.id}/items`

  // Pickers for the form.
  const classes = await get<{ classes: { className: string, grade: number }[] }>(s, s.bernd, `/api/campaigns/${campaign.id}/classes`)
  assert.deepEqual(classes.body.classes, [{ className: '5A', grade: 9 }])
  const teachers = await get<{ teachers: { personId: string, displayName: string }[] }>(s, s.bernd, `/api/campaigns/${campaign.id}/teachers?q=kn`)
  assert.deepEqual(teachers.body.teachers.map((x) => x.displayName), [CARLA.name])
  assert.equal((await get(s, s.sara, `/api/campaigns/${campaign.id}/classes`)).status, 404, 'students do not see a campaign taking proposals')

  // The rules, refused with their codes.
  const invalid = await send<{ error: string, problems: { code: string, session?: number }[], unknownTeachers: string[] }>(s, s.bernd, 'POST', url, {
    title: 'Falsch', places: 5, minParticipants: 10, fixedClasses: ['7C'], cancellableBelowMin: true, teachers: ['00000000-0000-4000-8000-000000000000'],
    sessions: [{ startsAt: '2027-06-28T09:00:00+02:00', endsAt: '2027-06-28T08:00:00+02:00' }],
  })
  assert.equal(invalid.status, 422)
  assert.deepEqual(invalid.body.problems.map((p) => p.code).sort(), ['fixed_class_unknown', 'fixed_item_cancellable', 'min_above_places', 'session_ends_before_start', 'session_outside_project_days'])
  assert.deepEqual(invalid.body.unknownTeachers, ['00000000-0000-4000-8000-000000000000'])
  assert.equal((await send(s, s.bernd, 'POST', url, { title: 'x', places: 5, teachers: [], sessions: [MONDAY], extra: 1 })).status, 400)
  assert.equal((await send(s, s.sara, 'POST', url, { title: 'x', places: 5, teachers: [], sessions: [MONDAY] })).status, 404, 'a student cannot even see it')

  // Bernd's draft: he is its teacher without naming himself. Carla's trip for 5A with spare seats.
  const draft = await send<Item>(s, s.bernd, 'POST', url, { title: 'Klettern', description: 'Kletterhalle Linz', places: 12, minParticipants: 6, feeCents: 1500, feeNote: 'Eintritt', teachers: [], sessions: [MONDAY] })
  assert.equal(draft.status, 201, JSON.stringify(draft.body))
  assert.equal(draft.body.state, 'draft')
  assert.deepEqual(draft.body.teachers.map((x) => x.displayName), [BERND.name])
  assert.equal(draft.body.sessions[0]?.startsAt, '2027-06-21T07:00:00Z')
  const trip = await send<Item>(s, s.carla, 'POST', url, { title: 'Wien', places: 8, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.berndPerson.toUpperCase()], sessions: [VIENNA] })
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

test('an organizer\'s edit of their own item is recorded once it needs organizer rights, and always when the organizer is no teacher', DB, async (t) => {
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
  // Sara, made an organizer, is no teacher: even her own draft is edited by that right, and recorded.
  const saraId = (await get<{ id: string }>(s, s.sara, '/api/auth/me')).body.id
  assert.equal((await send(s, s.anna, 'POST', '/api/admin/roles', { userId: saraId, role: 'campaign_organizer', reason: 'Test' })).status, 201)
  const onBehalf = await send<Item>(s, s.sara, 'POST', `/api/campaigns/${campaign.id}/items`, { title: 'Für Bernd', places: 10, teachers: [s.berndPerson], sessions: [MONDAY] })
  assert.equal(onBehalf.status, 201)
  assert.equal((await send(s, s.sara, 'PATCH', `/api/items/${onBehalf.body.id}`, { title: 'Für Bernd, geändert', places: 10, teachers: [s.berndPerson], sessions: [MONDAY] })).status, 200)
  const db = createDatabase(s.ownerUrl, () => {})
  t.after(() => db.close())
  const events = await readAudit(db, campaign.id)
  assert.deepEqual(events.map((e) => e.action), ['campaign.transitioned', 'item.approved', 'item.changed', 'item.created', 'item.changed'])
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

test('what a session credits is its clock time inside the day\'s window, never sent; a changed frame or grid derives it again until the registration opens; the migration brings stored sessions to the rule', DB, async (t) => {
  const s = await school(t)
  const campaign = await campaignTakingProposals(s)
  const url = `/api/campaigns/${campaign.id}/items`
  const creditsOf = async (id: string) => ((await get<{ items: Item[] }>(s, s.anna, url)).body.items.find((i) => i.id === id) as Item).sessions.map((x) => x.credits)
  const make = async (title: string, session: { startsAt: string, endsAt: string }): Promise<Item> => {
    const made = await send<Item>(s, s.bernd, 'POST', url, { title, places: 12, teachers: [], sessions: [session] })
    assert.equal(made.status, 201, JSON.stringify(made.body))
    return made.body
  }

  // A credit a client sends is no part of the body any more.
  assert.equal((await send(s, s.bernd, 'POST', url, { title: 'x', places: 5, teachers: [], sessions: [{ ...MONDAY, credits: [{ date: '2027-06-21', minutes: 999 }] }] })).status, 400)

  // Without a frame the window is the grid's day, 07:35 to 16:50: 09:00–13:00 is 240 minutes, breaks included; the 2nd and 3rd period are 105.
  const climbing = await make('Klettern', MONDAY)
  assert.deepEqual(climbing.sessions.map((x) => x.credits), [[{ date: '2027-06-21', minutes: 240 }]])
  const chess = await make('Schach', { startsAt: '2027-06-21T08:30:00+02:00', endsAt: '2027-06-21T10:15:00+02:00' })
  assert.deepEqual(chess.sessions.map((x) => x.credits), [[{ date: '2027-06-21', minutes: 105 }]])
  // Over two days, each date in its own window, the night not: Tuesday from 08:00 to the grid's end, Wednesday from its start until 13:00.
  const vienna = await make('Wien', VIENNA)
  assert.deepEqual(vienna.sessions.map((x) => x.credits), [[{ date: '2027-06-22', minutes: 530 }, { date: '2027-06-23', minutes: 325 }]])
  // An evening lies outside every window: it credits nothing, an extra.
  const theatre = await make('Theater', { startsAt: '2027-06-21T19:00:00+02:00', endsAt: '2027-06-21T21:00:00+02:00' })
  assert.deepEqual(theatre.sessions.map((x) => x.credits), [[{ date: '2027-06-21', minutes: 0 }]])

  // Monday's frame set to the 2nd to the 5th period, 08:30 to 12:15: Monday's sessions follow, the other days not.
  const framed = await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${campaign.id}`, { name: campaign.name, schoolYear: campaign.schoolYear, projectDays: campaign.projectDays, frames: { '2027-06-21': { from: 2, to: 5 } } })
  assert.equal(framed.status, 200, JSON.stringify(framed.body))
  assert.deepEqual(await creditsOf(climbing.id), [[{ date: '2027-06-21', minutes: 195 }]])
  assert.deepEqual(await creditsOf(chess.id), [[{ date: '2027-06-21', minutes: 105 }]])
  assert.deepEqual(await creditsOf(vienna.id), [[{ date: '2027-06-22', minutes: 530 }, { date: '2027-06-23', minutes: 325 }]])
  const expected = new Map([[climbing.id, await creditsOf(climbing.id)], [chess.id, await creditsOf(chess.id)], [vienna.id, await creditsOf(vienna.id)], [theatre.id, await creditsOf(theatre.id)]])

  // The migration's statement, on sessions as an earlier rule left them: the same numbers as the server's arithmetic, the frame included.
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  await owner.query('update item_session set credits = \'[{"date": "2027-06-21", "minutes": 1}]\'')
  assert.deepEqual(await creditsOf(climbing.id), [[{ date: '2027-06-21', minutes: 1 }]])
  await owner.query(await readFile(new URL('../migrations/0013_credits_in_window.sql', import.meta.url), 'utf8'))
  for (const [id, credits] of expected) assert.deepEqual(await creditsOf(id), credits)

  // Another grid, six periods of 45 minutes from 08:00 with five minutes between: the registration is not open, so its sessions follow.
  const short = [0, 1, 2, 3, 4, 5].map((n) => {
    const at = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    return { period: n + 1, starts: at(480 + n * 50), ends: at(480 + n * 50 + 45) }
  })
  assert.equal((await send(s, s.anna, 'PUT', '/api/admin/settings/periods', { periods: short })).status, 200)
  // Monday's frame is now 08:50 to 12:05: 09:00–13:00 credits 185.
  assert.deepEqual(await creditsOf(climbing.id), [[{ date: '2027-06-21', minutes: 185 }]])
  assert.deepEqual(await creditsOf(theatre.id), [[{ date: '2027-06-21', minutes: 0 }]])

  // Opened, the registration keeps what its choices compute with, whatever the grid becomes; an edit of the words keeps it too.
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${climbing.id}/propose`)).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${climbing.id}/approve`)).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${campaign.id}/transition`, { to: 'published' })).status, 200)
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${campaign.id}`, { name: campaign.name, schoolYear: '2026/27', projectDays: DAYS, opensAt: '2027-03-01T08:00:00+01:00', closesAt: '2027-03-08T20:00:00+01:00' })).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${campaign.id}/transition`, { to: 'open' })).status, 200)
  assert.equal((await send(s, s.anna, 'PUT', '/api/admin/settings/periods', { periods: DEFAULT_PERIODS })).status, 200)
  assert.deepEqual(await creditsOf(climbing.id), [[{ date: '2027-06-21', minutes: 185 }]])
  const renamed = await send<Item>(s, s.anna, 'PATCH', `/api/items/${climbing.id}`, { title: 'Klettern in der Halle', places: 12, teachers: [s.berndPerson], sessions: [MONDAY] })
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body))
  assert.deepEqual(renamed.body.sessions.map((x) => x.credits), [[{ date: '2027-06-21', minutes: 185 }]])

  const changes = (await readAudit(owner, SCHOOL_SCOPE)).filter((e) => e.action === 'settings.periods-changed').map((e) => e.metadata.sessions)
  assert.deepEqual(changes, [4, 0], 'four sessions followed the first change, none the second')
})

test('an activity reaches the minimum length of each day it takes up part of the window on, or is refused with the day; a raised minimum checks nothing already accepted', DB, async (t) => {
  const s = await school(t)
  const campaign = await campaignTakingProposals(s)
  const id = campaign.id
  const url = `/api/campaigns/${id}/items`
  // Without a frame the window is the grid's day, 07:35 to 16:50: Monday 09:00–13:00 credits 240 minutes. Monday asks for 270, Wednesday for 300.
  const set = (minimums: Record<string, number>) => send<Campaign>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: campaign.name, schoolYear: campaign.schoolYear, projectDays: campaign.projectDays, activityMinimums: minimums })
  assert.equal((await set({ '2027-06-21': 270, '2027-06-23': 300 })).status, 200)
  type Invalid = { error: string, problems: { code: string, session?: number, date?: string }[] }
  const short = await send<Invalid>(s, s.bernd, 'POST', url, { title: 'Klettern', places: 12, teachers: [], sessions: [MONDAY] })
  assert.equal(short.status, 422, JSON.stringify(short.body))
  assert.deepEqual(short.body.problems, [{ code: 'below_minimum_length', date: '2027-06-21' }])
  // The check says so before any save, with what is missing and the window it is counted in; half an hour earlier and it is met.
  type Check = { length: { date: string, minimum: number, credited: number, met: boolean, missing: number, window: { starts: string, ends: string } | null }[] }
  const window = { starts: '07:35', ends: '16:50' }
  const checked = await send<Check>(s, s.bernd, 'POST', `${url}/check`, { item: { title: 'Klettern', places: 12, teachers: [], sessions: [MONDAY] } })
  assert.deepEqual(checked.body.length, [{ date: '2027-06-21', minimum: 270, credited: 240, met: false, missing: 30, window }])
  const longer = { startsAt: '2027-06-21T08:30:00+02:00', endsAt: '2027-06-21T13:00:00+02:00' }
  assert.deepEqual((await send<Check>(s, s.bernd, 'POST', `${url}/check`, { item: { title: 'Klettern', places: 12, teachers: [], sessions: [longer] } })).body.length, [{ date: '2027-06-21', minimum: 270, credited: 270, met: true, missing: 0, window }])
  // Two sessions of the day count together: the morning and an hour after lunch.
  const afternoon = { startsAt: '2027-06-21T13:15:00+02:00', endsAt: '2027-06-21T14:05:00+02:00' }
  const split = await send<Item>(s, s.bernd, 'POST', url, { title: 'Klettern', places: 12, teachers: [], sessions: [MONDAY, afternoon] })
  assert.equal(split.status, 201, JSON.stringify(split.body))
  // The trip returns on Wednesday at one: 325 minutes of Wednesday's window meet its 300. Back at ten it has 145, and no night away
  // makes up for the rest of the day. One of its teachers alone is exempt; a class activity is not.
  assert.equal((await send(s, s.carla, 'POST', url, { title: 'Wien', places: 8, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [], sessions: [VIENNA] })).status, 201)
  const earlyBack = await send<Invalid>(s, s.carla, 'POST', url, { title: 'Wien früh', places: 8, minParticipants: 0, teachers: [], sessions: [{ ...VIENNA, endsAt: '2027-06-23T10:00:00+02:00' }] })
  assert.deepEqual([earlyBack.status, earlyBack.body.problems], [422, [{ code: 'below_minimum_length', date: '2027-06-23' }]])
  assert.equal((await send(s, s.carla, 'POST', url, { title: 'Aufsicht', places: 0, minParticipants: 0, cancellableBelowMin: false, teachers: [], sessions: [MONDAY] })).status, 201)
  const classShort = await send<Invalid>(s, s.carla, 'POST', url, { title: 'Klassenstunde', places: 0, fixedClasses: ['5A'], minParticipants: 0, cancellableBelowMin: false, teachers: [], sessions: [MONDAY] })
  assert.deepEqual([classShort.status, classShort.body.problems], [422, [{ code: 'below_minimum_length', date: '2027-06-21' }]])
  // An edit is held to it like a save: the afternoon taken off again is refused; the words alone pass.
  const edit = (body: Record<string, unknown>) => send<Invalid>(s, s.bernd, 'PATCH', `/api/items/${split.body.id}`, { title: 'Klettern', places: 12, teachers: [s.berndPerson], ...body })
  assert.deepEqual((await edit({ sessions: [MONDAY] })).body.problems, [{ code: 'below_minimum_length', date: '2027-06-21' }])
  assert.equal((await edit({ description: 'Kletterhalle Linz', sessions: [MONDAY, afternoon] })).status, 200)
  // The minimum raised to 330 checks nothing accepted: the split activity stands, its next change of times does not.
  assert.equal((await set({ '2027-06-21': 330 })).status, 200)
  assert.equal((await edit({ description: 'Kletterhalle Linz, Halle 2', sessions: [MONDAY, afternoon] })).status, 200, 'the words again, with the times unchanged: not held to the new minimum')
  assert.deepEqual((await edit({ sessions: [longer, afternoon] })).body.problems, [{ code: 'below_minimum_length', date: '2027-06-21' }], '320 of 330')
  assert.deepEqual((await send<Check>(s, s.bernd, 'POST', `${url}/check`, { itemId: split.body.id })).body.length, [{ date: '2027-06-21', minimum: 330, credited: 290, met: false, missing: 40, window }], 'the review sees the shortfall')
  // A supervision (exempt) that gets places becomes an activity for students and is held to the minimum then, its times unchanged.
  const duty = await send<Item>(s, s.carla, 'POST', url, { title: 'Aufsicht', places: 0, minParticipants: 0, cancellableBelowMin: false, teachers: [], sessions: [MONDAY] })
  const opened = await send<Invalid>(s, s.carla, 'PATCH', `/api/items/${duty.body.id}`, { title: 'Aufsicht', places: 5, minParticipants: 0, cancellableBelowMin: false, teachers: [s.carlaPerson], sessions: [MONDAY] })
  assert.deepEqual([opened.status, opened.body.problems], [422, [{ code: 'below_minimum_length', date: '2027-06-21' }]])
  // The check of an edit keeps the stored credits of unchanged times, as a save does (the registrations open keep theirs through a change of the grid):
  // the morning's stored credit set to what an earlier grid gave, the preview reads it, not the window's 240.
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  await owner.query('update item_session set credits = $2 where item_id = $1 and starts_at = $3', [split.body.id, JSON.stringify([{ date: '2027-06-21', minutes: 280 }]), MONDAY.startsAt])
  const preview = await send<Check>(s, s.bernd, 'POST', `${url}/check`, { itemId: split.body.id, item: { title: 'Klettern', description: 'x', places: 12, teachers: [s.berndPerson], sessions: [MONDAY, afternoon] } })
  assert.deepEqual(preview.body.length, [{ date: '2027-06-21', minimum: 330, credited: 330, met: true, missing: 0, window }], 'the stored 280 and the afternoon\'s 50')
})
