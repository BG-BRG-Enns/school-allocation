// The availability import: a registration's teachers' days and notes from
// one CSV, matched by address or abbreviation, previewed, applied under
// the registration's lock and audited; what it refuses, and who may.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AvailabilityImportApplied, AvailabilityImportPreview, PlanningResponse } from '@school-allocation/api-contracts/planning'
import type { TeacherListApplied } from '@school-allocation/api-contracts/settings'
import { readAudit } from '../lib/audit.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import { DB, get, harness, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
// Mon 21, Tue 22 June 2027.
const DAYS = ['2027-06-21', '2027-06-22']

type Ready = Harness & { anna: Awaited<ReturnType<typeof signIn>>, bernd: Awaited<ReturnType<typeof signIn>>, campaign: string }

/** A school with a roster in force and a registration taking proposals; Bernd and Carla have abbreviations. */
async function school(t: Parameters<typeof harness>[0]): Promise<Ready> {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind;class_teacher_email',
    `${SARA.email};Sara;Pfnäxthuber;5A;9;student;${CARLA.email}`, `${TIM.email};Tim;Gnöxwieser;5A;9;student;${CARLA.email}`,
    `${ANNA.email};Anna;Zwexmhofer;;;teacher;`, `${BERND.email};Bernd;Pfnöxlhofer;;;teacher;`, `${CARLA.email};Carla;Knoxbrunner;;;teacher;`,
  ].join('\n')
  const batch = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  assert.equal((await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)).status, 200)
  await signIn(h, BERND)
  await signIn(h, CARLA)
  const signedAnna = await signIn(h, ANNA)
  assert.equal((await send<TeacherListApplied>(h, signedAnna, 'POST', '/api/admin/classes/import', { csv: `email;short_name\n${BERND.email};PfB\n${CARLA.email};KnC\n` })).status, 200)
  const created = await send<Campaign>(h, signedAnna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  assert.equal((await send(h, signedAnna, 'POST', `/api/admin/campaigns/${created.body.id}/transition`, { to: 'catalogue' })).status, 200)
  return { ...h, anna: signedAnna, bernd: await signIn(h, BERND), campaign: created.body.id }
}

test('an availability list is previewed as what it changes, applied with the notes, audited once; the template is today\'s state; the overview shows abbreviations and notes', DB, async (t) => {
  const s = await school(t)
  const url = `/api/admin/campaigns/${s.campaign}/availability/import`
  // The school's sheet: abbreviations, weekdays, Leitung ignored, the remark; Anna by address.
  const list = [
    'Name;Address Email;MO;DI;Leitung;Anmerkung',
    `;${(ANNA.email ?? '').toUpperCase()};N;;;`,
    'PfB;;F;F;N;NUR RESERVE',
    'KnC;;;;;',
  ].join('\r\n')
  const preview = await send<AvailabilityImportPreview>(s, s.anna, 'POST', `${url}/preview`, { csv: list })
  assert.equal(preview.status, 200, JSON.stringify(preview.body))
  assert.deepEqual(preview.body.problems, [])
  assert.deepEqual(preview.body.ignoredColumns, ['Leitung'])
  assert.deepEqual(preview.body.days, DAYS)
  assert.deepEqual(preview.body.teachers.map((x) => [x.displayName, x.shortName, x.days.map((d) => `${d.before}>${d.after}`), x.note]), [
    [ANNA.name, null, ['available>unavailable', 'available>available'], null],
    [BERND.name, 'PfB', ['available>if_needed', 'available>if_needed'], { before: null, after: 'NUR RESERVE' }],
    [CARLA.name, 'KnC', ['available>available', 'available>available'], null],
  ])
  assert.equal(preview.body.changedDays, 3)
  assert.equal(preview.body.changedNotes, 1)
  assert.equal(preview.body.applicable, true)

  const applied = await send<AvailabilityImportApplied>(s, s.anna, 'POST', url, { csv: list })
  assert.equal(applied.status, 200, JSON.stringify(applied.body))
  assert.equal(applied.body.changedDays, 3)
  assert.equal(applied.body.changedNotes, 1)
  const bernd = applied.body.planning.teachers.find((x) => x.displayName === BERND.name)
  assert.deepEqual([bernd?.shortName, bernd?.note, bernd?.days.map((d) => d.status)], ['PfB', 'NUR RESERVE', ['if_needed', 'if_needed']])
  assert.deepEqual(applied.body.planning.teachers.find((x) => x.displayName === ANNA.name)?.days.map((d) => d.status), ['unavailable', 'available'])
  const actions = (await readAudit(s.db, s.campaign)).filter((e) => e.action.startsWith('availability.')).map((e) => [e.action, e.metadata.changedDays])
  assert.deepEqual(actions, [['availability.imported', 3]])

  // The same file again changes nothing.
  const again = await send<AvailabilityImportPreview>(s, s.anna, 'POST', `${url}/preview`, { csv: list })
  assert.equal(again.body.changedDays, 0)
  assert.equal(again.body.changedNotes, 0)

  // The template carries the state: every teacher of the planning, by name, with address, abbreviation, days and note.
  const template = await s.app.inject({ method: 'GET', url: `${url}/template`, headers: { cookie: s.anna.header() } })
  assert.equal(template.statusCode, 200)
  assert.match(String(template.headers['content-type']), /^text\/csv/)
  assert.equal(template.body, [`email;short_name;${DAYS.join(';')};note`, `${ANNA.email};;N;;`, `${BERND.email};PfB;F;F;NUR RESERVE`, `${CARLA.email};KnC;;;`, ''].join('\r\n'))

  // A file with only the Monday column and an empty note clears Bernd's note and makes him available on Monday; Tuesday stays.
  const partial = await send<AvailabilityImportApplied>(s, s.anna, 'POST', url, { csv: 'short_name;2027-06-21;note\nPfB;;\n' })
  assert.equal(partial.status, 200, JSON.stringify(partial.body))
  const after = partial.body.planning.teachers.find((x) => x.displayName === BERND.name)
  assert.deepEqual([after?.note, after?.days.map((d) => d.status)], [null, ['available', 'if_needed']])
})

test('a list naming someone the registration does not know, an address and an abbreviation of two people, or a value none of the three is not applied; a file without a day column is refused; nothing is written', DB, async (t) => {
  const s = await school(t)
  const url = `/api/admin/campaigns/${s.campaign}/availability/import`
  const list = [
    'email;Name;MO',
    `nobody@schule.example.org;;N`,
    `${SARA.email};;N`,
    `${ANNA.email};PfB;N`,
    `${CARLA.email};;vielleicht`,
    `${BERND.email};;N`,
  ].join('\n')
  const preview = await send<AvailabilityImportPreview>(s, s.anna, 'POST', `${url}/preview`, { csv: list })
  assert.equal(preview.status, 200)
  assert.deepEqual(preview.body.problems, [
    { code: 'status_invalid', line: 5, key: 'vielleicht' },
    { code: 'teacher_unknown', line: 2, key: 'nobody@schule.example.org' },
    { code: 'teacher_unknown', line: 3, key: SARA.email },
    { code: 'key_conflict', line: 4, key: `${ANNA.email} / PfB` },
  ])
  assert.equal(preview.body.applicable, false)
  const refused = await send<{ error: string, problems: unknown[] }>(s, s.anna, 'POST', url, { csv: list })
  assert.equal(refused.status, 422)
  assert.equal(refused.body.error, 'availability_import_invalid')
  assert.equal(refused.body.problems.length, 4)
  const noDay = await send<{ error: string }>(s, s.anna, 'POST', url, { csv: 'email;Leitung\nx@schule.example.org;N\n' })
  assert.equal(noDay.body.error, 'csv_invalid', `${noDay.status} ${JSON.stringify(noDay.body)}`)
  const planning = await get<PlanningResponse>(s, s.anna, `/api/admin/campaigns/${s.campaign}/planning`)
  assert.ok(planning.body.teachers.every((x) => x.days.every((d) => d.status === 'available')))
})

test('a teacher may not import or read the template; the organizer may', DB, async (t) => {
  const s = await school(t)
  const url = `/api/admin/campaigns/${s.campaign}/availability/import`
  assert.equal((await send(s, s.bernd, 'POST', `${url}/preview`, { csv: 'short_name;MO\nPfB;N\n' })).status, 403)
  assert.equal((await send(s, s.bernd, 'POST', url, { csv: 'short_name;MO\nPfB;N\n' })).status, 403)
  assert.equal((await s.app.inject({ method: 'GET', url: `${url}/template`, headers: { cookie: s.bernd.header() } })).statusCode, 403)
  assert.equal((await send(s, s.anna, 'POST', url, { csv: 'short_name;MO\nPfB;N\n' })).status, 200)
})
