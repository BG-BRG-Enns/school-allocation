// The classes a registration is for: every class of the roster unless the
// organizer names some; changed while it is set up or takes proposals, never
// without a class an activity or a rule names; a student of a class left
// out sees nothing of it; the opening invites and places the classes taking
// part only, the demand, the class pages and the class teachers' notices go
// by them too.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { createDatabase } from '../lib/db.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item } from '../lib/models/items.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { DB, get, harness, me, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const DAYS = ['2027-06-21', '2027-06-22']
const MONDAY = { startsAt: '2027-06-21T09:00:00+02:00', endsAt: '2027-06-21T13:00:00+02:00' }

type Ready = Harness & { anna: CookieJar, bernd: CookieJar, carla: CookieJar, sara: CookieJar, tim: CookieJar, bernd_id: string }

/** Sara in 5A and Tim in 8B, Carla the class teacher of both by the CSV; Anna organizes, Bernd teaches. */
async function school(t: Parameters<typeof harness>[0]): Promise<Ready> {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind;class_teacher_email',
    `${SARA.email};Sara;Pfnäxthuber;5A;9;student;${CARLA.email}`, `${TIM.email};Tim;Gnöxwieser;8B;12;student;${CARLA.email}`,
    `${ANNA.email};Anna;Zwexmhofer;;;teacher;`, `${BERND.email};Bernd;Pfnöxlhofer;;;teacher;`, `${CARLA.email};Carla;Knoxbrunner;;;teacher;`,
  ].join('\n')
  const batch = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  assert.equal(committed.status, 200, JSON.stringify(committed.body))
  const bernd_id = committed.body.diff.added.find((e) => e.displayName === BERND.name)?.personId ?? ''
  return { ...h, anna: await signIn(h, ANNA), bernd: await signIn(h, BERND), carla: await signIn(h, CARLA), sara: await signIn(h, SARA), tim: await signIn(h, TIM), bernd_id }
}

const create = (s: Ready, body: Record<string, unknown> = {}) => send<Campaign>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS, ...body })
const settings = (s: Ready, id: string, body: Record<string, unknown>) => send<Campaign & { error?: string, classes: string[] }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS, ...body })
const move = (s: Ready, id: string, to: string) => send<Campaign>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to })

test('a registration takes every class of the roster unless the organizer names some; the list changes while it is set up or takes proposals, never to a class the roster does not have, never without one an activity or a rule names', DB, async (t) => {
  const s = await school(t)
  // Left out, every class; named, those, sorted and each once; a class the roster does not have is refused.
  const every = await create(s)
  assert.equal(every.status, 201, JSON.stringify(every.body))
  assert.deepEqual(every.body.classes, ['5A', '8B'])
  const some = await create(s, { name: 'Projekttage der Oberstufe', classes: ['8B', '5A', '5A'] })
  assert.deepEqual(some.body.classes, ['5A', '8B'])
  const unknown = await create(s, { name: 'Versuch', classes: ['5A', '9Z'] })
  assert.deepEqual([unknown.status, (unknown.body as unknown as { error: string, message: string }).error, (unknown.body as unknown as { message: string }).message], [404, 'class_unknown', '9Z'])
  const id = some.body.id
  const created = (await readAudit(s.db, SCHOOL_SCOPE)).filter((e) => e.action === 'campaign.created').at(-1)
  assert.equal(created?.metadata.classes, 2)
  // Taken out while in preparation: audited by counts; the list sent unchanged records nothing.
  assert.deepEqual((await settings(s, id, { classes: ['5A'] })).body.classes, ['5A'])
  assert.deepEqual((await settings(s, id, { classes: ['5A'] })).body.classes, ['5A'])
  const changed = (await readAudit(s.db, id)).filter((e) => e.action === 'campaign.classes-changed')
  assert.deepEqual(changed.map((e) => e.metadata), [{ campaignId: id, added: 0, removed: 1, classes: 1 }])
  // Collecting: an activity for 8B's whole class is refused while 8B is out, allowed once it is back in; then 8B stays as long as the activity names it.
  assert.equal((await move(s, id, 'catalogue')).status, 200)
  const url = `/api/campaigns/${id}/items`
  const refused = await send<{ error: string, problems: { code: string }[] }>(s, s.bernd, 'POST', url, { title: 'Wien', places: 0, fixedClasses: ['8B'], cancellableBelowMin: false, teachers: [s.bernd_id], sessions: [MONDAY] })
  assert.deepEqual([refused.status, refused.body.problems.map((p) => p.code)], [422, ['fixed_class_unknown']])
  assert.deepEqual((await settings(s, id, { classes: ['5A', '8B'] })).body.classes, ['5A', '8B'])
  const wien = await send<Item>(s, s.bernd, 'POST', url, { title: 'Wien', places: 0, fixedClasses: ['8B'], cancellableBelowMin: false, teachers: [s.bernd_id], sessions: [MONDAY] })
  assert.equal(wien.status, 201, JSON.stringify(wien.body))
  const inUse = await settings(s, id, { classes: ['5A'] })
  assert.deepEqual([inUse.status, inUse.body.error, (inUse.body as unknown as { classes: string[] }).classes], [409, 'class_in_use', ['8B']])
  // A rule naming a class keeps it too. The categories: one is needed for a rule.
  const category = await send<{ categories: { id: string }[] }>(s, s.anna, 'POST', '/api/admin/categories', { name: 'Sport' })
  const categoryId = category.body.categories[0]?.id ?? ''
  assert.equal((await send(s, s.bernd, 'DELETE', `/api/items/${wien.body.id}`)).status, 204, 'the draft goes, 8B is free again')
  assert.equal((await settings(s, id, { rules: [{ categoryId, grades: [9], classes: ['5A'], unit: 'items', minimum: 1 }] })).status, 200)
  const ruled = await settings(s, id, { classes: ['8B'] })
  assert.deepEqual([ruled.status, (ruled.body as unknown as { classes: string[] }).classes], [409, ['5A']])
  // One save replacing both: a rule naming a class the same save takes out is refused; the rule and the class going together pass.
  const both = await settings(s, id, { classes: ['5A'], rules: [{ categoryId, grades: [12], classes: ['8B'], unit: 'items', minimum: 1 }] })
  assert.deepEqual([both.status, (both.body as unknown as { classes: string[] }).classes], [409, ['8B']])
  const together = await settings(s, id, { classes: ['8B'], rules: [] })
  assert.deepEqual([together.status, together.body.classes, together.body.rules], [200, ['8B'], []])
  assert.deepEqual((await settings(s, id, { classes: ['5A', '8B'] })).body.classes, ['5A', '8B'])
  // From publication on, the list is fixed; the window's settings still change without it.
  assert.equal((await move(s, id, 'published')).status, 200)
  assert.equal((await settings(s, id, { classes: ['5A'] })).body.error, 'campaign_state')
  assert.equal((await settings(s, id, { classes: ['5A', '8B'], reminderDays: 2 })).status, 200, 'the list sent as it is changes nothing')
  // A registration of a school without a roster yet has no classes; the organizer enters them once the lists are there.
  const bare = await send<Campaign>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Leer', schoolYear: '2026/27', projectDays: DAYS, classes: [] })
  assert.deepEqual([bare.status, bare.body.classes], [201, []])
})

test('a student of a class left out sees nothing of the registration; the opening invites and places the classes taking part only; the demand, the class pages and the class teachers\' notices go by them', DB, async (t) => {
  const s = await school(t)
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  const created = await create(s, { classes: ['5A'] })
  const id = created.body.id
  assert.equal((await move(s, id, 'catalogue')).status, 200)
  const propose = async (body: Record<string, unknown>) => {
    const item = await send<Item>(s, s.bernd, 'POST', `/api/campaigns/${id}/items`, { teachers: [s.bernd_id], ...body })
    assert.equal(item.status, 201, JSON.stringify(item.body))
    assert.equal((await send(s, s.bernd, 'POST', `/api/items/${item.body.id}/propose`)).status, 200)
    assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${item.body.id}/approve`)).status, 200)
    return item.body.id
  }
  await propose({ title: 'Klettern', places: 12, sessions: [MONDAY] })
  await propose({ title: 'Wien', places: 2, fixedClasses: ['5A'], cancellableBelowMin: false, sessions: [{ startsAt: '2027-06-22T08:00:00+02:00', endsAt: '2027-06-22T18:00:00+02:00' }] })
  // The classes offered to the proposal form and the demand: 5A alone.
  assert.deepEqual((await get<{ classes: { className: string }[] }>(s, s.bernd, `/api/campaigns/${id}/classes`)).body.classes.map((c) => c.className), ['5A'])
  const demand = await get<{ demand: { date: string, grades: { grade: number, cells: { needing: number }[] }[] }[] }>(s, s.anna, `/api/campaigns/${id}/demand`)
  assert.deepEqual(demand.body.demand.map((d) => d.grades.map((g) => [g.grade, g.cells[0]?.needing])), [[[9, 1]], [[9, 0]]], 'the 12th grade is not asked for')
  assert.equal((await settings(s, id, { opensAt: '2027-03-01T08:00:00+01:00', closesAt: '2027-03-08T20:00:00+01:00' })).status, 200)
  assert.equal((await move(s, id, 'published')).status, 200)
  // Tim, in 8B: no registration in his list, none by its id, no list to give; Sara sees it.
  assert.deepEqual((await get<{ campaigns: Campaign[] }>(s, s.tim, '/api/campaigns')).body.campaigns, [])
  assert.equal((await get(s, s.tim, `/api/campaigns/${id}`)).status, 404)
  assert.equal((await get(s, s.tim, `/api/campaigns/${id}/my-choice`)).status, 404)
  assert.equal((await get(s, s.sara, `/api/campaigns/${id}`)).status, 200)
  // A role reads by what it grants, never narrowed by the roster's kind: Tim as auditor sees the registration his class is not in.
  const timId = (await me(s, s.tim)).body.id
  const audits = await send<{ id: string }>(s, s.anna, 'POST', '/api/admin/roles', { userId: timId, role: 'read_only_auditor', reason: 'Prüfung' })
  assert.equal(audits.status, 201)
  assert.equal((await get(s, s.tim, `/api/campaigns/${id}`)).status, 200, 'an auditor in 8B reads the registration of 5A')
  assert.deepEqual((await get<{ campaigns: Campaign[] }>(s, s.tim, '/api/campaigns')).body.campaigns.map((c) => c.id), [id])
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/roles/${audits.body.id}/revoke`, { reason: 'Prüfung beendet' })).status, 204)
  assert.equal((await get(s, s.tim, `/api/campaigns/${id}`)).status, 404)
  // Carla is class teacher of 5A and 8B; in this registration, of 5A alone.
  const view = await get<{ may: { classTeacherOf: string[] } }>(s, s.carla, `/api/campaigns/${id}`)
  assert.deepEqual(view.body.may.classTeacherOf, ['5A'])
  assert.equal((await get(s, s.carla, `/api/campaigns/${id}/classes/8B/status`)).status, 403)
  // Opened: Sara is placed into the trip and invited; Tim is neither.
  assert.equal((await move(s, id, 'open')).status, 200)
  const placed = await owner.query<{ n: string }>('select count(*)::text as n from pre_assignment where campaign_id = $1', [id])
  assert.equal(placed.rows[0]?.n, '1')
  const invited = await owner.query<{ to_address: string }>('select to_address from outbox_mail where campaign_id = $1 and kind = \'choice_invitation\' order by to_address', [id])
  assert.deepEqual(invited.rows.map((r) => r.to_address), [SARA.email])
  const missing = await get<{ students: { displayName: string }[] }>(s, s.anna, `/api/admin/campaigns/${id}/missing`)
  assert.deepEqual(missing.body.students.map((st) => st.displayName), [SARA.name])
  // Closed early: the class teacher's list names 5A's missing wishes; 8B's class teacher hears nothing of 8B.
  assert.equal((await move(s, id, 'closed')).status, 200)
  const notices = await owner.query<{ kind: string, to_address: string }>('select kind, to_address from outbox_mail where campaign_id = $1 and kind = \'class_missing\' order by to_address', [id])
  assert.deepEqual(notices.rows, [{ kind: 'class_missing', to_address: CARLA.email }])
  const body = (await owner.query<{ body: string }>('select body from outbox_mail where campaign_id = $1 and kind = \'class_missing\'', [id])).rows[0]?.body ?? ''
  assert.match(body, /5A/)
  assert.doesNotMatch(body, /8B/)
  // The close froze the roster. A later list moves Sara to 6A and Tim to 5A: the registration goes by its own roster,
  // so Sara still reads it and Tim still does not; one still following the lists in force goes by them.
  const moved = ['email;given_name;family_name;class;grade;kind;class_teacher_email', `${SARA.email};Sara;Pfnäxthuber;6A;10;student;`, `${TIM.email};Tim;Gnöxwieser;5A;9;student;`,
    `${ANNA.email};Anna;Zwexmhofer;;;teacher;`, `${BERND.email};Bernd;Pfnöxlhofer;;;teacher;`, `${CARLA.email};Carla;Knoxbrunner;;;teacher;`].join('\n')
  const batch = await send<BatchDetail>(s, s.anna, 'POST', '/api/admin/roster/csv', { csv: moved, schoolYear: '2026/27' })
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)).status, 200)
  const sara = await signIn(s, SARA)
  const tim = await signIn(s, TIM)
  assert.equal((await get(s, sara, `/api/campaigns/${id}`)).status, 200, 'Sara, now in 6A, still reads the registration frozen with her in 5A')
  assert.equal((await get(s, tim, `/api/campaigns/${id}`)).status, 404, 'Tim, now in 5A, was not in it')
  const next = await create(s, { name: 'Projektwoche 2028', classes: ['5A'] })
  assert.equal((await move(s, next.body.id, 'catalogue')).status, 200)
  assert.equal((await move(s, next.body.id, 'published')).status, 200)
  assert.deepEqual((await get<{ campaigns: Campaign[] }>(s, tim, '/api/campaigns')).body.campaigns.map((c) => c.name), ['Projektwoche 2028'], 'a registration following the lists in force sees Tim in 5A')
  assert.deepEqual((await get<{ campaigns: Campaign[] }>(s, sara, '/api/campaigns')).body.campaigns.map((c) => c.name), ['Projektwoche 2027'])
})
