// Direct placement and leaving a class activity, end to end on a real
// database: a teacher places single students into an activity; a direct
// placement beats a class placement, instead of it or beside it; the later
// claim moves a student; a class activity's teachers see who is taken,
// reclaim, and keep its list of who does not take part; the demand, the
// choice and the run read what holds.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AllocationRun, ChoiceView, MyResultResponse, PlacementsResponse, RunReviewResponse } from '@school-allocation/api-contracts'
import { readAudit } from '../lib/audit.ts'
import { createDatabase } from '../lib/db.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item } from '../lib/models/items.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { startFakeSolver } from './helpers/fake-solver.ts'
import { DB, get, harness, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const DAYS = ['2027-06-21', '2027-06-22', '2027-06-23']
const [MONDAY, TUESDAY, WEDNESDAY] = DAYS as [string, string, string]
const session = (day: string, from: string, to: string, endDay = day) => ({ startsAt: `${day}T${from}:00+02:00`, endsAt: `${endDay}T${to}:00+02:00` })

interface Ready extends Harness {
  anna: CookieJar
  bernd: CookieJar
  carla: CookieJar
  sara: CookieJar
  tim: CookieJar
  annaPerson: string
  berndPerson: string
  carlaPerson: string
  saraPerson: string
  timPerson: string
  miaPerson: string
  campaign: Campaign
  /** The trip to Vienna for 5A, from Tuesday into Wednesday (Bernd); the workshop (Carla), the lab (Anna) and the rehearsal (Bernd) inside its Tuesday; a course on Wednesday morning. */
  items: Record<'wien' | 'werkstatt' | 'labor' | 'probe' | 'mittwoch', string>
}

/** Sara and Tim in 5A (Carla their class teacher), Mia in 6A; a registration taking proposals with the five activities submitted. */
async function school(t: Parameters<typeof harness>[0], env: Record<string, string> = {}): Promise<Ready> {
  const h = await harness(t, { ...ADMIN, ...env })
  const anna0 = await signIn(h, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind;class_teacher_email',
    `${SARA.email};Sara;Pfnäxthuber;5A;9;student;${CARLA.email}`, `${TIM.email};Tim;Gnöxwieser;5A;9;student;${CARLA.email}`,
    'mia.unbekannt@schule.example.org;Mia;Unbekannt;6A;10;student;',
    `${ANNA.email};Anna;Zwexmhofer;;;teacher;`, `${BERND.email};Bernd;Pfnöxlhofer;;;teacher;`, `${CARLA.email};Carla;Knoxbrunner;;;teacher;`,
  ].join('\n')
  const batch = await send<BatchDetail>(h, anna0, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(h, anna0, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  const person = (name: string) => committed.body.diff.added.find((e) => e.displayName === name)?.personId ?? ''
  const anna = await signIn(h, ANNA)
  const bernd = await signIn(h, BERND)
  const carla = await signIn(h, CARLA)
  const created = await send<Campaign>(h, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const id = created.body.id
  const opened = await send<Campaign>(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'catalogue' })
  const propose = async (jar: CookieJar, body: Record<string, unknown>): Promise<string> => {
    const made = await send<Item>(h, jar, 'POST', `/api/campaigns/${id}/items`, { teachers: [], ...body })
    assert.equal(made.status, 201, JSON.stringify(made.body))
    assert.equal((await send(h, jar, 'POST', `/api/items/${made.body.id}/propose`)).status, 200)
    return made.body.id
  }
  const items = {
    wien: await propose(bernd, { title: 'Wien', places: 0, fixedClasses: ['5A'], cancellableBelowMin: false, sessions: [session(TUESDAY, '08:00', '13:00', WEDNESDAY)] }),
    // It wants four and may be cancelled below that: until someone is placed into it.
    werkstatt: await propose(carla, { title: 'Werkstatt', places: 5, minParticipants: 4, sessions: [session(TUESDAY, '08:30', '12:15')] }),
    labor: await propose(anna, { title: 'Labor', places: 3, sessions: [session(TUESDAY, '08:30', '10:15')] }),
    probe: await propose(bernd, { title: 'Probe', places: 0, sessions: [session(TUESDAY, '10:30', '11:20')] }),
    mittwoch: await propose(anna, { title: 'Mittwochskurs', places: 10, sessions: [session(WEDNESDAY, '08:30', '12:15')] }),
  }
  return {
    ...h, anna, bernd, carla, sara: await signIn(h, SARA), tim: await signIn(h, TIM),
    annaPerson: person(ANNA.name), berndPerson: person(BERND.name), carlaPerson: person(CARLA.name),
    saraPerson: person(SARA.name), timPerson: person(TIM.name), miaPerson: person('Mia Unbekannt'),
    campaign: opened.body, items,
  }
}

const names = (list: readonly { displayName: string }[]) => list.map((entry) => entry.displayName)
const others = (list: readonly { title: string, lead: string | null }[]) => list.map((other) => [other.title, other.lead])

test('a teacher places a student into their own activity; the placement beats the class activity it overlaps; the later claim moves the student; the class activity\'s teachers see who is taken and reclaim', DB, async (t) => {
  const s = await school(t)
  const id = s.campaign.id
  const place = (jar: CookieJar, item: string, personId: string, body: Record<string, unknown> = {}) => send<PlacementsResponse & { error?: string }>(s, jar, 'PUT', `/api/items/${item}/placements/${personId}`, body)
  const view = (jar: CookieJar, item: string) => get<PlacementsResponse>(s, jar, `/api/items/${item}/placements`)

  // Finding a student: by a part of the name or by the class, the name and the class and nothing else; teachers and organizers only.
  const found = await get<{ students: Record<string, string>[] }>(s, s.carla, `/api/campaigns/${id}/students?q=${encodeURIComponent('pfnä')}`)
  assert.deepEqual(found.body.students, [{ personId: s.saraPerson, displayName: SARA.name, className: '5A' }])
  assert.deepEqual(names((await get<{ students: { displayName: string }[] }>(s, s.bernd, `/api/campaigns/${id}/students?q=5a`)).body.students), [SARA.name, TIM.name])
  assert.equal((await get(s, s.bernd, `/api/campaigns/${id}/students?q=x`)).status, 400, 'two characters at least')
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}/students?q=5a`)).status, 404, 'a student does not see a registration taking proposals')

  // Carla places Sara into her workshop: no question asked, and the answer says what it means, Sara is out of the trip to Vienna, whose lead is Bernd.
  const placed = await place(s.carla, s.items.werkstatt, s.saraPerson)
  assert.equal(placed.status, 200, JSON.stringify(placed.body))
  assert.deepEqual(placed.body.placed.map((p) => [p.displayName, p.className, p.leavesClass, others(p.leaves)]), [[SARA.name, '5A', true, [['Wien', BERND.name]]]])
  assert.deepEqual([placed.body.mayPlace, placed.body.mayTakeOut, placed.body.classActivity, placed.body.tell], [true, false, false, []])
  // Only its own teachers place into an activity, and only they and organizers read its placements.
  assert.equal((await place(s.bernd, s.items.werkstatt, s.timPerson)).status, 403)
  assert.equal((await view(s.bernd, s.items.werkstatt)).status, 403)
  assert.equal((await view(s.anna, s.items.werkstatt)).body.placed.length, 1)
  // A student of a class the activity takes as a whole is in it already; a teacher is nobody to place.
  assert.equal((await place(s.bernd, s.items.wien, s.saraPerson)).body.error, 'class_member')
  assert.equal((await place(s.carla, s.items.werkstatt, s.berndPerson)).status, 404)

  // The trip's teacher sees it: Sara is taken by the workshop, whose lead is Carla. So does 5A's class teacher, who is no teacher of the trip.
  const taken = await view(s.bernd, s.items.wien)
  assert.deepEqual(taken.body.absent.map((a) => [a.displayName, a.by, others(a.elsewhere)]), [[SARA.name, 'placed', [['Werkstatt', CARLA.name]]]])
  assert.deepEqual([taken.body.mayPlace, taken.body.mayTakeOut, taken.body.classActivity], [true, true, true])
  const asClassTeacher = await view(s.carla, s.items.wien)
  assert.deepEqual([asClassTeacher.body.mayPlace, asClassTeacher.body.mayTakeOut, asClassTeacher.body.absent.length], [false, true, 1])
  // The form of the class activity says the same while it is filled.
  const check = await send<{ taken: { displayName: string }[] }>(s, s.bernd, 'POST', `/api/campaigns/${id}/items/check`, { itemId: s.items.wien })
  assert.deepEqual(names(check.body.taken), [SARA.name])

  // Plätze und Bedarf on Tuesday: 5A is on the trip, Sara is out of it and placed, so the 9th grade needs nothing; the workshop has four of its five places left, for the 10th.
  const demand = await get<{ demand: { date: string, grades: { grade: number, cells: { fixed: number, needing: number, offered: number }[] }[] }[] }>(s, s.anna, `/api/campaigns/${id}/demand`)
  const tuesday = demand.body.demand.find((day) => day.date === TUESDAY)
  assert.deepEqual(tuesday?.grades.map((g) => [g.grade, g.cells[0]?.fixed, g.cells[0]?.needing, g.cells[0]?.offered]), [[9, 2, 0, 0], [10, 0, 1, 7]])

  // The check of the workshop shows both sides of it: without it Sara is on the trip and its places are not there; with it, what Plätze und Bedarf says.
  type Cells = { date: string, grades: { grade: number, cells: { fixed: number, needing: number, offered: number }[] }[] }[]
  const sides = await send<{ before: Cells, after: Cells }>(s, s.carla, 'POST', `/api/campaigns/${id}/items/check`, { itemId: s.items.werkstatt })
  const onTuesday = (days: Cells) => days.find((day) => day.date === TUESDAY)?.grades.map((g) => [g.grade, g.cells[0]?.fixed, g.cells[0]?.needing, g.cells[0]?.offered])
  assert.deepEqual(onTuesday(sides.body.before), [[9, 2, 0, 0], [10, 0, 1, 3]])
  assert.deepEqual(onTuesday(sides.body.after), [[9, 2, 0, 0], [10, 0, 1, 7]])

  // The later claim stands: Anna places Sara into the lab, in the workshop's hours. Sara leaves the workshop, and the answer names it and its lead: whom to tell.
  const claimed = await place(s.anna, s.items.labor, s.saraPerson)
  assert.deepEqual([names(claimed.body.placed), others(claimed.body.tell)], [[SARA.name], [['Werkstatt', CARLA.name]]])
  assert.deepEqual((await view(s.carla, s.items.werkstatt)).body.placed, [])

  // Bernd reclaims Sara for the trip: the lab's placement goes, by a teacher who is no part of the lab, and the answer says whom to tell.
  assert.equal((await send(s, s.carla, 'POST', `/api/items/${s.items.werkstatt}/reclaims/${s.saraPerson}`)).status, 409, 'the workshop takes no class: nobody to reclaim for it')
  const reclaimed = await send<PlacementsResponse>(s, s.bernd, 'POST', `/api/items/${s.items.wien}/reclaims/${s.saraPerson}`)
  assert.equal(reclaimed.status, 200, JSON.stringify(reclaimed.body))
  assert.deepEqual([reclaimed.body.absent, others(reclaimed.body.tell)], [[], [['Labor', ANNA.name]]])
  assert.deepEqual((await view(s.anna, s.items.labor)).body.placed, [])
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${s.items.wien}/reclaims/${s.saraPerson}`)).status, 404, 'nothing left to reclaim')

  // Beside the class activity: Tim rehearses for an hour and stays on the trip. With the box on, the rehearsal takes him out of it.
  const beside = await place(s.bernd, s.items.probe, s.timPerson, { leavesClass: false })
  assert.deepEqual(beside.body.placed.map((p) => [p.displayName, p.leavesClass, p.leaves]), [[TIM.name, false, []]])
  assert.deepEqual((await view(s.bernd, s.items.wien)).body.absent, [])
  assert.deepEqual((await place(s.bernd, s.items.probe, s.timPerson, { leavesClass: true })).body.placed.map((p) => [p.leavesClass, others(p.leaves)]), [[true, [['Wien', BERND.name]]]])
  assert.deepEqual(names((await view(s.bernd, s.items.wien)).body.absent), [TIM.name])
  // Removed by its own teachers, once.
  assert.equal((await send(s, s.carla, 'DELETE', `/api/items/${s.items.probe}/placements/${s.timPerson}`)).status, 403)
  assert.deepEqual((await send<PlacementsResponse>(s, s.bernd, 'DELETE', `/api/items/${s.items.probe}/placements/${s.timPerson}`)).body.placed, [])
  assert.equal((await send(s, s.bernd, 'DELETE', `/api/items/${s.items.probe}/placements/${s.timPerson}`)).status, 404)

  // A draft goes with whom its teachers placed into it.
  const draft = await send<Item>(s, s.bernd, 'POST', `/api/campaigns/${id}/items`, { title: 'Chor', places: 0, teachers: [], sessions: [session(MONDAY, '08:30', '10:15')] })
  assert.equal((await place(s.bernd, draft.body.id, s.timPerson)).status, 200, 'from the first save, in every state')
  assert.equal((await send(s, s.bernd, 'DELETE', `/api/items/${draft.body.id}`)).status, 204)

  // Taken off the trip by hand, and then the trip is no longer 5A's: the row left behind does not stand in the way of placing Tim into it.
  assert.equal((await send(s, s.bernd, 'PUT', `/api/items/${s.items.wien}/absences/${s.timPerson}`)).status, 200)
  const opened = await send<Item>(s, s.anna, 'PATCH', `/api/items/${s.items.wien}`, { title: 'Wien', places: 5, fixedClasses: [], teachers: [s.berndPerson], sessions: [session(TUESDAY, '08:00', '13:00', WEDNESDAY)] })
  assert.equal(opened.status, 200, JSON.stringify(opened.body))
  const direct = await place(s.bernd, s.items.wien, s.timPerson)
  assert.equal(direct.status, 200, JSON.stringify(direct.body))
  assert.deepEqual([names(direct.body.placed), direct.body.absent, direct.body.classActivity], [[TIM.name], [], false])
  assert.equal((await get<{ items: Item[] }>(s, s.anna, `/api/campaigns/${id}/items`)).body.items.find((i) => i.id === s.items.wien)?.directlyPlaced, 1)
  // And the other way round: the trip is 5A's again, with Tim placed into it directly. Taken off it, he is off it: that placement goes.
  assert.equal((await send(s, s.anna, 'PATCH', `/api/items/${s.items.wien}`, { title: 'Wien', places: 0, fixedClasses: ['5A'], cancellableBelowMin: false, teachers: [s.berndPerson], sessions: [session(TUESDAY, '08:00', '13:00', WEDNESDAY)] })).status, 200)
  const off = await send<PlacementsResponse>(s, s.bernd, 'PUT', `/api/items/${s.items.wien}/absences/${s.timPerson}`)
  assert.deepEqual([off.body.placed, off.body.absent.map((a) => [a.displayName, a.by])], [[], [[TIM.name, 'list']]])

  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  const acts = (await readAudit(owner, id)).filter((e) => e.action.startsWith('preassignment.')).map((e) => [e.action, e.metadata.personId, e.metadata.movedFrom ?? e.metadata.from ?? null])
  assert.deepEqual(acts, [
    ['preassignment.placed', s.saraPerson, []],
    ['preassignment.placed', s.saraPerson, [s.items.werkstatt]],
    ['preassignment.reclaimed', s.saraPerson, [s.items.labor]],
    ['preassignment.placed', s.timPerson, []],
    ['preassignment.placed', s.timPerson, []],
    ['preassignment.removed', s.timPerson, null],
    ['preassignment.placed', s.timPerson, []],
    ['preassignment.exempted', s.timPerson, null],
    ['preassignment.placed', s.timPerson, []],
    ['preassignment.exempted', s.timPerson, null],
  ])
})

test('a class activity\'s teachers keep its list of who does not take part, without reasons, before the window opens and while it is open; the choice and the run read what holds', DB, async (t) => {
  const solver = await startFakeSolver()
  t.after(() => solver.close())
  const s = await school(t, { SOLVER_URL: solver.baseUrl })
  const id = s.campaign.id
  const view = (jar: CookieJar, item: string) => get<PlacementsResponse>(s, jar, `/api/items/${item}/placements`)
  const absence = (jar: CookieJar, method: 'PUT' | 'DELETE', personId: string) => send<PlacementsResponse & { error?: string }>(s, jar, method, `/api/items/${s.items.wien}/absences/${personId}`)

  // Tim does not come to Vienna: on the trip's list, before anything is approved, without a reason. Twice is once.
  const listed = await absence(s.bernd, 'PUT', s.timPerson)
  assert.equal(listed.status, 200, JSON.stringify(listed.body))
  assert.deepEqual(listed.body.absent.map((a) => [a.displayName, a.by, a.elsewhere]), [[TIM.name, 'list', []]])
  assert.equal((await absence(s.bernd, 'PUT', s.timPerson)).body.absent.length, 1)
  // Only students of its classes; only its teachers, the class teacher and organizers.
  assert.equal((await absence(s.anna, 'PUT', s.miaPerson)).body.error, 'not_class_member')
  assert.equal((await absence(s.tim, 'PUT', s.timPerson)).status, 404, 'a student does not see a registration taking proposals')
  // The class teacher takes him off the list again, and the trip's teacher puts him back on.
  assert.deepEqual((await absence(s.carla, 'DELETE', s.timPerson)).body.absent, [])
  assert.equal((await absence(s.carla, 'DELETE', s.timPerson)).status, 404)
  assert.equal((await absence(s.bernd, 'PUT', s.timPerson)).status, 200)
  // He needs a place on both days of the trip now: one of the two of 5A.
  const demand = await get<{ demand: { date: string, grades: { grade: number, cells: { fixed: number, needing: number }[] }[] }[] }>(s, s.anna, `/api/campaigns/${id}/demand`)
  assert.deepEqual(demand.body.demand.map((day) => [day.date, day.grades[0]?.cells[0]?.fixed, day.grades[0]?.cells[0]?.needing]), [[MONDAY, 0, 2], [TUESDAY, 1, 1], [WEDNESDAY, 1, 1]])

  // Sara is placed into the workshop instead of the trip. Everything approved and published, the window opens.
  assert.equal((await send(s, s.carla, 'PUT', `/api/items/${s.items.werkstatt}/placements/${s.saraPerson}`, {})).status, 200)
  for (const item of [s.items.wien, s.items.werkstatt, s.items.labor, s.items.mittwoch]) assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${item}/approve`)).status, 200)
  const settings = { name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS, opensAt: '2027-03-01T08:00:00+01:00', closesAt: '2027-03-08T20:00:00+01:00', dailyMinimum: { 9: 100, 10: 100 } }
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, settings)).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })).status, 200)

  // Sara's page: the workshop, which a teacher placed her into, and nothing of Vienna; she chooses for Wednesday, the trip's other day.
  const titles = (items: readonly { title: string }[]) => items.map((item) => item.title).sort((a, b) => a.localeCompare(b, 'de'))
  const sara = await get<ChoiceView>(s, s.sara, `/api/campaigns/${id}/my-choice`)
  assert.equal(sara.status, 200, JSON.stringify(sara.body))
  assert.deepEqual([titles(sara.body.fixed), sara.body.directItemIds], [['Werkstatt'], [s.items.werkstatt]])
  assert.deepEqual(titles(sara.body.groups.flatMap((g) => g.items)), ['Mittwochskurs'], 'the lab overlaps her workshop; the workshop is hers already')
  // Tim's page: not on the trip, so he chooses for both of its days. The workshop has a place less: Sara's.
  const tim = await get<ChoiceView>(s, s.tim, `/api/campaigns/${id}/my-choice`)
  assert.deepEqual([titles(tim.body.fixed), tim.body.directItemIds], [[], []])
  assert.deepEqual(titles(tim.body.groups.flatMap((g) => g.items)), ['Labor', 'Mittwochskurs', 'Werkstatt'])

  // The organizer's exemption, on a student's page, is from a class activity: a direct placement is none of its business.
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/preassignments/${s.saraPerson}/${s.items.werkstatt}/exempt`, { reason: 'Versuch' })).status, 404)

  // While the window is open the list still changes: back on the trip, Tim has nothing to choose for its days; off it again, he has.
  assert.deepEqual((await absence(s.bernd, 'DELETE', s.timPerson)).body.absent.map((a) => a.displayName), [SARA.name], 'Sara is out by her placement')
  const back = await get<ChoiceView>(s, s.tim, `/api/campaigns/${id}/my-choice`)
  assert.deepEqual([titles(back.body.fixed), titles(back.body.groups.flatMap((g) => g.items))], [['Wien'], []])
  assert.equal((await absence(s.bernd, 'PUT', s.timPerson)).status, 200)
  assert.deepEqual(titles((await get<ChoiceView>(s, s.tim, `/api/campaigns/${id}/my-choice`)).body.fixed), [])
  // The organizer's page shows Vienna among the placements only for who is in it: nobody now.
  assert.deepEqual((await view(s.anna, s.items.wien)).body.absent.map((a) => [a.displayName, a.by]), [[SARA.name, 'placed'], [TIM.name, 'list']])

  // Placed into the Wednesday course directly, and then the course becomes her class's: taken back, the direct placement leaves Mia in it by class.
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  assert.equal((await send(s, s.anna, 'PUT', `/api/items/${s.items.mittwoch}/placements/${s.miaPerson}`, {})).status, 200)
  assert.equal((await send(s, s.anna, 'PATCH', `/api/items/${s.items.mittwoch}`, { title: 'Mittwochskurs', places: 10, fixedClasses: ['6A'], cancellableBelowMin: false, teachers: [s.annaPerson], sessions: [session(WEDNESDAY, '08:30', '12:15')] })).status, 200)
  const rowOf = async () => (await owner.query<{ source: string }>('select source from pre_assignment where item_id = $1 and person_id = $2', [s.items.mittwoch, s.miaPerson])).rows.map((row) => row.source)
  assert.deepEqual(await rowOf(), ['direct'], 'the direct placement stands in the class placement\'s place')
  assert.equal((await send(s, s.anna, 'DELETE', `/api/items/${s.items.mittwoch}/placements/${s.miaPerson}`)).status, 200)
  assert.deepEqual(await rowOf(), ['class'])

  // Closed and computed: Sara's placement is her fixed item, the trip is nobody's; Tim, who saved no list, gets fallbacks, never the night away.
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'closed' })).status, 200)
  assert.equal((await send(s, s.bernd, 'PUT', `/api/items/${s.items.wien}/absences/${s.saraPerson}`)).status, 409, 'closed: a teacher changes the placements no more')
  const started = await send<{ run: AllocationRun }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs`, { seed: 3 })
  assert.equal(started.status, 202, JSON.stringify(started.body))
  let review: RunReviewResponse | undefined
  for (let i = 0; i < 200; i++) {
    review = (await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${id}/runs/${started.body.run.id}`)).body
    if (review.run.status !== 'running') break
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(review?.run.status, 'succeeded', JSON.stringify(review?.run))
  // The workshop wanted four and got only Sara, who was placed into it: an activity with someone placed into it takes place.
  assert.equal(review?.run.cancelledItemIds.includes(s.items.werkstatt), false)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs/${started.body.run.id}/publish`, { cancelledItemIds: review?.run.cancelledItemIds ?? [] })).status, 200)
  const saraResult = await get<MyResultResponse>(s, s.sara, `/api/campaigns/${id}/my-result`)
  assert.equal(saraResult.status, 200, JSON.stringify(saraResult.body))
  assert.equal(titles(saraResult.body.items).includes('Werkstatt'), true)
  assert.equal(titles(saraResult.body.items).includes('Wien'), false)
  const timResult = await get<MyResultResponse>(s, s.tim, `/api/campaigns/${id}/my-result`)
  assert.equal(titles(timResult.body.items).includes('Wien'), false)

  // Published, the same acts change the result. The trip's teacher brings Sara back: she leaves the workshop, which overlaps, and the answer says whom to tell.
  const placements = (jar: CookieJar, item: string) => get<PlacementsResponse>(s, jar, `/api/items/${item}/placements`)
  const workshop = await placements(s.carla, s.items.werkstatt)
  assert.deepEqual([workshop.body.mayPlace, workshop.body.placed.map((p) => [p.displayName, p.leavesClass, p.leaves.map((o) => o.title)])], [true, [[SARA.name, true, ['Wien']]]])
  const returned = await send<PlacementsResponse>(s, s.bernd, 'POST', `/api/items/${s.items.wien}/reclaims/${s.saraPerson}`)
  assert.equal(returned.status, 200, JSON.stringify(returned.body))
  assert.deepEqual([returned.body.absent.map((a) => [a.displayName, a.by]), returned.body.tell.map((o) => o.title).sort((a, b) => a.localeCompare(b, 'de'))], [[[TIM.name, 'list']], ['Mittwochskurs', 'Werkstatt']], 'the trip takes both days: the Wednesday course she was given goes too')
  assert.equal(titles((await get<MyResultResponse>(s, s.sara, `/api/campaigns/${id}/my-result`)).body.items).includes('Wien'), true)
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${s.items.wien}/reclaims/${s.saraPerson}`)).status, 404, 'in it already')
  // And out again, without a reason; Tim, out already, stays out.
  assert.deepEqual((await send<PlacementsResponse>(s, s.carla, 'PUT', `/api/items/${s.items.wien}/absences/${s.saraPerson}`)).body.absent.map((a) => [a.displayName, a.by]), [[SARA.name, 'list'], [TIM.name, 'list']])
  assert.equal((await send(s, s.bernd, 'PUT', `/api/items/${s.items.wien}/absences/${s.timPerson}`)).status, 200)
  // A teacher places a student into their activity: Mia, on the Wednesday course with her class, into the lab on Tuesday, leaving what the run gave her there; a second time with the box changes nothing; taken off it again, once.
  const mia = await send<PlacementsResponse>(s, s.anna, 'PUT', `/api/items/${s.items.labor}/placements/${s.miaPerson}`, {})
  assert.equal(mia.status, 200, JSON.stringify(mia.body))
  assert.deepEqual(mia.body.placed.map((p) => [p.displayName, p.leavesClass]), [['Mia Unbekannt', true]])
  assert.deepEqual((await send<PlacementsResponse>(s, s.anna, 'PUT', `/api/items/${s.items.labor}/placements/${s.miaPerson}`, { leavesClass: false })).body.placed.length, 1)
  assert.equal((await send(s, s.bernd, 'DELETE', `/api/items/${s.items.labor}/placements/${s.miaPerson}`)).status, 403, 'not a teacher of the lab')
  assert.deepEqual((await send<PlacementsResponse>(s, s.anna, 'DELETE', `/api/items/${s.items.labor}/placements/${s.miaPerson}`)).body.placed, [])
  assert.equal((await send(s, s.anna, 'DELETE', `/api/items/${s.items.labor}/placements/${s.miaPerson}`)).status, 404)
  // Sara, out of the trip, into the workshop again by its teacher: whatever of hers the workshop overlaps is left and named.
  const again = await send<PlacementsResponse>(s, s.carla, 'PUT', `/api/items/${s.items.werkstatt}/placements/${s.saraPerson}`, {})
  assert.equal(again.status, 200, JSON.stringify(again.body))
  assert.deepEqual(again.body.placed.map((p) => p.displayName), [SARA.name])
  // The changes say what they were, in place of a reason; the student is told by whom.
  const changes = (await owner.query<{ kind: string, reason: string | null }>('select c.kind, c.reason from assignment_change c join allocation_run r on r.id = c.run_id where r.campaign_id = $1 order by c.seq', [id])).rows
  assert.deepEqual(changes.map((c) => [c.kind, c.reason]), [
    ['move', 'Zurück in der Klassenaktivität'], ['remove', 'Nimmt an der Klassenaktivität nicht teil'], ['move', 'Von einer Lehrkraft der Aktivität direkt eingeteilt'],
    ['remove', 'Von einer Lehrkraft der Aktivität ausgetragen'], ['place', 'Von einer Lehrkraft der Aktivität direkt eingeteilt'],
  ])
  const told = (await owner.query<{ body: string }>('select body from outbox_mail where campaign_id = $1 and kind = \'assignment_changed\' and person_id = $2 order by created_at', [id, s.saraPerson])).rows
  assert.equal(told.length, 3)
  assert.match(told[0]?.body ?? '', /einer Lehrkraft der Aktivität/)

  const acts = (await readAudit(owner, id)).filter((e) => e.action === 'preassignment.exempted' || e.action === 'preassignment.exemption-lifted').map((e) => [e.action, e.metadata.personId, e.metadata.reason ?? null])
  assert.deepEqual(acts, [
    ['preassignment.exempted', s.timPerson, null], ['preassignment.exemption-lifted', s.timPerson, null], ['preassignment.exempted', s.timPerson, null],
    ['preassignment.exemption-lifted', s.timPerson, null], ['preassignment.exempted', s.timPerson, null],
  ])
})
