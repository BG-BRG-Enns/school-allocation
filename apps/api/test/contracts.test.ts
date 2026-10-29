import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildTestApp } from './helpers/app.ts'
import { startFakeEntra } from './helpers/fake-entra.ts'

const nonJsonSuccess = new Set([
  'GET /api/auth/login', 'GET /api/auth/callback', 'POST /api/auth/logout',
  'GET /api/admin/roster/graph/start', 'GET /api/admin/roster/graph/callback',
  'GET /api/admin/roster/csv/template',
  'GET /api/admin/campaigns/:id/export/catalogue.xlsx', 'GET /api/admin/campaigns/:id/export/missing.xlsx',
  'DELETE /api/items/:id', 'POST /api/admin/bindings',
  'POST /api/admin/users/:id/block', 'POST /api/admin/users/:id/unblock', 'POST /api/admin/roles/:id/revoke',
])

test('route extraction preserves methods, URLs, input schemas and body limits; every JSON success has a response contract', async (t) => {
  const entra = await startFakeEntra()
  t.after(() => entra.close())
  const routes: object[] = []
  const { app } = await buildTestApp({}, undefined, {
    entraAuthority: entra.authority,
    onRoute(route) {
      for (const method of [route.method].flat()) {
        if (method === 'HEAD') continue
        const key = `${method} ${route.url}`
        routes.push({ method, url: route.url, body: route.schema?.body ?? null, params: route.schema?.params ?? null, querystring: route.schema?.querystring ?? null, bodyLimit: route.bodyLimit ?? null })
        if (!nonJsonSuccess.has(key)) {
          assert.ok(Object.keys(route.schema?.response ?? {}).some((status) => /^2(?:\d\d|xx)$/.test(status)), `${key} needs a JSON success schema`)
        }
      }
    },
  })
  t.after(() => app.close())
  await app.ready()
  const actual: unknown = JSON.parse(JSON.stringify(routes.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))))
  const expected: unknown = JSON.parse(readFileSync(new URL('./fixtures/routes.json', import.meta.url), 'utf8'))
  assert.deepEqual(actual, expected)
})
