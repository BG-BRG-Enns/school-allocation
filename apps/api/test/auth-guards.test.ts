// The guards in front of protected routes, on a real database: a session
// is worth what the database says now, and a role is checked per request.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callerOf, createGuards } from '../lib/auth.ts'
import { createDatabase } from '../lib/db.ts'
import { buildTestApp } from './helpers/app.ts'
import { createTestDatabase, DB, withClient } from './helpers/db.ts'
import { CookieJar, startFakeEntra } from './helpers/fake-entra.ts'
import { ANNA, BERND, claimsOf, type Person } from './helpers/personas.ts'

test('requireSession and requireRole answer 401, 403 and 200 by what the database holds now', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const entra = await startFakeEntra()
  t.after(() => entra.close())
  const db = createDatabase(testDb.runtimeUrl, () => {})
  t.after(() => db.close())
  const { app } = await buildTestApp({ BOOTSTRAP_ADMINS: ANNA.email ?? '' }, db, { entraAuthority: entra.authority })
  t.after(() => app.close())

  const guards = createGuards(db)
  app.get('/api/test/mine', { preHandler: guards.requireSession }, (request) => ({ name: callerOf(request).displayName }))
  app.get('/api/test/admin', { preHandler: guards.requireRole('school_admin') }, (request) => ({ roles: callerOf(request).roles }))
  app.get('/api/test/organizer-or-admin', { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }, () => ({ ok: true }))

  const signIn = async (person: Person) => {
    const jar = new CookieJar()
    const login = await app.inject({ method: 'GET', url: '/api/auth/login' })
    jar.update(login)
    const response = await app.inject({ method: 'GET', url: entra.authorize(login.headers.location as string, { claims: claimsOf(person) }), headers: { cookie: jar.header() } })
    assert.equal(response.statusCode, 303)
    jar.update(response)
    return jar
  }
  const get = (url: string, jar?: CookieJar) => app.inject({ method: 'GET', url, headers: jar ? { cookie: jar.header() } : {} })

  assert.equal((await get('/api/test/mine')).statusCode, 401)
  assert.equal((await get('/api/test/admin')).statusCode, 401)

  const anna = await signIn(ANNA)
  const bernd = await signIn(BERND)
  assert.deepEqual((await get('/api/test/mine', bernd)).json(), { name: BERND.name })
  assert.equal((await get('/api/test/admin', bernd)).statusCode, 403)
  assert.deepEqual((await get('/api/test/admin', bernd)).json(), { error: 'forbidden' })
  assert.equal((await get('/api/test/organizer-or-admin', bernd)).statusCode, 403)
  assert.deepEqual((await get('/api/test/admin', anna)).json(), { roles: ['school_admin'] })
  assert.equal((await get('/api/test/organizer-or-admin', anna)).statusCode, 200)

  // A grant made in the database shows at the next request, without a new sign-in.
  await withClient(testDb.ownerUrl, (c) => c.query(
    `insert into role_grant (user_id, role, granted_by, reason)
     select b.id, 'campaign_organizer', a.id, 'test' from app_user a, app_user b where a.oid = $1 and b.oid = $2`,
    [ANNA.oid, BERND.oid],
  ))
  assert.equal((await get('/api/test/organizer-or-admin', bernd)).statusCode, 200)
  assert.equal((await get('/api/test/admin', bernd)).statusCode, 403)

  // So does a revocation, and a block ends the session.
  await withClient(testDb.ownerUrl, (c) => c.query('update role_grant set revoked_at = now(), revoked_by = user_id where role = \'campaign_organizer\''))
  assert.equal((await get('/api/test/organizer-or-admin', bernd)).statusCode, 403)
  await withClient(testDb.ownerUrl, (c) => c.query('update app_user set blocked_at = now(), blocked_by = id where oid = $1', [BERND.oid]))
  assert.equal((await get('/api/test/mine', bernd)).statusCode, 401)
})
