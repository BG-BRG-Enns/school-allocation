// The roster from Entra groups through Graph, end to end against the
// stand-ins: the administrator labels groups, authorizes with their own
// token, the members become a pending batch, the commit pre-provisions
// every member by object id, and a member's first sign-in finds them
// without any matching. Paging, a missing address, a member in two groups
// and a refused Graph each do what the design says.

import type { FastifyInstance } from 'fastify'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Batch, BatchDetail } from '../lib/models/roster.ts'
import { withClient } from './helpers/db.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { CLASS_5A_GROUP, memberOf, TEACHERS_GROUP } from './helpers/fake-graph.ts'
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
  assert.match(location.searchParams.get('scope') ?? '', /openid profile https:\/\/graph\.microsoft\.com\/GroupMember\.Read\.All https:\/\/graph\.microsoft\.com\/User\.ReadBasic\.All/)
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

  // The class holds Sara directly and Tim through a nested group, as a school's 3A is made of 3AR and 3AG.
  const nested = '77777777-7777-4777-8777-777777777777'
  h.graph.groups.set(nested, [memberOf(TIM)])
  h.graph.groups.set(CLASS_5A_GROUP, [memberOf(SARA), { id: nested, displayName: '5A Gruppe', type: '#microsoft.graph.group' }])
  h.graph.pageSize = 2
  const location = await refresh(h, anna)
  const batchId = /\/verwaltung\/stammdaten\/import\/([0-9a-f-]+)$/.exec(location)?.[1]
  assert.ok(batchId, location)
  // Two pages for the three teachers, two for the class (Sara, the nested group, Tim); nested groups flattened by Graph.
  assert.equal(h.graph.requests.filter((r) => r.includes(TEACHERS_GROUP)).length, 2)
  assert.equal(h.graph.requests.filter((r) => r.includes(`${CLASS_5A_GROUP}/transitiveMembers`)).length, 2)
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

test('a Graph roster after a CSV roster keeps the persons and binds them; a member whose object id changed is a new person', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  await send(h, anna, 'PUT', '/api/admin/roster/groups', { groups: GROUPS })
  const csv = ['email;given_name;family_name;class;grade;kind', `${SARA.email};Sara;Pfnäxthuber;5A;9;student`, `${TIM.email};Tim;Gnöxwieser;5A;9;student`, `${ANNA.email};Anna;Zwexmhofer;;;teacher`].join('\n')
  const first = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  await send(h, anna, 'POST', `/api/admin/roster/batches/${first.body.id}/commit`)
  // Sara signs in and is bound by address; Tim never does.
  const sara = await signIn(h, SARA)
  const saraPerson = (await me(h, sara)).body.person?.id
  const committedFirst = await get<BatchDetail>(h, anna, `/api/admin/roster/batches/${first.body.id}`)
  const timPersonId = committedFirst.body.diff.added.find((e) => e.displayName === TIM.name)?.personId
  assert.ok(timPersonId)

  // Sara, Tim and Anna are found by address; Bernd and Carla are new.
  const refreshed = /import\/([0-9a-f-]+)$/.exec(await refresh(h, anna))?.[1]
  const detail = await get<BatchDetail>(h, anna, `/api/admin/roster/batches/${refreshed}`)
  assert.deepEqual(detail.body.summary, { added: 2, removed: 0, changed: 0, unchanged: 3 })
  const committed = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${refreshed}/commit`)
  assert.equal(committed.status, 200)
  const person = (name: string) => [...committed.body.diff.added, ...committed.body.diff.changed.map((c) => c.after)].find((e) => e.displayName === name)?.personId
  // Unchanged entries are not in the diff; the roster persons tell.
  const persons = await get<{ persons: { displayName: string, personId: string, account: string | null }[] }>(h, anna, '/api/admin/roster/persons')
  const byName = new Map(persons.body.persons.map((p) => [p.displayName, p]))
  assert.equal(byName.get(SARA.name)?.personId, saraPerson, 'Sara is the same person')
  assert.equal(byName.get(TIM.name)?.personId, timPersonId, 'Tim is the same person, though he never signed in')
  assert.ok(person(BERND.name) && person(CARLA.name))
  // Everyone is bound by object id now: Tim's CSV person got his Graph identity.
  const bindings = await withClient(h.ownerUrl, (c) => c.query<{ method: string, n: string }>('select method, count(*)::text as n from identity_binding where unbound_at is null group by method order by method'))
  assert.deepEqual(bindings.rows, [{ method: 'email_match', n: '1' }, { method: 'graph', n: '4' }])
  const tim = await signIn(h, { ...TIM, email: 'tim.neu@schule.example.org' })
  assert.equal((await me(h, tim)).body.person?.id, timPersonId)

  // Sara's account is recreated: a new object id at her address. That is a
  // new person; the old one keeps its binding until an administrator rebinds.
  const SARA_2 = { ...SARA, oid: 'd2000000-0000-4000-8000-00000000000d' }
  h.graph.groups.set(CLASS_5A_GROUP, [memberOf(SARA_2), memberOf(TIM)])
  const again = /import\/([0-9a-f-]+)$/.exec(await refresh(h, anna))?.[1]
  const second = await get<BatchDetail>(h, anna, `/api/admin/roster/batches/${again}`)
  assert.deepEqual(second.body.summary, { added: 1, removed: 1, changed: 0, unchanged: 4 })
  const done = await send<BatchDetail>(h, anna, 'POST', `/api/admin/roster/batches/${again}/commit`)
  assert.notEqual(done.body.diff.added[0]?.personId, saraPerson)
  assert.equal((await me(h, sara)).body.person?.kind, null, 'the old account is bound to a person the roster no longer lists')
  const sara2 = await signIn(h, SARA_2)
  assert.equal((await me(h, sara2)).body.person?.className, '5A')
})

test('a member without an address is a warning, a member in two groups rejects the batch, and a refused Graph is reported', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  await send(h, anna, 'PUT', '/api/admin/roster/groups', { groups: GROUPS })

  h.graph.groups.set(CLASS_5A_GROUP, [
    memberOf(SARA, { mail: undefined, userPrincipalName: undefined }),
    { id: '33333333-3333-4333-8333-333333333333', displayName: 'Device', type: '#microsoft.graph.device' },
    { id: '44444444-4444-4444-8444-444444444444', displayName: 'Untyped', type: null },
  ])
  const first = /import\/([0-9a-f-]+)$/.exec(await refresh(h, anna))?.[1]
  const batch = await get<BatchDetail>(h, anna, `/api/admin/roster/batches/${first}`)
  assert.equal(batch.body.state, 'pending')
  assert.deepEqual(batch.body.warnings, [{ code: 'no_address', key: SARA.oid }])
  assert.equal(batch.body.diff.added.length, 4, 'neither the device nor the untyped object is a member of the roster')

  // Groups without a single user are not a roster: nobody is removed by accident.
  h.graph.groups.set(CLASS_5A_GROUP, [])
  h.graph.groups.set(TEACHERS_GROUP, [])
  const nobody = /import\/([0-9a-f-]+)$/.exec(await refresh(h, anna))?.[1]
  const empty = await get<BatchDetail>(h, anna, `/api/admin/roster/batches/${nobody}`)
  assert.equal(empty.body.state, 'rejected')
  assert.deepEqual(empty.body.problems, [{ code: 'empty_roster' }])
  h.graph.groups.set(TEACHERS_GROUP, [memberOf(ANNA), memberOf(BERND), memberOf(CARLA)])

  h.graph.groups.set(CLASS_5A_GROUP, [memberOf(SARA), memberOf(BERND)])
  const where = await refresh(h, anna)
  const rejected = /import\/([0-9a-f-]+)$/.exec(where)?.[1]
  assert.ok(rejected, where)
  const detail = await get<BatchDetail>(h, anna, `/api/admin/roster/batches/${rejected}`)
  assert.equal(detail.body.state, 'rejected')
  assert.deepEqual(detail.body.problems, [{ code: 'both_kinds', key: BERND.oid }])

  h.graph.failWith = 403
  assert.equal(await refresh(h, anna), '/verwaltung/stammdaten?fehler=graph_forbidden')
  h.graph.failWith = 500
  assert.equal(await refresh(h, anna), '/verwaltung/stammdaten?fehler=graph_failed')
  h.graph.failWith = undefined
  const batches = await get<{ batches: Batch[] }>(h, anna, '/api/admin/roster')
  assert.deepEqual(batches.body.batches.map((b) => b.state), ['rejected', 'rejected', 'pending'])
})

test('the group picker searches the tenant\'s groups with a token the administrator authorized for it, which lives in the server\'s memory only', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const search = (jar: CookieJar, q: string) => get<{ groups: { id: string, displayName: string }[], error?: string }>(h, jar, `/api/admin/roster/graph/groups?q=${encodeURIComponent(q)}`)
  const before = await search(anna, 'Kl')
  assert.equal(before.status, 409)
  assert.equal(before.body.error, 'graph_not_authorized')

  // No school year and no groups needed for the picker's authorization.
  const start = await h.app.inject({ method: 'GET', url: '/api/admin/roster/graph/start?purpose=picker', headers: { cookie: anna.header() } })
  assert.equal(start.statusCode, 302, start.body)
  anna.update(start)
  const location = new URL(start.headers.location as string)
  assert.match(location.searchParams.get('scope') ?? '', /https:\/\/graph\.microsoft\.com\/Group\.Read\.All/)
  const callback = await h.app.inject({ method: 'GET', url: h.entra.authorize(location.toString(), { claims: claimsOf(ANNA) }), headers: { cookie: anna.header() } })
  assert.equal(callback.statusCode, 303)
  assert.equal(callback.headers.location, '/verwaltung/stammdaten?gruppen=suchen')
  anna.update(callback)
  assert.deepEqual(h.graph.requests, [], 'authorizing reads nothing yet')

  const found = await search(anna, 'Kl')
  assert.equal(found.status, 200, JSON.stringify(found.body))
  assert.deepEqual(found.body.groups, [{ id: CLASS_5A_GROUP, displayName: 'Klasse 5A', description: null }])
  assert.deepEqual((await search(anna, 'x')).body.groups, [])
  assert.deepEqual((await search(anna, 'L')).body.groups.map((g) => g.displayName), ['Lehrkräfte'])
  // A quote in the search cannot end Graph's filter early.
  assert.equal((await search(anna, 'O\'Brien')).status, 200)
  const searches: string[] = h.graph.requests
  assert.ok(searches.every((r: string) => r.startsWith('GET /v1.0/groups?')))
  assert.ok(searches.every((r: string) => !r.includes('$orderby')), 'no $orderby: with a $filter, Graph takes it only as an advanced query')
  // As the URL leaves the server: the comma from encodeURIComponent, the quotes from the URL's own query encoding.
  assert.ok(searches.some((r: string) => r.includes('$filter=startswith(displayName%2C%27O%27%27Brien%27)')), searches.join('\n'))
  const before9 = h.graph.requests.length
  // Every group named after a class at once: one search per leading digit, names that are a class and nothing else.
  for (const [id, name] of [['44444444-4444-4444-8444-444444444444', '7B'], ['55555555-5555-4555-8555-555555555555', '8C'], ['66666666-6666-4666-8666-666666666666', '2026 Maturaball']] as const) {
    h.graph.groups.set(id, [])
    h.graph.names.set(id, name)
  }
  const classes = await get<{ groups: { displayName: string }[] }>(h, anna, '/api/admin/roster/graph/groups?classes=true')
  assert.equal(classes.status, 200, JSON.stringify(classes.body))
  assert.deepEqual(classes.body.groups.map((g) => g.displayName), ['7B', '8C'], 'not "Klasse 5A", not the ball')
  assert.equal(h.graph.requests.length, before9 + 9)
  assert.equal((await get(h, anna, '/api/admin/roster/graph/groups')).status, 400, 'a prefix or classes=true')

  // The handle is this session's; another browser of Anna's has no token, nor has a teacher.
  const other = await signIn(h, ANNA)
  assert.equal((await search(other, 'Kl')).status, 409)
  const bernd = await signIn(h, BERND)
  assert.equal((await search(bernd, 'Kl')).status, 403)
  // Graph refusing the token: forgotten, authorize again.
  h.graph.failWith = 401
  assert.equal((await search(anna, 'Kl')).status, 409)
  h.graph.failWith = undefined
  assert.equal((await search(anna, 'Kl')).status, 409, 'the token was dropped with the refusal')
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
