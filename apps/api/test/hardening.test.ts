import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp, fakeWebDist, ORIGIN, stubDatabase } from './helpers/app.ts'

test('a state-changing request must come from our own pages: Sec-Fetch-Site, else Origin, else refused', async (t) => {
  const { app } = await buildTestApp()
  t.after(() => app.close())
  const logout = (headers: Record<string, string>) => app.inject({ method: 'POST', url: '/api/auth/logout', headers })

  assert.equal((await logout({})).statusCode, 403)
  assert.deepEqual((await logout({})).json(), { error: 'cross_site_request' })
  assert.equal((await logout({ 'sec-fetch-site': 'cross-site' })).statusCode, 403)
  assert.equal((await logout({ 'sec-fetch-site': 'same-site' })).statusCode, 403)
  assert.equal((await logout({ origin: 'https://evil.example.org' })).statusCode, 403)
  // Signing out needs no session; it just drops the cookie.
  assert.equal((await logout({ 'sec-fetch-site': 'same-origin' })).statusCode, 204)
  assert.equal((await logout({ origin: ORIGIN })).statusCode, 204)
  // Reads pass without either header.
  assert.equal((await app.inject({ method: 'GET', url: '/api/health' })).statusCode, 200)
})

test('bodies are JSON only, and every API answer is no-store', async (t) => {
  const { app } = await buildTestApp()
  t.after(() => app.close())
  const text = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'text/plain' }, payload: 'x' })
  assert.equal(text.statusCode, 415)
  const missing = await app.inject({ method: 'GET', url: '/api/nothing-here' })
  assert.equal(missing.statusCode, 404)
  assert.deepEqual(missing.json(), { error: 'not_found' })
  assert.equal(missing.headers['cache-control'], 'no-store')
})

test('with a web build, page paths get the page and asset paths stay 404; without one, every unknown path is 404', async (t) => {
  const { app } = await buildTestApp({ WEB_DIST_DIR: fakeWebDist() })
  t.after(() => app.close())
  const start = await app.inject({ method: 'GET', url: '/' })
  assert.equal(start.statusCode, 200)
  assert.match(start.headers['content-type'] ?? '', /text\/html/)
  assert.equal(start.headers['cache-control'], 'no-cache')
  assert.match(start.body, /<meta name="base-path" content="\/">/)
  const page = await app.inject({ method: 'GET', url: '/anmelden?returnTo=%2F' })
  assert.equal(page.statusCode, 200)
  assert.match(page.headers['content-type'] ?? '', /text\/html/)
  const asset = await app.inject({ method: 'GET', url: '/assets/index-abc.js' })
  assert.equal(asset.statusCode, 200)
  assert.match(asset.headers['cache-control'] ?? '', /immutable/)
  assert.equal((await app.inject({ method: 'GET', url: '/assets/missing.js' })).statusCode, 404)
  assert.equal((await app.inject({ method: 'GET', url: '/favicon.ico' })).statusCode, 404)

  const { app: bare } = await buildTestApp()
  t.after(() => bare.close())
  assert.equal((await bare.inject({ method: 'GET', url: '/anmelden' })).statusCode, 404)
})

test('the page names the school\'s language, read on every page request; the language last read when the database does not answer', async (t) => {
  let answer: () => Promise<unknown> = () => Promise.resolve({ rows: [{ locale: 'en' }] })
  const { app, logs } = await buildTestApp({ WEB_DIST_DIR: fakeWebDist() }, stubDatabase(() => answer() as never))
  t.after(() => app.close())
  const english = await app.inject({ method: 'GET', url: '/' })
  assert.match(english.body, /<html lang="en">/)
  assert.match(english.body, /<meta name="locale" content="en">/)
  answer = () => Promise.resolve({ rows: [{ locale: 'de-formal' }] })
  const formal = await app.inject({ method: 'GET', url: '/wahlen' })
  assert.match(formal.body, /<html lang="de">/, 'the address is not a language')
  assert.match(formal.body, /<meta name="locale" content="de-formal">/)
  answer = () => Promise.reject(new Error('connection refused'))
  const down = await app.inject({ method: 'GET', url: '/' })
  assert.equal(down.statusCode, 200)
  assert.match(down.body, /<meta name="locale" content="de-formal">/)
  assert.match(logs(), /the school's language could not be read/)
  answer = () => Promise.resolve({ rows: [] })
  assert.match((await app.inject({ method: 'GET', url: '/' })).body, /<meta name="locale" content="de">/, 'German without a setting')
})

test('under a base path, routes and the page live below it and nothing answers outside it', async (t) => {
  const { app } = await buildTestApp({ PUBLIC_URL: `${ORIGIN}/wahl`, WEB_DIST_DIR: fakeWebDist() })
  t.after(() => app.close())
  assert.equal((await app.inject({ method: 'GET', url: '/wahl/api/health' })).statusCode, 200)
  assert.equal((await app.inject({ method: 'GET', url: '/api/health' })).statusCode, 404)
  const page = await app.inject({ method: 'GET', url: '/wahl/anmelden' })
  assert.equal(page.statusCode, 200)
  assert.match(page.body, /<meta name="base-path" content="\/wahl\/">/)
  assert.match(page.body, /src="\/wahl\/assets\/index-abc\.js"/)
  assert.equal((await app.inject({ method: 'GET', url: '/anmelden' })).statusCode, 404)
})

test('security headers come from the application', async (t) => {
  const { app } = await buildTestApp({ WEB_DIST_DIR: fakeWebDist() })
  t.after(() => app.close())
  const { headers } = await app.inject({ method: 'GET', url: '/' })
  assert.match(String(headers['content-security-policy']), /frame-ancestors 'none'/)
  assert.match(String(headers['content-security-policy']), /default-src 'self'/)
  assert.equal(headers['x-content-type-options'], 'nosniff')
  assert.equal(headers['referrer-policy'], 'no-referrer')
})
