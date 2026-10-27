// The roster from a CSV, end to end on a real database: an administrator
// uploads, sees the diff, commits; a person of the roster is bound at
// their first sign-in by their address and nobody else is; the next upload
// keeps the persons; a batch that is not a roster is rejected with why.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { verifyAuditChain } from '../lib/audit-chain.ts'
import { createDatabase } from '../lib/db.ts'
import type { Batch, BatchDetail } from '../lib/roster.ts'
import { withClient } from './helpers/db.ts'
import { DB, get, harness, me, send, signIn } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const HEADER = 'email;given_name;family_name;class;grade;kind;class_teacher_email'
const row = (email: string | undefined, name: string, klass: string, grade: string, kind: string, kv = '') => `${email ?? ''};${name.split(' ')[0]};${name.split(' ').slice(1).join(' ')};${klass};${grade};${kind};${kv}`

const ROSTER_1 = [
  HEADER,
  row(SARA.email, SARA.name, '5A', '9', 'student', ANNA.email),
  row(TIM.email?.toUpperCase(), TIM.name, '5A', '9', 'Schüler'),
  row(ANNA.email, ANNA.name, '', '', 'teacher'),
  row(BERND.email, BERND.name, '', '', 'Lehrkraft'),
].join('\r\n')

test('a CSV becomes a pending batch with its diff, the commit makes it the roster, and the next sign-ins are bound by address', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)

  const created = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv: ROSTER_1, schoolYear: '2026/27' })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  assert.equal(created.body.state, 'pending')
  assert.equal(created.body.source, 'csv')
  assert.deepEqual(created.body.summary, { added: 4, removed: 0, changed: 0, unchanged: 0 })
  assert.deepEqual(created.body.diff.added.map((e) => [e.displayName, e.kind, e.className ?? null, e.grade ?? null]), [
    [SARA.name, 'student', '5A', 9], [TIM.name, 'student', '5A', 9], [ANNA.name, 'teacher', null, null], [BERND.name, 'teacher', null, null],
  ])
  assert.equal(created.body.diff.added[0]?.classTeacherMail, ANNA.email)
  // Nothing is in force yet: the roster page says so, and a sign-in binds nobody.
  const overview = await get<{ current: Batch | null, batches: Batch[] }>(h, anna, '/api/admin/roster')
  assert.equal(overview.body.current, null)
  assert.equal(overview.body.batches.length, 1)
  const saraEarly = await signIn(h, SARA)
  assert.equal((await me(h, saraEarly)).body.person, null)

  const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${created.body.id}/commit`)
  assert.equal(committed.status, 200, JSON.stringify(committed.body))
  assert.equal(committed.body.state, 'committed')
  assert.ok(committed.body.diff.added.every((e) => e.personId !== null))
  assert.equal((await send(h, anna, 'POST', `/api/admin/roster/batches/${created.body.id}/commit`)).status, 409)
  assert.equal((await get<{ current: Batch | null }>(h, anna, '/api/admin/roster')).body.current?.id, created.body.id)

  // Sara's existing session is bound at her next sign-in, not before: the
  // binding is a sign-in step. Tim's address differs in case only.
  assert.equal((await me(h, saraEarly)).body.person, null)
  const sara = await signIn(h, SARA)
  assert.deepEqual((await me(h, sara)).body.person, { id: personIdOf(committed.body, SARA.name), kind: 'student', className: '5A', grade: 9 })
  const tim = await signIn(h, TIM)
  assert.equal((await me(h, tim)).body.person?.className, '5A')
  // Anna was signed in before the commit; her next sign-in binds her too.
  assert.equal((await me(h, anna)).body.person, null)
  const annaAgain = await signIn(h, ANNA)
  assert.equal((await me(h, annaAgain)).body.person?.kind, 'teacher')
  // Carla is nobody's entry: she stays unbound and is listed for the administrator.
  const carla = await signIn(h, CARLA)
  assert.equal((await me(h, carla)).body.person, null)
  const unbound = await get<{ users: { displayName: string, person: unknown }[] }>(h, anna, '/api/admin/users?unbound=true')
  assert.deepEqual(unbound.body.users.map((u) => u.displayName).sort(), [CARLA.name])

  // Signing in again binds nothing more, and the binding stays with the
  // identity: Sara, Tim and Anna are bound, Bernd has not signed in yet.
  await signIn(h, SARA)
  const bindings = await withClient(h.ownerUrl, (c) => c.query<{ method: string, n: string }>('select method, count(*)::text as n from identity_binding where unbound_at is null group by method'))
  assert.deepEqual(bindings.rows, [{ method: 'email_match', n: '3' }])

  const db = createDatabase(h.ownerUrl, () => {})
  t.after(() => db.close())
  const events = await readAudit(db, SCHOOL_SCOPE)
  assert.deepEqual(events.map((e) => e.action), ['admin.bootstrapped', 'roster.imported', 'identity.bound', 'identity.bound', 'identity.bound'])
  assert.equal(events[1]?.metadata.rowCount, 4)
  assert.equal(events[2]?.actor.oid, SARA.oid)
  assert.equal(events[2]?.metadata.method, 'email_match')
  assert.equal(verifyAuditChain(events).valid, true)
})

test('the next batch keeps the persons, shows what changed, and a person who left is no longer in the roster in force', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const first = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv: ROSTER_1, schoolYear: '2026/27' })
  await send(h, anna, 'POST', `/api/admin/roster/batches/${first.body.id}/commit`)
  const sara = await signIn(h, SARA)
  const tim = await signIn(h, TIM)
  const saraPerson = (await me(h, sara)).body.person?.id

  const second = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', {
    csv: [HEADER, row(SARA.email, 'Sara Schülerin-Neu', '6A', '10', 'student'), row(ANNA.email, ANNA.name, '', '', 'teacher'), row(CARLA.email, CARLA.name, '', '', 'teacher')].join('\n'),
    schoolYear: '2027/28',
  })
  assert.equal(second.status, 201)
  assert.deepEqual(second.body.summary, { added: 1, removed: 2, changed: 1, unchanged: 1 })
  assert.deepEqual(second.body.diff.changed[0]?.fields, ['displayName', 'className', 'grade', 'classTeacherMail'])
  assert.deepEqual(second.body.diff.removed.map((e) => e.displayName).sort(), [BERND.name, TIM.name])
  // Still the first roster until the commit.
  assert.equal((await me(h, sara)).body.person?.className, '5A')

  const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${second.body.id}/commit`)
  assert.equal(committed.status, 200)
  assert.equal(personIdOf(committed.body, 'Sara Schülerin-Neu'), saraPerson, 'the same key is the same person')
  assert.deepEqual((await me(h, sara)).body.person, { id: saraPerson, kind: 'student', className: '6A', grade: 10 })
  // Tim's binding stands, but the roster in force does not list him.
  const timNow = (await me(h, tim)).body.person
  assert.ok(timNow)
  assert.equal(timNow.kind, null)
  // Carla, new in the second batch, is bound at her next sign-in.
  assert.equal((await me(h, await signIn(h, CARLA))).body.person?.kind, 'teacher')
  const persons = await withClient(h.ownerUrl, (c) => c.query<{ n: string }>('select count(*)::text as n from person'))
  assert.equal(persons.rows[0]?.n, '5')
})

test('a person missing from one batch and back in the next is the same person, and their account finds them again', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const upload = async (csv: string) => {
    const batch = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
    assert.equal((await send(h, anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)).status, 200)
  }
  await upload(ROSTER_1)
  const sara = await signIn(h, SARA)
  const saraPerson = (await me(h, sara)).body.person?.id
  assert.ok(saraPerson)

  await upload([HEADER, row(ANNA.email, ANNA.name, '', '', 'teacher')].join('\n'))
  assert.equal((await me(h, sara)).body.person?.kind, null)
  await upload(ROSTER_1)
  assert.deepEqual((await me(h, sara)).body.person, { id: saraPerson, kind: 'student', className: '5A', grade: 9 })
  const persons = await withClient(h.ownerUrl, (c) => c.query<{ n: string }>('select count(*)::text as n from person'))
  assert.equal(persons.rows[0]?.n, '4')
})

test('a batch that is not a roster is stored as rejected with the problems; a file that is not a roster CSV is refused outright', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const rejected = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', {
    csv: [HEADER, row(SARA.email, SARA.name, '5A', '9', 'student'), row(SARA.email?.toUpperCase(), SARA.name, '', '', 'teacher'), row(TIM.email, TIM.name, '5A', 'neun', 'student')].join('\n'),
    schoolYear: '2026/27',
  })
  assert.equal(rejected.status, 201)
  assert.equal(rejected.body.state, 'rejected')
  assert.deepEqual(rejected.body.problems, [
    { code: 'invalid_grade', line: 4 },
    { code: 'student_without_class', key: TIM.email },
    { code: 'both_kinds', key: SARA.email },
  ])
  assert.equal((await send(h, anna, 'POST', `/api/admin/roster/batches/${rejected.body.id}/commit`)).status, 409)
  assert.equal((await send(h, anna, 'POST', `/api/admin/roster/batches/${rejected.body.id}/discard`)).status, 409)
  // Text PostgreSQL could not hold (NUL, a lone surrogate) is a row's problem, not a server error.
  const unholdable = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', {
    csv: [
      HEADER,
      row(SARA.email, 'Sa\u0000ra Schülerin', '5A', '9', 'student'),
      row(TIM.email, 'Tim \uD800Schüler', '5A', '9', 'student'),
      row('bernd\u0000@schule.example.org', BERND.name, '', '', 'teacher'),
    ].join('\n'),
    schoolYear: '2026/27',
  })
  assert.equal(unholdable.status, 201, `${JSON.stringify(unholdable.body)}\n${h.logs()}`)
  assert.equal(unholdable.body.state, 'rejected')
  assert.deepEqual(unholdable.body.problems.map((p) => [p.code, p.key]), [
    ['invalid_name', SARA.email], ['invalid_name', TIM.email], ['invalid_address', 'bernd@schule.example.org'],
  ])

  const invalid = await send<{ error: string, message: string }>(h, anna, 'POST', '/api/admin/roster/csv', { csv: 'name;phone\nA;1', schoolYear: '2026/27' })
  assert.equal(invalid.status, 422)
  assert.equal(invalid.body.error, 'csv_invalid')
  assert.equal((await send(h, anna, 'POST', '/api/admin/roster/csv', { csv: ROSTER_1, schoolYear: '2026/28' })).status, 422)
  assert.equal((await send(h, anna, 'POST', '/api/admin/roster/csv', { csv: ROSTER_1, schoolYear: '2026/27', extra: 1 })).status, 400)
})

test('a pending batch whose diff went stale cannot be committed; a discarded one changes nothing; only administrators get in', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const a = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv: ROSTER_1, schoolYear: '2026/27' })
  const b = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv: ROSTER_1, schoolYear: '2026/27' })
  assert.equal((await send(h, anna, 'POST', `/api/admin/roster/batches/${a.body.id}/commit`)).status, 200)
  const stale = await send<{ error: string }>(h, anna, 'POST', `/api/admin/roster/batches/${b.body.id}/commit`)
  assert.equal(stale.status, 409)
  assert.equal(stale.body.error, 'batch_superseded')
  const discarded = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${b.body.id}/discard`)
  assert.equal(discarded.status, 200)
  assert.equal(discarded.body.state, 'discarded')
  assert.equal((await get<{ current: Batch | null }>(h, anna, '/api/admin/roster')).body.current?.id, a.body.id)
  assert.equal((await get(h, anna, '/api/admin/roster/batches/00000000-0000-4000-8000-000000000000')).status, 404)

  const bernd = await signIn(h, BERND)
  assert.equal((await get(h, bernd, '/api/admin/roster')).status, 403)
  assert.equal((await send(h, bernd, 'POST', '/api/admin/roster/csv', { csv: ROSTER_1, schoolYear: '2026/27' })).status, 403)
  assert.equal((await get(h, bernd, `/api/admin/roster/batches/${a.body.id}`)).status, 403)
  assert.equal((await get(h, undefined, '/api/admin/roster')).status, 401)
  // The template is a file, for administrators.
  const template = await h.app.inject({ method: 'GET', url: '/api/admin/roster/csv/template', headers: { cookie: anna.header() } })
  assert.equal(template.statusCode, 200)
  assert.match(template.headers['content-type'] as string, /^text\/csv/)
  assert.match(template.body, /^email;given_name;family_name;class;grade;kind;class_teacher_email\r\n/)
})

test('an administrator binds an unmatched account to a person, and rebinding closes the old binding, all audited', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const batch = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv: ROSTER_1, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  const timPerson = personIdOf(committed.body, TIM.name)
  const saraPerson = personIdOf(committed.body, SARA.name)

  // Carla signs in with an address the roster does not have; the administrator
  // finds her among the unbound accounts and the persons without an account.
  const carla = await signIn(h, CARLA)
  const carlaId = (await me(h, carla)).body.id
  const persons = await get<{ persons: { personId: string, displayName: string, account: string | null }[] }>(h, anna, `/api/admin/roster/persons?q=${encodeURIComponent('schüler')}`)
  assert.deepEqual(persons.body.persons.map((p) => [p.displayName, p.account]), [[SARA.name, null], [TIM.name, null]])
  // Anna signed in before the commit; once she signs in again, her account shows on her entry.
  await signIn(h, ANNA)
  const everyone = await get<{ persons: { displayName: string, account: string | null }[] }>(h, anna, '/api/admin/roster/persons')
  assert.deepEqual(everyone.body.persons.map((p) => p.account), [null, null, ANNA.name, null])

  const bound = await send(h, anna, 'POST', '/api/admin/bindings', { userId: carlaId, personId: timPerson, reason: 'Tim meldet sich mit dem Konto von Carla an (Test)' })
  assert.equal(bound.status, 204, JSON.stringify(bound.body))
  assert.deepEqual((await me(h, carla)).body.person, { id: timPerson, kind: 'student', className: '5A', grade: 9 })
  assert.equal((await send(h, anna, 'POST', '/api/admin/bindings', { userId: carlaId, personId: timPerson, reason: 'noch einmal' })).status, 409)

  // Tim's own sign-in no longer finds his entry: it is bound to another account.
  const tim = await signIn(h, TIM)
  assert.equal((await me(h, tim)).body.person, null)
  // Rebinding Carla's account to Sara's person closes both the account's and the person's bindings first.
  const sara = await signIn(h, SARA)
  assert.equal((await me(h, sara)).body.person?.id, saraPerson)
  assert.equal((await send(h, anna, 'POST', '/api/admin/bindings', { userId: carlaId, personId: saraPerson, reason: 'Korrektur' })).status, 204)
  assert.equal((await me(h, carla)).body.person?.id, saraPerson)
  assert.equal((await me(h, sara)).body.person, null)
  assert.equal((await send(h, anna, 'POST', '/api/admin/bindings', { userId: carlaId, personId: '00000000-0000-4000-8000-000000000000', reason: 'x' })).status, 404)
  assert.equal((await send(h, anna, 'POST', '/api/admin/bindings', { userId: carlaId, personId: saraPerson })).status, 400)

  const db = createDatabase(h.ownerUrl, () => {})
  t.after(() => db.close())
  const events = await readAudit(db, SCHOOL_SCOPE)
  const actions = events.map((e) => e.action)
  assert.deepEqual(actions.filter((a) => a.startsWith('identity.')), [
    'identity.bound', // Anna, at her second sign-in
    'identity.bound', // Carla's account → Tim's person, by the administrator
    'identity.bound', // Sara, at sign-in
    'identity.unbound', 'identity.unbound', 'identity.bound', // the rebind
  ])
  assert.equal(events.find((e) => e.action === 'identity.bound' && e.metadata.method === 'admin')?.actor.oid, ANNA.oid)
  assert.equal(verifyAuditChain(events).valid, true)
  const open = await withClient(h.ownerUrl, (c) => c.query<{ n: string }>('select count(*)::text as n from identity_binding where unbound_at is null'))
  assert.equal(open.rows[0]?.n, '2')
})

function personIdOf(batch: BatchDetail, displayName: string): string {
  const entry = [...batch.diff.added, ...batch.diff.changed.map((c) => c.after)].find((e) => e.displayName === displayName)
  assert.ok(entry?.personId, `${displayName} has a person`)
  return entry.personId
}
