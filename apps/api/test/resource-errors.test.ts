import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asBrowser, DB, harness, send, signIn } from './helpers/harness.ts'
import { ANNA } from './helpers/personas.ts'

const MISSING = '00000000-0000-4000-8000-000000000099'

test('missing resources have the same error response through reads, mutations and downloads', DB, async (t) => {
  const h = await harness(t, { BOOTSTRAP_ADMINS: ANNA.email ?? '' })
  const anna = await signIn(h, ANNA)
  for (const url of [
    `/api/campaigns/${MISSING}`,
    `/api/admin/campaigns/${MISSING}/missing`,
    `/api/admin/campaigns/${MISSING}/mail`,
    `/api/admin/campaigns/${MISSING}/export/missing.xlsx`,
    `/api/admin/campaigns/${MISSING}/export/catalogue.xlsx`,
    `/api/admin/roster/batches/${MISSING}`,
  ]) {
    const response = await h.app.inject(asBrowser(anna, { method: 'GET', url }))
    assert.equal(response.statusCode, 404, url)
    assert.deepEqual(response.json(), { error: 'not_found' }, url)
  }
  const mutations: { method: 'POST' | 'DELETE', url: string, payload?: object }[] = [
    { method: 'POST', url: `/api/admin/roster/batches/${MISSING}/commit` },
    { method: 'POST', url: `/api/admin/roster/batches/${MISSING}/discard` },
    { method: 'POST', url: `/api/admin/users/${MISSING}/block`, payload: { reason: 'Test' } },
    { method: 'POST', url: `/api/admin/users/${MISSING}/unblock`, payload: { reason: 'Test' } },
    { method: 'POST', url: `/api/admin/roles/${MISSING}/revoke`, payload: { reason: 'Test' } },
    { method: 'POST', url: '/api/admin/roles', payload: { userId: MISSING, role: 'campaign_organizer', reason: 'Test' } },
    { method: 'POST', url: '/api/admin/bindings', payload: { userId: MISSING, personId: MISSING, reason: 'Test' } },
    { method: 'POST', url: `/api/admin/campaigns/${MISSING}/transition`, payload: { to: 'catalogue' } },
    { method: 'DELETE', url: `/api/items/${MISSING}` },
  ]
  for (const { method, url, payload } of mutations) {
    const response = await send(h, anna, method, url, payload)
    assert.deepEqual(response, { status: 404, body: { error: 'not_found' } }, url)
  }
})

test('class-teacher validation retains 422 without a roster through the global mapper', DB, async (t) => {
  const h = await harness(t, { BOOTSTRAP_ADMINS: ANNA.email ?? '' })
  const anna = await signIn(h, ANNA)
  const response = await send(h, anna, 'PUT', '/api/admin/classes/5A/teachers', { teachers: [] })
  assert.deepEqual(response, { status: 422, body: { error: 'no_roster' } })
})
