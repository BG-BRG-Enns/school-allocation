// The teacher list import: abbreviations and class teachers from one CSV,
// matched against the roster in force, previewed, applied under the
// school's lock and audited; what it refuses, and who may.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TeacherListApplied, TeacherListPreview } from '@school-allocation/api-contracts/settings'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import type { ClassWithTeachers } from '../lib/models/class-teachers.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import { DB, get, harness, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }

type Ready = Harness & { anna: Awaited<ReturnType<typeof signIn>>, bernd: Awaited<ReturnType<typeof signIn>>, berndPerson: string, carlaPerson: string }

/** A school with a roster in force: Sara and Tim in 5A (Carla named as their class teacher by the CSV), Anna, Bernd and Carla teachers. */
async function school(t: Parameters<typeof harness>[0]): Promise<Ready> {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind;class_teacher_email',
    `${SARA.email};Sara;Pfnäxthuber;5A;9;student;${CARLA.email}`, `${TIM.email};Tim;Gnöxwieser;5A;9;student;${CARLA.email}`,
    `${ANNA.email};Anna;Zwexmhofer;;;teacher;`, `${BERND.email};Bernd;Pfnöxlhofer;;;teacher;`, `${CARLA.email};Carla;Knoxbrunner;;;teacher;`,
  ].join('\n')
  const batch = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  assert.equal(committed.status, 200, JSON.stringify(committed.body))
  const person = (name: string) => committed.body.diff.added.find((e) => e.displayName === name)?.personId ?? ''
  await signIn(h, CARLA)
  return { ...h, anna: await signIn(h, ANNA), bernd: await signIn(h, BERND), berndPerson: person(BERND.name), carlaPerson: person(CARLA.name) }
}

test('a teacher list is previewed as what it changes, applied with the abbreviations and class teachers, audited; the template is today\'s state', DB, async (t) => {
  const s = await school(t)
  // The school's own list, with its header names and a column nobody reads; Bernd becomes 5A's class teacher, everyone gets an abbreviation.
  const list = [
    'Name;Longname;Address Email;Kv Von',
    `ZwA;Zwexmhofer;${(ANNA.email ?? '').toUpperCase()};`,
    `PfB;Pfnöxlhofer;${BERND.email};5A`,
    `KnC;Knoxbrunner;${CARLA.email};`,
  ].join('\r\n')
  const preview = await send<TeacherListPreview>(s, s.anna, 'POST', '/api/admin/classes/import/preview', { csv: list })
  assert.equal(preview.status, 200, JSON.stringify(preview.body))
  assert.deepEqual(preview.body.problems, [])
  assert.deepEqual(preview.body.ignoredColumns, ['Longname'])
  assert.deepEqual(preview.body.teachers.map((x) => [x.displayName, x.shortName]), [[ANNA.name, { before: null, after: 'ZwA' }], [BERND.name, { before: null, after: 'PfB' }], [CARLA.name, { before: null, after: 'KnC' }]])
  assert.deepEqual(preview.body.classes, [{ className: '5A', before: [], after: [{ personId: s.berndPerson, displayName: BERND.name }] }])
  assert.equal(preview.body.applicable, true)
  // Nothing is written by a preview.
  assert.deepEqual((await get<{ classes: ClassWithTeachers[] }>(s, s.anna, '/api/admin/classes')).body.classes[0]?.teachers.map((x) => x.source), ['roster'])

  const applied = await send<TeacherListApplied>(s, s.anna, 'POST', '/api/admin/classes/import', { csv: list })
  assert.equal(applied.status, 200, JSON.stringify(applied.body))
  assert.equal(applied.body.shortNames, 3)
  assert.equal(applied.body.classesChanged, 1)
  const fiveA = applied.body.classes.find((c) => c.className === '5A')
  assert.deepEqual(fiveA?.teachers.map((x) => [x.displayName, x.shortName, x.source]).sort(), [[BERND.name, 'PfB', 'app'], [CARLA.name, 'KnC', 'roster']])
  // The abbreviation finds the teacher, in any case of the letters, and comes with the name.
  const found = await get<{ teachers: { displayName: string, shortName: string | null }[] }>(s, s.anna, '/api/admin/classes/teachers?q=pfb')
  assert.deepEqual(found.body.teachers, [{ personId: s.berndPerson, displayName: BERND.name, shortName: 'PfB' }])
  const actions = (await readAudit(s.db, SCHOOL_SCOPE)).map((e) => e.action)
  assert.ok(actions.includes('class.teachers-imported') && actions.includes('class.teachers-changed'))

  // The same file again changes nothing: no class is rewritten, no abbreviation reported as new.
  const again = await send<TeacherListPreview>(s, s.anna, 'POST', '/api/admin/classes/import/preview', { csv: list })
  assert.deepEqual(again.body.teachers.map((x) => x.shortName), [null, null, null])
  assert.deepEqual(again.body.classes, [{ className: '5A', before: [{ personId: s.berndPerson, displayName: BERND.name }], after: [{ personId: s.berndPerson, displayName: BERND.name }] }])
  const same = await send<TeacherListApplied>(s, s.anna, 'POST', '/api/admin/classes/import', { csv: list })
  assert.equal(same.body.classesChanged, 0)

  // Two teachers exchange their abbreviations in one file: released first, then given, so the unique index is not met.
  const swapped = await send<TeacherListApplied>(s, s.anna, 'POST', '/api/admin/classes/import', { csv: `email;short_name\n${BERND.email};KnC\n${CARLA.email};PfB\n` })
  assert.equal(swapped.status, 200, JSON.stringify(swapped.body))
  assert.deepEqual((await get<{ teachers: { displayName: string, shortName: string | null }[] }>(s, s.anna, '/api/admin/classes/teachers?q=knc')).body.teachers.map((x) => x.displayName), [BERND.name])
  assert.equal((await send(s, s.anna, 'POST', '/api/admin/classes/import', { csv: `email;short_name\n${BERND.email};PfB\n${CARLA.email};KnC\n` })).status, 200)

  // The template carries the state: every teacher, the abbreviations, Bernd's class.
  const template = await s.app.inject({ method: 'GET', url: '/api/admin/classes/import/template', headers: { cookie: s.anna.header() } })
  assert.equal(template.statusCode, 200)
  assert.match(String(template.headers['content-type']), /^text\/csv/)
  assert.equal(template.body, ['email;short_name;class', `${ANNA.email};ZwA;`, `${BERND.email};PfB;5A`, `${CARLA.email};KnC;`, ''].join('\r\n'))

  // A file naming 5A without Bernd takes him out again; Carla stays as the roster says.
  const without = await send<TeacherListApplied>(s, s.anna, 'POST', '/api/admin/classes/import', { csv: `email;class\n${ANNA.email};5A\n` })
  assert.equal(without.status, 200, JSON.stringify(without.body))
  assert.deepEqual(without.body.classes.find((c) => c.className === '5A')?.teachers.map((x) => [x.displayName, x.source]).sort(), [[ANNA.name, 'app'], [CARLA.name, 'roster']])
})

test('a list with an unknown address, an unknown class or an abbreviation another teacher holds is not applied; its problems name the lines; the file itself is refused when it has no address column', DB, async (t) => {
  const s = await school(t)
  assert.equal((await send(s, s.anna, 'POST', '/api/admin/classes/import', { csv: `email;short_name\n${CARLA.email};KnC\n` })).status, 200)
  const list = [
    'email;short_name;class',
    `${ANNA.email};KnC;`,
    `nobody@schule.example.org;NoN;`,
    `${SARA.email};PfS;`,
    `${BERND.email};PfB;6A`,
  ].join('\n')
  const preview = await send<TeacherListPreview>(s, s.anna, 'POST', '/api/admin/classes/import/preview', { csv: list })
  assert.equal(preview.status, 200)
  assert.deepEqual(preview.body.problems, [
    { code: 'teacher_unknown', line: 3, key: 'nobody@schule.example.org' },
    { code: 'teacher_unknown', line: 4, key: SARA.email },
    { code: 'class_unknown', line: 5, key: '6A' },
    { code: 'short_name_held', line: 2, key: 'KnC' },
  ])
  assert.equal(preview.body.applicable, false)
  // Two abbreviations for one teacher, one abbreviation for two: judged after the addresses are resolved.
  const disagreeing = await send<TeacherListPreview>(s, s.anna, 'POST', '/api/admin/classes/import/preview', { csv: `email;short_name\n${BERND.email};PfB\n${BERND.email};PfX\n${ANNA.email};pfb\n` })
  assert.deepEqual(disagreeing.body.problems, [
    { code: 'short_name_inconsistent', line: 3, key: BERND.email },
    { code: 'short_name_taken', line: 4, key: 'pfb' },
  ])
  const refused = await send<{ error: string, problems: unknown[] }>(s, s.anna, 'POST', '/api/admin/classes/import', { csv: list })
  assert.equal(refused.status, 422)
  assert.equal(refused.body.error, 'teacher_list_invalid')
  assert.equal(refused.body.problems.length, 4)
  const noAddress = await send<{ error: string }>(s, s.anna, 'POST', '/api/admin/classes/import', { csv: 'short_name;class\nZwA;5A\n' })
  assert.equal(noAddress.body.error, 'csv_invalid', `${noAddress.status} ${JSON.stringify(noAddress.body)}`)
  // Nothing of it was written.
  assert.deepEqual((await get<{ teachers: { shortName: string | null }[] }>(s, s.anna, '/api/admin/classes/teachers?q=Zwex')).body.teachers.map((x) => x.shortName), [null])
})

test('a teacher may not import or read the template; an organizer who is no administrator may', DB, async (t) => {
  const s = await school(t)
  assert.equal((await send(s, s.bernd, 'POST', '/api/admin/classes/import/preview', { csv: 'email\nx@schule.example.org\n' })).status, 403)
  assert.equal((await send(s, s.bernd, 'POST', '/api/admin/classes/import', { csv: 'email\nx@schule.example.org\n' })).status, 403)
  assert.equal((await s.app.inject({ method: 'GET', url: '/api/admin/classes/import/template', headers: { cookie: s.bernd.header() } })).statusCode, 403)
  const accounts = await get<{ users: { id: string, displayName: string }[] }>(s, s.anna, '/api/admin/users?q=Carla')
  const carlaUser = accounts.body.users.find((u) => u.displayName === CARLA.name)?.id ?? ''
  assert.equal((await send(s, s.anna, 'POST', '/api/admin/roles', { userId: carlaUser, role: 'campaign_organizer', reason: 'organizes' })).status, 201)
  const organizer = await signIn(s, CARLA)
  const applied = await send<TeacherListApplied>(s, organizer, 'POST', '/api/admin/classes/import', { csv: `email;short_name\n${CARLA.email};KnC\n` })
  assert.equal(applied.status, 200, JSON.stringify(applied.body))
  assert.equal((await s.app.inject({ method: 'GET', url: '/api/admin/classes/import/template', headers: { cookie: organizer.header() } })).statusCode, 200)
})
