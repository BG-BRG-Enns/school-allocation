// The availability import: a registration's teachers' days and notes from
// one CSV, matched by address or abbreviation, previewed, applied under
// the registration's lock and audited; what it refuses, and who may.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AvailabilityImportApplied, AvailabilityImportPreview, PlanningResponse } from '@school-allocation/api-contracts/planning'
import type { TeacherListApplied } from '@school-allocation/api-contracts/settings'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
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
  assert.deepEqual(preview.body.ignoredColumns, [], 'the Leitung column is read: N says who has no duty to lead')
  assert.deepEqual(preview.body.days, DAYS)
  assert.equal(preview.body.changedLeadDuty, 1)
  assert.deepEqual(preview.body.teachers.map((x) => x.leadDuty), [null, { before: true, after: false }, null])
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
  assert.equal(applied.body.changedLeadDuty, 1)
  const bernd = applied.body.planning.teachers.find((x) => x.displayName === BERND.name)
  assert.deepEqual([bernd?.shortName, bernd?.note, bernd?.leadDuty, bernd?.days.map((d) => d.status)], ['PfB', 'NUR RESERVE', false, ['if_needed', 'if_needed']])
  assert.equal(applied.body.planning.teachers.find((x) => x.displayName === CARLA.name)?.leadDuty, true, 'an empty Leitung cell: the duty')
  assert.deepEqual(applied.body.planning.teachers.find((x) => x.displayName === ANNA.name)?.days.map((d) => d.status), ['unavailable', 'available'])
  const actions = (await readAudit(s.db, s.campaign)).filter((e) => e.action.startsWith('availability.')).map((e) => [e.action, e.metadata.changedDays])
  assert.deepEqual(actions, [['availability.imported', 3]])

  // The same file again changes nothing.
  const again = await send<AvailabilityImportPreview>(s, s.anna, 'POST', `${url}/preview`, { csv: list })
  assert.equal(again.body.changedDays, 0)
  assert.equal(again.body.changedNotes, 0)
  assert.equal(again.body.changedLeadDuty, 0)
  // A Leitung cell that says something else is the row's problem; a file without the column leaves the duty as it is.
  const odd = await send<AvailabilityImportPreview>(s, s.anna, 'POST', `${url}/preview`, { csv: 'Name;MO;Leitung\nPfB;;vielleicht\n' })
  assert.deepEqual(odd.body.problems, [{ code: 'lead_duty_invalid', line: 2, key: 'vielleicht' }])
  const without = await send<AvailabilityImportPreview>(s, s.anna, 'POST', `${url}/preview`, { csv: 'Name;MO\nPfB;N\n' })
  assert.deepEqual([without.body.changedLeadDuty, without.body.teachers[0]?.leadDuty], [0, null])

  // The template carries the state: every teacher of the planning, by name, with address, abbreviation, days and note.
  const template = await s.app.inject({ method: 'GET', url: `${url}/template`, headers: { cookie: s.anna.header() } })
  assert.equal(template.statusCode, 200)
  assert.match(String(template.headers['content-type']), /^text\/csv/)
  assert.equal(template.body, [`email;short_name;${DAYS.join(';')};lead_duty;note`, `${ANNA.email};;N;;;`, `${BERND.email};PfB;F;F;N;NUR RESERVE`, `${CARLA.email};KnC;;;;`, ''].join('\r\n'), 'the duty to lead as the sheet says it: empty, or N for none')

  // A file with only the Monday column and an empty note clears Bernd's note and makes him available on Monday; Tuesday stays.
  const partial = await send<AvailabilityImportApplied>(s, s.anna, 'POST', url, { csv: 'short_name;2027-06-21;note\nPfB;;\n' })
  assert.equal(partial.status, 200, JSON.stringify(partial.body))
  const after = partial.body.planning.teachers.find((x) => x.displayName === BERND.name)
  assert.deepEqual([after?.note, after?.days.map((d) => d.status)], [null, ['available', 'if_needed']])
})

test('rows naming someone the registration does not know, an address and an abbreviation of two people, or a value none of the three are skipped and the rest applied; a file of such rows alone or without a day column is refused', DB, async (t) => {
  const s = await school(t)
  const url = `/api/admin/campaigns/${s.campaign}/availability/import`
  const list = [
    'email;Name;MO',
    `nobody@schule.example.org;;N`,
    `${SARA.email};;N`,
    `${ANNA.email};PfB;N`,
    `${CARLA.email};;vielleicht`,
    `;XyZ;N`,
    `${BERND.email};;N`,
  ].join('\n')
  const preview = await send<AvailabilityImportPreview>(s, s.anna, 'POST', `${url}/preview`, { csv: list })
  assert.equal(preview.status, 200)
  assert.deepEqual(preview.body.problems, [
    { code: 'status_invalid', line: 5, key: 'vielleicht' },
    { code: 'teacher_unknown', line: 2, key: 'nobody@schule.example.org' },
    { code: 'teacher_unknown', line: 3, key: SARA.email },
    { code: 'key_conflict', line: 4, key: `${ANNA.email} / PfB` },
    { code: 'short_name_unknown', line: 6, key: 'XyZ' },
  ])
  // Bernd's row is sound: the file applies, the five rows with a problem skipped.
  assert.equal(preview.body.applicable, true)
  assert.deepEqual(preview.body.teachers.map((x) => x.displayName), [BERND.name])
  const applied = await send<AvailabilityImportApplied>(s, s.anna, 'POST', url, { csv: list })
  assert.equal(applied.status, 200, JSON.stringify(applied.body))
  assert.equal(applied.body.skipped, 5)
  assert.equal(applied.body.changedDays, 1)
  const planning = await get<PlanningResponse>(s, s.anna, `/api/admin/campaigns/${s.campaign}/planning`)
  assert.deepEqual(planning.body.teachers.map((x) => [x.displayName, x.days.map((d) => d.status)]), [[ANNA.name, ['available', 'available']], [BERND.name, ['unavailable', 'available']], [CARLA.name, ['available', 'available']]])
  // A file whose rows all have a problem has nothing to apply.
  const refused = await send<{ error: string, problems: unknown[] }>(s, s.anna, 'POST', url, { csv: 'email;MO\nnobody@schule.example.org;N\n' })
  assert.equal(refused.status, 422)
  assert.equal(refused.body.error, 'availability_import_invalid')
  assert.equal(refused.body.problems.length, 1)
  // A file with the Leitung column alone says who has no duty to lead, so it is a file; one with the key column alone is not.
  const noDay = await send<{ error: string }>(s, s.anna, 'POST', url, { csv: 'email\nx@schule.example.org\n' })
  assert.equal(noDay.body.error, 'csv_file_invalid', `${noDay.status} ${JSON.stringify(noDay.body)}`)
  // A weekday none of the registration's days falls on names the days.
  const otherWeek = await send<AvailabilityImportPreview>(s, s.anna, 'POST', `${url}/preview`, { csv: 'Name;MO;MI\nPfB;;N\n' })
  assert.deepEqual(otherWeek.body.fileProblems, [{ code: 'unknown_column', column: 'MI', days: DAYS }])
})

test('an organizer sets one teacher\'s abbreviation beside the name; one another teacher holds is refused; the same again changes nothing; a teacher may not', DB, async (t) => {
  const s = await school(t)
  const planning = await get<PlanningResponse>(s, s.anna, `/api/admin/campaigns/${s.campaign}/planning`)
  const anna = planning.body.teachers.find((x) => x.displayName === ANNA.name)
  const bernd = planning.body.teachers.find((x) => x.displayName === BERND.name)
  assert.ok(anna && bernd)
  // The id in either case: PostgreSQL's lower case is what the stores key by.
  const set = await send<{ personId: string, shortName: string | null }>(s, s.anna, 'PUT', `/api/admin/teachers/${anna.personId.toUpperCase()}/short-name`, { shortName: 'ZwA' })
  assert.equal(set.status, 200, JSON.stringify(set.body))
  assert.deepEqual(set.body, { personId: anna.personId, shortName: 'ZwA' })
  const held = await send<{ error: string }>(s, s.anna, 'PUT', `/api/admin/teachers/${anna.personId}/short-name`, { shortName: 'pfb' })
  assert.equal(held.status, 409)
  assert.equal(held.body.error, 'short_name_held')
  assert.equal((await send(s, s.anna, 'PUT', `/api/admin/teachers/${anna.personId}/short-name`, { shortName: 'ZwA' })).status, 200)
  assert.equal((await send(s, s.anna, 'PUT', `/api/admin/teachers/${anna.personId}/short-name`, { shortName: '=x' })).status, 400)
  assert.equal((await send(s, s.anna, 'PUT', `/api/admin/teachers/00000000-0000-4000-8000-000000000000/short-name`, { shortName: 'NoN' })).status, 404)
  assert.equal((await send(s, s.bernd, 'PUT', `/api/admin/teachers/${anna.personId}/short-name`, { shortName: 'XX' })).status, 403)
  // One audit event for the change that wrote, none for the one that did not.
  const events = (await readAudit(s.db, SCHOOL_SCOPE)).filter((e) => e.action === 'teacher.short-name-changed')
  assert.equal(events.length, 1)
  assert.deepEqual(events[0]?.metadata, { personId: anna.personId, before: null, after: 'ZwA' })
  const after = await get<PlanningResponse>(s, s.anna, `/api/admin/campaigns/${s.campaign}/planning`)
  assert.equal(after.body.teachers.find((x) => x.displayName === ANNA.name)?.shortName, 'ZwA')
  // The duty to lead, beside it: set by an organizer, audited once per change, kept by the abbreviation's change, a teacher may not.
  assert.equal(after.body.teachers.find((x) => x.displayName === ANNA.name)?.leadDuty, true)
  const duty = await send<{ personId: string, leadDuty: boolean }>(s, s.anna, 'PUT', `/api/admin/teachers/${anna.personId.toUpperCase()}/lead-duty`, { leadDuty: false })
  assert.deepEqual([duty.status, duty.body], [200, { personId: anna.personId, leadDuty: false }])
  assert.equal((await send(s, s.anna, 'PUT', `/api/admin/teachers/${anna.personId}/lead-duty`, { leadDuty: false })).status, 200)
  assert.equal((await send(s, s.anna, 'PUT', `/api/admin/teachers/${anna.personId}/short-name`, { shortName: 'ZwE' })).status, 200)
  assert.equal((await send(s, s.bernd, 'PUT', `/api/admin/teachers/${anna.personId}/lead-duty`, { leadDuty: true })).status, 403)
  assert.equal((await send(s, s.anna, 'PUT', `/api/admin/teachers/00000000-0000-4000-8000-000000000000/lead-duty`, { leadDuty: false })).status, 404)
  const dutyEvents = (await readAudit(s.db, SCHOOL_SCOPE)).filter((e) => e.action === 'teacher.lead-duty-changed')
  assert.deepEqual(dutyEvents.map((e) => e.metadata), [{ personId: anna.personId, before: true, after: false }])
  const withDuty = await get<PlanningResponse>(s, s.anna, `/api/admin/campaigns/${s.campaign}/planning`)
  assert.deepEqual([withDuty.body.teachers.find((x) => x.displayName === ANNA.name)?.leadDuty, withDuty.body.teachers.find((x) => x.displayName === ANNA.name)?.shortName], [false, 'ZwE'])
  assert.equal((await send(s, s.anna, 'PUT', `/api/admin/teachers/${anna.personId}/short-name`, { shortName: null })).status, 200)
})

test('a teacher may not import or read the template; the organizer may', DB, async (t) => {
  const s = await school(t)
  const url = `/api/admin/campaigns/${s.campaign}/availability/import`
  assert.equal((await send(s, s.bernd, 'POST', `${url}/preview`, { csv: 'short_name;MO\nPfB;N\n' })).status, 403)
  assert.equal((await send(s, s.bernd, 'POST', url, { csv: 'short_name;MO\nPfB;N\n' })).status, 403)
  assert.equal((await s.app.inject({ method: 'GET', url: `${url}/template`, headers: { cookie: s.bernd.header() } })).statusCode, 403)
  assert.equal((await send(s, s.anna, 'POST', url, { csv: 'short_name;MO\nPfB;N\n' })).status, 200)
})
