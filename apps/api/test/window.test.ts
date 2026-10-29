// The choice window on a real database: the organizer opens it and the
// pre-assignments and invitations follow; a student sees their fixed
// items and the groups offered, ranks within the cap and the rules, and is
// complete when every group has its wishes; an organizer enters on behalf
// and exempts, both audited; the clock enters the grace week and closes,
// with the notices and the frozen roster; a late list is marked so.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readAudit } from '../lib/audit.ts'
import type { Campaign } from '../lib/campaigns.ts'
import type { ChoiceView } from '../lib/choices.ts'
import { createDatabase } from '../lib/db.ts'
import type { Item } from '../lib/items.ts'
import type { BatchDetail } from '../lib/roster.ts'
import { tick } from '../lib/scheduler.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { DB, get, harness, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const DAYS = ['2027-06-21', '2027-06-22']
const CONTEXT = { baseUrl: 'https://wahl.example.org' }

interface Ready extends Harness {
  anna: CookieJar
  bernd: CookieJar
  sara: CookieJar
  tim: CookieJar
  campaign: Campaign
  items: Record<'klettern' | 'tanz' | 'schwimmen' | 'darts' | 'wien', string>
  saraPerson: string
  timPerson: string
}

type View = ChoiceView & { campaign: Campaign }

/** A school with a roster (Sara and Tim in 5A, Carla their class teacher by the CSV), a published catalogue of five items and the window's dates. */
async function school(t: Parameters<typeof harness>[0]): Promise<Ready> {
  const h = await harness(t, ADMIN)
  const anna0 = await signIn(h, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind;class_teacher_email',
    `${SARA.email};Sara;Schülerin;5A;9;student;${CARLA.email}`, `${TIM.email};Tim;Schüler;5A;9;student;${CARLA.email}`,
    `${ANNA.email};Anna;Lehrerin;;;teacher;`, `${BERND.email};Bernd;Lehrer;;;teacher;`, `${CARLA.email};Carla;Kollegin;;;teacher;`,
  ].join('\n')
  const batch = await send<BatchDetail>(h, anna0, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(h, anna0, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  const person = (name: string) => committed.body.diff.added.find((e) => e.displayName === name)?.personId ?? ''
  const anna = await signIn(h, ANNA)
  const bernd = await signIn(h, BERND)
  const created = await send<Campaign>(h, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS })
  const id = created.body.id
  await send(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'catalogue' })
  const session = (day: string, from: string, to: string, minutes: number) => ({ startsAt: `${day}T${from}:00+02:00`, endsAt: `${day}T${to}:00+02:00`, credits: [{ date: day, minutes }] })
  const propose = async (body: Record<string, unknown>) => {
    const item = await send<Item>(h, bernd, 'POST', `/api/campaigns/${id}/items`, { teachers: [person(BERND.name)], ...body })
    assert.equal(item.status, 201, JSON.stringify(item.body))
    await send(h, bernd, 'POST', `/api/items/${item.body.id}/propose`)
    assert.equal((await send(h, anna, 'POST', `/api/admin/items/${item.body.id}/approve`)).status, 200)
    return item.body.id
  }
  const items = {
    klettern: await propose({ title: 'Klettern', places: 12, sessions: [session('2027-06-21', '08:30', '12:15', 210)] }),
    tanz: await propose({ title: 'Tanz', places: 10, sessions: [session('2027-06-21', '08:30', '12:15', 210)] }),
    schwimmen: await propose({ title: 'Schwimmen', places: 20, sessions: [session('2027-06-21', '11:25', '13:10', 90)] }),
    darts: await propose({ title: 'Darts', places: 20, sessions: [session('2027-06-22', '08:30', '12:15', 210)] }),
    wien: await propose({ title: 'Wien', places: 2, fixedClasses: ['5A'], cancellableBelowMin: false, sessions: [session('2027-06-22', '08:00', '18:00', 420)] }),
  }
  const window = { name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS, opensAt: '2027-03-01T08:00:00+01:00', closesAt: '2027-03-08T20:00:00+01:00', lateUntil: '2027-03-12T20:00:00+01:00', reminderDays: 1 }
  assert.equal((await send(h, anna, 'PATCH', `/api/admin/campaigns/${id}`, window)).status, 200)
  const published = await send<Campaign>(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })
  assert.equal(published.status, 200)
  return { ...h, anna, bernd, sara: await signIn(h, SARA), tim: await signIn(h, TIM), campaign: published.body, items, saraPerson: person(SARA.name), timPerson: person(TIM.name) }
}

test('opening the window places the fixed classes and invites the students; a student ranks within the groups offered, the cap and the rules', DB, async (t) => {
  const s = await school(t)
  const id = s.campaign.id
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())

  // Published: the groups show, nothing is taken yet, nobody is placed.
  const before = await get<View>(s, s.sara, `/api/campaigns/${id}/my-choice`)
  assert.equal(before.status, 200, JSON.stringify(before.body))
  assert.equal(before.body.acceptsChoices, false)
  assert.deepEqual(before.body.fixed, [])
  assert.deepEqual(before.body.groups.map((g) => g.items.map((i) => i.title)), [['Klettern', 'Tanz'], ['Schwimmen'], ['Darts']], 'the trip is fixed for 5A and never offered to its students')
  assert.equal((await send(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: {} })).status, 409)
  assert.equal((await get(s, s.bernd, `/api/campaigns/${id}/my-choice`)).status, 403, 'a teacher has no choice to make')
  assert.equal((await get(s, s.anna, `/api/campaigns/${id}/my-choice`)).status, 403)

  const opened = await send<Campaign>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })
  assert.equal(opened.status, 200, JSON.stringify(opened.body))
  const placed = await owner.query<{ n: string }>('select count(*)::text as n from pre_assignment where campaign_id = $1', [id])
  assert.equal(placed.rows[0]?.n, '2', 'Sara and Tim are placed into the trip')
  const invited = await owner.query<{ kind: string, to_address: string, state: string }>('select kind, to_address, state from outbox_mail where campaign_id = $1 order by to_address', [id])
  assert.deepEqual(invited.rows, [{ kind: 'choice_invitation', to_address: SARA.email, state: 'queued' }, { kind: 'choice_invitation', to_address: TIM.email, state: 'queued' }])

  const view = await get<View>(s, s.sara, `/api/campaigns/${id}/my-choice`)
  assert.equal(view.body.acceptsChoices, true)
  assert.deepEqual(view.body.fixed.map((i) => i.title), ['Wien'])
  assert.deepEqual(view.body.groups.map((g) => [g.items.map((i) => i.title), g.required]), [[['Klettern', 'Tanz'], 2], [['Schwimmen'], 1]], 'Tuesday is taken by the trip')
  assert.equal(view.body.complete, false)
  const [monday, swim] = view.body.groups.map((g) => g.key) as [string, string]

  const unknown = await send<{ error: string, problems: { code: string }[] }>(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { [monday]: [s.items.darts] } })
  assert.equal(unknown.status, 422)
  assert.deepEqual(unknown.body.problems.map((p) => p.code), ['unknown_item'])
  assert.equal((await send<{ problems: { code: string }[] }>(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { [monday]: [s.items.klettern, s.items.klettern] } })).body.problems[0]?.code, 'item_twice')
  assert.equal((await send(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { nope: [s.items.klettern] } })).status, 422)
  const partial = await send<View>(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { [monday]: [s.items.tanz] } })
  assert.equal(partial.status, 200, JSON.stringify(partial.body))
  assert.equal(partial.body.complete, false, 'two wishes are asked where two items are offered, and the swim group has none')
  assert.equal(partial.body.window, 'first')
  const full = await send<View>(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { [monday]: [s.items.tanz, s.items.klettern], [swim]: [s.items.schwimmen] } })
  assert.equal(full.body.complete, true)
  assert.equal(full.body.version, 2)
  assert.deepEqual(full.body.ranking, { [monday]: [s.items.tanz, s.items.klettern], [swim]: [s.items.schwimmen] })
  const revisions = await owner.query<{ n: string }>('select count(*)::text as n from choice_revision where campaign_id = $1 and person_id = $2', [id, s.saraPerson])
  assert.equal(revisions.rows[0]?.n, '2')

  // The organizer's list: Sara complete, Tim without a list, both invited.
  const missing = await get<{ students: { displayName: string, state: string, mails: { kind: string, state: string }[] }[] }>(s, s.anna, `/api/admin/campaigns/${id}/missing`)
  assert.deepEqual(missing.body.students.map((st) => [st.displayName, st.state, st.mails.map((m) => m.kind)]), [[SARA.name, 'complete', ['choice_invitation']], [TIM.name, 'none', ['choice_invitation']]])
  assert.equal((await get(s, s.bernd, `/api/admin/campaigns/${id}/missing`)).status, 403)
  const status = await get<{ students: { displayName: string, choice: string | null }[] }>(s, s.anna, `/api/campaigns/${id}/classes/5A/status`)
  assert.deepEqual(status.body.students.map((st) => [st.displayName, st.choice]), [[SARA.name, 'complete'], [TIM.name, 'none']])
  const xlsx = await s.app.inject({ method: 'GET', url: `/api/admin/campaigns/${id}/export/missing.xlsx`, headers: { cookie: s.anna.header() } })
  assert.equal(xlsx.statusCode, 200)
  assert.equal(xlsx.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
})

test('an organizer enters a ranking on behalf and exempts a student from a class activity, both audited; the clock closes the window with its notices', DB, async (t) => {
  const s = await school(t)
  const id = s.campaign.id
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })

  const timView = await get<View>(s, s.anna, `/api/admin/campaigns/${id}/choices/${s.timPerson}`)
  assert.equal(timView.status, 200)
  assert.equal(timView.body.student.displayName, TIM.name)
  const [monday] = timView.body.groups.map((g) => g.key) as [string]
  assert.equal((await send(s, s.anna, 'PUT', `/api/admin/campaigns/${id}/choices/${s.timPerson}`, { ranking: { [monday]: [s.items.klettern] } })).status, 400, 'a reason is required')
  const onBehalf = await send<View>(s, s.anna, 'PUT', `/api/admin/campaigns/${id}/choices/${s.timPerson.toUpperCase()}`, { ranking: { [monday]: [s.items.klettern] }, reason: 'Tim war krank' })
  assert.equal(onBehalf.status, 200, JSON.stringify(onBehalf.body))
  assert.equal(onBehalf.body.complete, false)
  assert.equal((await get(s, s.anna, `/api/admin/campaigns/${id}/choices/${s.saraPerson.replace(/^./, '0')}`)).status, 404)
  assert.equal((await send(s, s.bernd, 'PUT', `/api/admin/campaigns/${id}/choices/${s.timPerson}`, { ranking: {}, reason: 'x' })).status, 403)

  // Exempted from the trip, Sara chooses for Tuesday as well.
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/preassignments/${s.saraPerson}/${s.items.darts}/exempt`, { reason: 'x' })).status, 404, 'not placed into Darts')
  const exempted = await send<View>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/preassignments/${s.saraPerson}/${s.items.wien}/exempt`, { reason: 'Fährt mit den Eltern' })
  assert.equal(exempted.status, 200, JSON.stringify(exempted.body))
  assert.deepEqual(exempted.body.fixed, [])
  assert.deepEqual(exempted.body.groups.map((g) => g.items.map((i) => i.title)), [['Klettern', 'Tanz'], ['Schwimmen'], ['Darts']])
  assert.equal((await send<{ error: string }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/preassignments/${s.saraPerson}/${s.items.wien}/exempt`, { reason: 'again' })).body.error, 'already_exempted')
  const events = await readAudit(owner, id)
  assert.deepEqual(events.filter((e) => e.action === 'choice.entered-on-behalf' || e.action === 'preassignment.exempted').map((e) => [e.action, e.metadata.reason]),
    [['choice.entered-on-behalf', 'Tim war krank'], ['preassignment.exempted', 'Fährt mit den Eltern']])

  // The clock: a reminder the day before the close, once; then the grace week, then the close.
  const dayBefore = new Date('2027-03-07T21:00:00+01:00')
  assert.deepEqual(await tick(s.db, CONTEXT, dayBefore), { transitions: 0, reminders: 2 }, 'Sara (nothing) and Tim (incomplete) are reminded')
  assert.deepEqual(await tick(s.db, CONTEXT, dayBefore), { transitions: 0, reminders: 0 }, 'not twice')
  const afterClose = new Date('2027-03-08T20:00:01+01:00')
  assert.deepEqual(await tick(s.db, CONTEXT, afterClose), { transitions: 1, reminders: 0 })
  const grace = await get<{ campaign: Campaign }>(s, s.anna, `/api/campaigns/${id}`)
  assert.equal(grace.body.campaign.state, 'grace')
  const mails = async () => (await owner.query<{ kind: string, to_address: string }>('select kind, to_address from outbox_mail where campaign_id = $1 order by created_at, kind, to_address', [id])).rows.map((r) => `${r.kind}:${r.to_address}`)
  assert.deepEqual((await mails()).slice(4), [`class_missing:${CARLA.email}`, `grace_invitation:${SARA.email}`, `grace_invitation:${TIM.email}`], 'the class teacher named by the roster gets her list')

  // A list saved in the grace week is late; the audit records the clock as actor.
  const [saraMonday, saraSwim, saraDarts] = exempted.body.groups.map((g) => g.key) as [string, string, string]
  const late = await send<View>(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { [saraMonday]: [s.items.klettern, s.items.tanz], [saraSwim]: [s.items.schwimmen], [saraDarts]: [s.items.darts] } })
  assert.equal(late.status, 200, JSON.stringify(late.body))
  assert.equal(late.body.window, 'late')
  assert.equal(late.body.complete, true)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'grace' })).status, 400, 'the grace week is the clock\'s alone: no organizer asks for it')
  assert.deepEqual(await tick(s.db, CONTEXT, new Date('2027-03-12T20:00:01+01:00')), { transitions: 1, reminders: 0 })
  const closed = await get<{ campaign: Campaign }>(s, s.anna, `/api/campaigns/${id}`)
  assert.equal(closed.body.campaign.state, 'closed')
  assert.ok(closed.body.campaign.rosterBatchId, 'the roster is frozen')
  assert.deepEqual((await mails()).slice(7), [`class_missing:${CARLA.email}`, `missed_deadline:${TIM.email}`], 'Sara is complete now; Tim is told, and so is the class teacher')
  assert.equal((await send(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: {} })).status, 409)
  const transitions = (await readAudit(owner, id)).filter((e) => e.action === 'campaign.transitioned').map((e) => [e.metadata.to, e.actor.name, e.metadata.byClock])
  assert.deepEqual(transitions.slice(-3), [['open', ANNA.name, false], ['grace', 'Zeitsteuerung', true], ['closed', 'Zeitsteuerung', true]])
  const protocol = await get<{ mails: { kind: string, state: string, body?: string }[] }>(s, s.anna, `/api/admin/campaigns/${id}/mail`)
  assert.equal(protocol.body.mails.length, 9)
  assert.ok(protocol.body.mails.every((m) => m.body === undefined), 'the texts stay in the outbox')
})

test('the clock opens a published campaign at its time and closes one without a grace week straight away', DB, async (t) => {
  const s = await school(t)
  const id = s.campaign.id
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  await owner.query('update campaign set late_until = null where id = $1', [id])
  assert.deepEqual(await tick(s.db, CONTEXT, new Date('2027-02-28T12:00:00+01:00')), { transitions: 0, reminders: 0 })
  assert.deepEqual(await tick(s.db, CONTEXT, new Date('2027-03-01T08:00:00+01:00')), { transitions: 1, reminders: 0 })
  assert.equal((await get<{ campaign: Campaign }>(s, s.anna, `/api/campaigns/${id}`)).body.campaign.state, 'open')
  assert.deepEqual(await tick(s.db, CONTEXT, new Date('2027-03-09T08:00:00+01:00')), { transitions: 1, reminders: 0 })
  assert.equal((await get<{ campaign: Campaign }>(s, s.anna, `/api/campaigns/${id}`)).body.campaign.state, 'closed')
  // A campaign without reminders sends none.
  const kinds = await owner.query<{ kind: string }>('select distinct kind from outbox_mail where campaign_id = $1 order by kind', [id])
  assert.deepEqual(kinds.rows.map((r) => r.kind), ['choice_invitation', 'class_missing', 'missed_deadline'])
})
