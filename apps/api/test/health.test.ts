import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CORE_VERSION } from '@school-allocation/school-core'
import { buildTestApp, stubDatabase } from './helpers/app.ts'

test('the health check reports the database, whether a job runs, and what was built', async (t) => {
  const { app } = await buildTestApp({ APP_VERSION: 'v1.2.3', GIT_SHA: 'abcdef1' }, stubDatabase(() => Promise.resolve({ rows: [{ busy: true }] }) as never))
  t.after(() => app.close())
  const response = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { status: 'ok', db: 'up', busy: true, version: 'v1.2.3', gitSha: 'abcdef1', coreVersion: CORE_VERSION })
  assert.equal(response.headers['cache-control'], 'no-store')
})

test('without the database the health check is degraded, not busy, and still names the build', async (t) => {
  const { app, logs } = await buildTestApp({}, stubDatabase(() => Promise.reject(new Error('connection refused to secret-host'))))
  t.after(() => app.close())
  const response = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.json(), { status: 'degraded', db: 'down', busy: false, version: 'dev', gitSha: 'unknown', coreVersion: CORE_VERSION })
  // The failure is logged by type, never by message.
  assert.match(logs(), /database unreachable/)
  assert.doesNotMatch(logs(), /secret-host/)
})
