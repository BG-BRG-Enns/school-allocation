// Signing in end to end against the stand-in for Entra, with a real
// database: the person is recorded by (tid, oid), a listed first
// administrator gets the role with an audit event, a blocked person is
// refused, and the session carries nothing the database does not confirm.

import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { verifyAuditChain } from '../lib/audit-chain.ts'
import { createDatabase } from '../lib/db.ts'
import { SIGN_IN_SECONDS } from '../lib/entra.ts'
import { SESSION_BIND_COOKIE, SESSION_SECONDS, sessionCookie } from '../plugins/session.ts'
import { buildTestApp, ORIGIN } from './helpers/app.ts'
import { createTestDatabase, DB, withClient } from './helpers/db.ts'
import { CookieJar, startFakeEntra, type FakeEntra } from './helpers/fake-entra.ts'
import { ANNA, BERND, claimsOf, SARA, type Person } from './helpers/personas.ts'

interface Harness {
  app: FastifyInstance
  entra: FakeEntra
  ownerUrl: string
  logs: () => string
}

/** The server with a fresh database; `base` is the path of PUBLIC_URL, '' at the root of the host. */
async function harness(t: TestContext, env: Record<string, string> = {}, base = ''): Promise<Harness> {
  const testDb = await createTestDatabase(t)
  const entra = await startFakeEntra({ redirectUri: `${ORIGIN}${base}/api/auth/callback` })
  t.after(() => entra.close())
  const db = createDatabase(testDb.runtimeUrl, () => {})
  t.after(() => db.close())
  const { app, logs } = await buildTestApp({ PUBLIC_URL: `${ORIGIN}${base}`, ...env }, db, { entraAuthority: entra.authority })
  t.after(() => app.close())
  return { app, entra, ownerUrl: testDb.ownerUrl, logs }
}

/** Plays a whole sign-in in one browser (its cookie jar); the callback's response is returned. */
async function signIn({ app, entra }: Harness, jar: CookieJar, person: Person, returnTo = '/', base = '') {
  const login = await app.inject({ method: 'GET', url: `${base}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`, headers: { cookie: jar.header() } })
  assert.equal(login.statusCode, 302)
  jar.update(login)
  const callback = entra.authorize(login.headers.location as string, { claims: claimsOf(person) })
  const response = await app.inject({ method: 'GET', url: callback, headers: { cookie: jar.header() } })
  jar.update(response)
  return response
}

const me = (app: FastifyInstance, jar: CookieJar, base = '') => app.inject({ method: 'GET', url: `${base}/api/auth/me`, headers: { cookie: jar.header() } })

/** Who has an account, by object id. */
const accounts = async (ownerUrl: string) => (await withClient(ownerUrl, (c) => c.query<{ oid: string }>('select oid from app_user order by oid'))).rows.map((row) => row.oid)

test('a person signs in, is known by their identity afterwards, and signs out', DB, async (t) => {
  const h = await harness(t)
  const jar = new CookieJar()
  assert.equal((await me(h.app, jar)).statusCode, 204)

  const response = await signIn(h, jar, ANNA, '/irgendwo')
  assert.equal(response.statusCode, 303)
  assert.equal(response.headers.location, '/irgendwo')

  const who = await me(h.app, jar)
  assert.equal(who.statusCode, 200)
  const body = who.json<{ id: string, displayName: string, roles: string[] }>()
  assert.equal(body.displayName, ANNA.name)
  assert.deepEqual(body.roles, [])

  // Signing in again is the same person: one row, refreshed.
  const again = new CookieJar()
  await signIn(h, again, { ...ANNA, name: 'Anna Lehrerin-Neu' })
  assert.equal((await me(h.app, again)).json<{ id: string }>().id, body.id)
  const rows = await withClient(h.ownerUrl, (c) => c.query<{ n: string, name: string }>('select count(*)::text as n, min(display_name) as name from app_user'))
  assert.deepEqual(rows.rows[0], { n: '1', name: 'Anna Lehrerin-Neu' })

  const logout = await h.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { 'cookie': jar.header(), 'sec-fetch-site': 'same-origin' } })
  assert.equal(logout.statusCode, 204)
  jar.update(logout)
  assert.equal((await me(h.app, jar)).statusCode, 204)
})

test('a listed first administrator gets the role once, with an audit event in the school scope', DB, async (t) => {
  const h = await harness(t, { BOOTSTRAP_ADMINS: `${ANNA.email?.toUpperCase()},${SARA.oid}` })
  const anna = new CookieJar()
  await signIn(h, anna, ANNA)
  assert.deepEqual((await me(h.app, anna)).json<{ roles: string[] }>().roles, ['school_admin'])
  // By object id as well, and a second sign-in grants nothing more.
  const sara = new CookieJar()
  await signIn(h, sara, SARA)
  await signIn(h, new CookieJar(), SARA)
  assert.deepEqual((await me(h.app, sara)).json<{ roles: string[] }>().roles, ['school_admin'])

  const db = createDatabase(h.ownerUrl, () => {})
  t.after(() => db.close())
  const events = await readAudit(db, SCHOOL_SCOPE)
  assert.equal(events.length, 2)
  assert.deepEqual(events.map((e) => e.action), ['admin.bootstrapped', 'admin.bootstrapped'])
  assert.equal(events[0]?.actor.oid, ANNA.oid)
  assert.equal(events[0]?.actor.name, ANNA.name)
  assert.deepEqual(events[0]?.metadata.role, 'school_admin')
  const status = verifyAuditChain(events)
  assert.deepEqual(status, { valid: true, length: 2, head: events[1]?.hash ?? null })
})

test('a blocked person is refused at sign-in, and a running session ends with the next request', DB, async (t) => {
  const h = await harness(t)
  const jar = new CookieJar()
  await signIn(h, jar, ANNA)
  assert.equal((await me(h.app, jar)).statusCode, 200)

  await withClient(h.ownerUrl, (c) => c.query('update app_user set blocked_at = now(), blocked_by = id where oid = $1', [ANNA.oid]))
  const blocked = await me(h.app, jar)
  assert.equal(blocked.statusCode, 204)
  // The cookie is dropped, so the browser stops presenting it.
  assert.ok(blocked.cookies.some((cookie) => cookie.name.endsWith('session') && (cookie.value === '' || cookie.maxAge === 0)))

  const refused = await signIn(h, new CookieJar(), ANNA)
  assert.equal(refused.statusCode, 403)
  assert.deepEqual(refused.json(), { error: 'blocked' })
})

test('a callback without its own sign-in, or with a used code, is refused and logged by code only', DB, async (t) => {
  const h = await harness(t)
  const jar = new CookieJar()
  const login = await h.app.inject({ method: 'GET', url: '/api/auth/login' })
  jar.update(login)
  const callback = h.entra.authorize(login.headers.location as string, { claims: claimsOf(ANNA) })

  // Another browser, without the state cookie and the pending sign-in.
  const foreign = await h.app.inject({ method: 'GET', url: callback })
  assert.equal(foreign.statusCode, 401)
  assert.deepEqual(foreign.json(), { error: 'sign_in_failed' })

  const first = await h.app.inject({ method: 'GET', url: callback, headers: { cookie: jar.header() } })
  assert.equal(first.statusCode, 303)
  jar.update(first)
  // The same code again: no pending sign-in any more, and Entra would not
  // redeem the code twice either.
  const replay = await h.app.inject({ method: 'GET', url: callback, headers: { cookie: jar.header() } })
  assert.equal(replay.statusCode, 401)
})

test('a tampered or foreign-signed token never signs anyone in', DB, async (t) => {
  const h = await harness(t)
  for (const options of [
    { signWith: 'foreign' as const },
    { signWith: 'hs256' as const },
    { claims: { tid: '11111111-1111-4111-8111-111111111111' } },
    { claims: { nonce: 'not-the-nonce' } },
    { claims: { oid: undefined } },
  ]) {
    const jar = new CookieJar()
    const login = await h.app.inject({ method: 'GET', url: '/api/auth/login' })
    jar.update(login)
    const callback = h.entra.authorize(login.headers.location as string, { ...options, claims: { ...claimsOf(ANNA), ...options.claims } })
    const response = await h.app.inject({ method: 'GET', url: callback, headers: { cookie: jar.header() } })
    assert.equal(response.statusCode, 401, JSON.stringify(options))
    jar.update(response)
    assert.equal((await me(h.app, jar)).statusCode, 204)
  }
  const rows = await withClient(h.ownerUrl, (c) => c.query('select 1 from app_user'))
  assert.equal(rows.rowCount, 0)
})

test('the login binds the session to this browser with a __Host- cookie at /, kept by the next login; without it the session counts as none', DB, async (t) => {
  for (const base of ['', '/wahl']) {
    const h = await harness(t, {}, base)
    const login = await h.app.inject({ method: 'GET', url: `${base}/api/auth/login` })
    const bind = login.cookies.find((cookie) => cookie.name === SESSION_BIND_COOKIE)
    assert.deepEqual([bind?.path, bind?.secure, bind?.httpOnly, bind?.sameSite, bind?.maxAge], ['/', true, true, 'Lax', SIGN_IN_SECONDS + SESSION_SECONDS], `at ${base || 'the root'}`)
    const jar = new CookieJar()
    assert.equal((await signIn(h, jar, ANNA, `${base}/`, base)).statusCode, 303)
    assert.equal((await me(h.app, jar, base)).statusCode, 200)
    // Signing in again keeps the browser's binding cookie: a second instance of the app on the host may have set it, and a new one would
    // sign that out.
    const again = await h.app.inject({ method: 'GET', url: `${base}/api/auth/login`, headers: { cookie: jar.header() } })
    assert.equal(again.cookies.find((cookie) => cookie.name === SESSION_BIND_COOKIE)?.value, jar.values.get(SESSION_BIND_COOKIE))
    jar.values.delete(SESSION_BIND_COOKIE)
    assert.equal((await me(h.app, jar, base)).statusCode, 204, 'without the binding cookie')
  }
})

test('under a base path, a session or a sign-in planted from another host of the site is not this browser\'s and counts as none', DB, async (t) => {
  // Any host of the same site can set a __Secure- cookie for the whole domain, at a longer path, which the browser then sends first.
  // Bernd, an administrator who controls such a host, plants his own session cookie in Anna's browser.
  const base = '/wahl'
  const h = await harness(t, { BOOTSTRAP_ADMINS: BERND.email ?? '' }, base)
  const name = sessionCookie(base)
  const cookieOf = (jar: CookieJar, cookie: string) => `${cookie}=${encodeURIComponent(jar.values.get(cookie) ?? '')}`
  const meWith = (cookie: string) => h.app.inject({ method: 'GET', url: `${base}/api/auth/me`, headers: { cookie } })
  const bernd = new CookieJar()
  assert.equal((await signIn(h, bernd, BERND, `${base}/`, base)).statusCode, 303)
  const planted = cookieOf(bernd, name)
  assert.equal((await meWith(`${planted}; ${cookieOf(bernd, SESSION_BIND_COOKIE)}`)).statusCode, 200, 'in Bernd\'s browser')

  // Anna signed out, with the binding cookie of an earlier visit, or none.
  const visit = new CookieJar()
  visit.update(await h.app.inject({ method: 'GET', url: `${base}/api/auth/login` }))
  const visited = cookieOf(visit, SESSION_BIND_COOKIE)
  assert.equal((await meWith(planted)).statusCode, 204, 'without a binding cookie')
  assert.equal((await meWith(`${planted}; ${visited}`)).statusCode, 204, 'beside Anna\'s binding cookie')
  // Bernd's role reaches nothing from Anna's browser, the callback of a Graph authorization included.
  const fromAnna = { 'cookie': `${planted}; ${visited}`, 'sec-fetch-site': 'same-origin' }
  assert.equal((await h.app.inject({ method: 'GET', url: `${base}/api/admin/users`, headers: fromAnna })).statusCode, 401)
  assert.equal((await h.app.inject({ method: 'GET', url: `${base}/api/admin/roster/graph/callback?state=s&code=c`, headers: fromAnna })).statusCode, 401)

  // Planted at the login's path, it is emptied there, not bound to Anna's browser: the session the login writes back carries no one.
  const rebind = new CookieJar()
  rebind.values.set(SESSION_BIND_COOKIE, visit.values.get(SESSION_BIND_COOKIE) ?? '')
  const relogin = await h.app.inject({ method: 'GET', url: `${base}/api/auth/login`, headers: { cookie: `${planted}; ${visited}` } })
  assert.equal(relogin.statusCode, 302)
  rebind.update(relogin)
  assert.notEqual(rebind.values.get(name), undefined, 'the login wrote a session')
  assert.equal((await meWith(rebind.header())).statusCode, 204, 'and it is nobody\'s')

  // Anna signed in: the planted cookie comes first and shadows hers. She is signed out by it, never signed in as Bernd.
  const anna = new CookieJar()
  assert.equal((await signIn(h, anna, ANNA, `${base}/`, base)).statusCode, 303)
  const own = `${cookieOf(anna, name)}; ${cookieOf(anna, SESSION_BIND_COOKIE)}`
  assert.equal((await meWith(own)).json<{ displayName: string }>().displayName, ANNA.name)
  assert.equal((await meWith(`${planted}; ${own}`)).statusCode, 204)

  // A sign-in Bernd started, planted with its state cookie, and Anna's browser sent to the callback with Bernd's code: refused before the
  // code is redeemed, and nothing of it written back as Anna's.
  const started = new CookieJar()
  const login = await h.app.inject({ method: 'GET', url: `${base}/api/auth/login` })
  started.update(login)
  const callback = h.entra.authorize(login.headers.location as string, { claims: claimsOf(BERND) })
  const plantedSignIn = `${cookieOf(started, name)}; ${cookieOf(started, '__Secure-oauth2-redirect-state')}`
  const before = await accounts(h.ownerUrl)
  const redeemed = h.entra.requests.filter((request) => request.startsWith('POST')).length
  const logged = h.logs().length
  const refused = await h.app.inject({ method: 'GET', url: callback, headers: { cookie: `${plantedSignIn}; ${visited}` } })
  assert.equal(refused.statusCode, 401)
  assert.match(h.logs().slice(logged), /"code":"session_not_bound".*"msg":"sign-in refused"/)
  assert.ok(!refused.cookies.some((cookie) => cookie.name === name), 'no session cookie written')
  assert.equal(h.entra.requests.filter((request) => request.startsWith('POST')).length, redeemed)
  assert.deepEqual(await accounts(h.ownerUrl), before)
  // In the browser that started it, the sign-in still completes.
  assert.equal((await h.app.inject({ method: 'GET', url: callback, headers: { cookie: started.header() } })).statusCode, 303)
})
