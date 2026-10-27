// The roster from Entra groups through Graph, end to end against the
// stand-ins: the administrator labels groups, authorizes with their own
// token, the members become a pending batch, the commit pre-provisions
// every member by object id, and a member's first sign-in finds them
// without any matching. Paging, a missing address, a member in two groups
// and a refused Graph each do what the design says.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import type { Batch, BatchDetail } from '../lib/roster.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { CLASS_5A_GROUP, memberOf, TEACHERS_GROUP } from './helpers/fake-graph.ts'
import { withClient } from './helpers/db.ts'
import { DB, get, harness, me, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, CARLA, claimsOf, SARA, TIM, type Person } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const GROUPS = [
  { groupId: CLASS_5A_GROUP, label: '5A (2026/27)', kind: 'student', className: '5A', grade: 9 },
  { groupId: TEACHERS_GROUP, label: 'Lehrkräfte', kind: 'teacher' },
]

/** Plays the refresh: start, the administrator authorizing at the stand-in as `as`, and the callback; returns where the browser is sent. */
async function refresh(h: Harness, jar: CookieJar, as: Person = ANNA, schoolYear = '2026/27'): Promise<string> {
  const start = await h.app.inject({ method: 'GET', url: `/api/admin/roster/graph/start?schoolYear=${encodeURIComponent(schoolYear)}`, headers: { cookie: jar.header() } })
  assert.equal(start.statusCode, 302, start.body)
  jar.update(start)
  const location = new URL(start.headers.location as string)
  assert.match(location.searchParams.get('scope') ?? '', /openid https:\/\/graph\.microsoft\.com\/GroupMember\.Read\.All/)
  const callback = h.entra.authorize(location.toString(), { claims: claimsOf(as) })
  const response = await h.app.inject({ method: 'GET', url: callback, headers: { cookie: jar.header() } })
  assert.equal(response.statusCode, 303, response.body)
  jar.update(response)
  return response.headers.location as string
}

test('labelled groups are read with the administrator\'s token, committed as pre-provisioned persons, and a member\'s sign-in needs no matching', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  // Without groups there is nothing to read.
  assert.equal((await h.app.inject({ method: 'GET', url: '/api/admin/roster/graph/start?schoolYear=2026%2F27', headers: { cookie: anna.header() } })).statusCode, 409)

  const labelled = await send<{ groups: unknown[] }>(h, anna, 'PUT', '/api/admin/roster/groups', { groups: GROUPS })
  assert.equal(labelled.status, 200, JSON.stringify(labelled.body))
  assert.deepEqual(labelled.body.groups, GROUPS)
  assert.equal((await send(h, anna, 'PUT', '/api/admin/roster/groups', { groups: [{ groupId: TEACHERS_GROUP, label: 'x', kind: 'student' }] })).status, 422)
  assert.equal((await send(h, anna, 'PUT', '/api/admin/roster/groups', { groups: [GROUPS[1], GROUPS[1]] })).status, 422)

  h.graph.pageSize = 2
  const location = await refresh(h, anna)
  const batchId = /\/verwaltung\/stammdaten\/import\/([0-9a-f-]+)$/.exec(location)?.[1]
  assert.ok(batchId, location)
  // Two pages for the three teachers, one for the class.
  assert.equal(h.graph.requests.filter((r) => r.includes(TEACHERS_GROUP)).length, 2)
  assert.ok(h.graph.requests.every((r) => r.includes('$select=id,displayName,mail,userPrincipalName')))

  const batch = await get<BatchDetail>(h, anna, `/api/admin/roster/batches/${batchId}`)
  assert.equal(batch.body.state, 'pending')
  assert.equal(batch.body.source, 'graph:groups')
  assert.deepEqual(batch.body.summary, { added: 5, removed: 0, changed: 0, unchanged: 0 })
  assert.deepEqual(batch.body.diff.added.map((e) => [e.displayName, e.kind, e.className ?? null, e.oid]), [
    [SARA.name, 'student', '5A', SARA.oid], [TIM.name, 'student', '5A', TIM.oid],
    [ANNA.name, 'teacher', null, ANNA.oid], [BERND.name, 'teacher', null, BERND.oid], [CARLA.name, 'teacher', null, CARLA.oid],
  ])
  // The token was for this refresh alone: nothing of it is kept.
  const sessions = await withClient(h.ownerUrl, (c) => c.query<{ n: string }>('select count(*)::text as n from job where kind = \'roster_import_graph\' and outcome = \'succeeded\''))
  assert.equal(sessions.rows[0]?.n, '1')

  const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${batchId}/commit`)
  assert.equal(committed.status, 200)
  const bindings = await withClient(h.ownerUrl, (c) => c.query<{ method: string, n: string }>('select method, count(*)::text as n from identity_binding where unbound_at is null group by method'))
  assert.deepEqual(bindings.rows, [{ method: 'graph', n: '5' }])
  // Anna, signed in before the commit, is a person at the next request: the binding is by object id, no sign-in needed.
  assert.equal((await me(h, anna)).body.person?.kind, 'teacher')
  const sara = await signIn(h, { ...SARA, email: 'another.address@schule.example.org' })
  assert.deepEqual((await me(h, sara)).body.person?.className, '5A')

  // A second refresh with a changed class: same persons, one change, and the
  // member who left is gone from the roster in force.
  h.graph.groups.set(CLASS_5A_GROUP, [memberOf(SARA, { displayName: 'Sara S.' })])
  const second = /import\/([0-9a-f-]+)$/.exec(await refresh(h, anna, ANNA, '2027/28'))?.[1]
  const detail = await get<BatchDetail>(h, anna, `/api/admin/roster/batches/${second}`)
  assert.deepEqual(detail.body.summary, { added: 0, removed: 1, changed: 1, unchanged: 3 })
  await send(h, anna, 'POST', `/api/admin/roster/batches/${second}/commit`)
  const persons = await withClient(h.ownerUrl, (c) => c.query<{ n: string }>('select count(*)::text as n from person'))
  assert.equal(persons.rows[0]?.n, '5')
  const tim = await signIn(h, TIM)
  assert.equal((await me(h, tim)).body.person?.kind, null)
})

test('a member without an address is a warning, a member in two groups rejects the batch, and a refused Graph is reported', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  await send(h, anna, 'PUT', '/api/admin/roster/groups', { groups: GROUPS })

  h.graph.groups.set(CLASS_5A_GROUP, [memberOf(SARA, { mail: undefined, userPrincipalName: undefined }), { id: 'not-a-guid', displayName: 'Device', type: '#microsoft.graph.device' }])
  const first = /import\/([0-9a-f-]+)$/.exec(await refresh(h, anna))?.[1]
  const batch = await get<BatchDetail>(h, anna, `/api/admin/roster/batches/${first}`)
  assert.equal(batch.body.state, 'pending')
  assert.deepEqual(batch.body.warnings, [{ code: 'no_address', key: SARA.oid }])
  assert.equal(batch.body.diff.added.length, 4, 'the device is not a member of the roster')

  h.graph.groups.set(CLASS_5A_GROUP, [memberOf(SARA), memberOf(BERND)])
  const rejected = /import\/([0-9a-f-]+)$/.exec(await refresh(h, anna))?.[1]
  const detail = await get<BatchDetail>(h, anna, `/api/admin/roster/batches/${rejected}`)
  assert.equal(detail.body.state, 'rejected')
  assert.deepEqual(detail.body.problems, [{ code: 'both_kinds', key: BERND.oid }])

  h.graph.failWith = 403
  assert.equal(await refresh(h, anna), '/verwaltung/stammdaten?fehler=graph_forbidden')
  h.graph.failWith = 500
  assert.equal(await refresh(h, anna), '/verwaltung/stammdaten?fehler=graph_failed')
  h.graph.failWith = undefined
  const batches = await get<{ batches: Batch[] }>(h, anna, '/api/admin/roster')
  assert.deepEqual(batches.body.batches.map((b) => b.state), ['rejected', 'pending'])
})

test('the Graph token must be the signed-in administrator\'s own, from a refresh this browser started', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  await send(h, anna, 'PUT', '/api/admin/roster/groups', { groups: GROUPS })
  // Someone else's token, obtained in Anna's browser: refused, and nothing read.
  assert.equal(await refresh(h, anna, BERND), '/verwaltung/stammdaten?fehler=graph_authorization_failed')
  assert.deepEqual(h.graph.requests, [])

  // A callback without a start: refused.
  const foreign = await h.app.inject({ method: 'GET', url: '/api/admin/roster/graph/callback?code=x&state=y', headers: { cookie: anna.header() } })
  assert.equal(foreign.statusCode, 303)
  assert.equal(foreign.headers.location, '/verwaltung/stammdaten?fehler=state_mismatch')
  // A teacher cannot start one.
  const bernd = await signIn(h, BERND)
  assert.equal((await h.app.inject({ method: 'GET', url: '/api/admin/roster/graph/start?schoolYear=2026%2F27', headers: { cookie: bernd.header() } })).statusCode, 403)
  assert.equal((await h.app.inject({ method: 'GET', url: '/api/admin/roster/graph/start?schoolYear=2026%2F27' })).statusCode, 401)
})

export type { FastifyInstance }
