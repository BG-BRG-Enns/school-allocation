// Roles and blocks, granted and lifted by an administrator on a real
// database: each takes effect at the next request, each is audited, and
// an administrator cannot lock themselves out.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { verifyAuditChain } from '../lib/audit-chain.ts'
import { createDatabase } from '../lib/db.ts'
import { DB, get, harness, me, send, signIn } from './helpers/harness.ts'
import { ANNA, BERND, SARA } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }

interface Grant { id: string, userId: string, displayName: string, role: string, grantedBy: string, reason: string }

test('an administrator grants and revokes roles, which count at the next request, and cannot revoke their own administration', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const bernd = await signIn(h, BERND)
  const berndId = (await me(h, bernd)).body.id

  const users = await get<{ users: { id: string, displayName: string, roles: string[], blocked: boolean, person: unknown }[] }>(h, anna, '/api/admin/users')
  assert.deepEqual(users.body.users.map((u) => [u.displayName, u.roles, u.blocked, u.person]), [[BERND.name, [], false, null], [ANNA.name, ['school_admin'], false, null]])
  assert.deepEqual((await get<{ users: { displayName: string }[] }>(h, anna, '/api/admin/users?q=bern')).body.users.map((u) => u.displayName), [BERND.name])

  const granted = await send<Grant>(h, anna, 'POST', '/api/admin/roles', { userId: berndId, role: 'campaign_organizer', reason: 'Organisiert die Projektwoche' })
  assert.equal(granted.status, 201, JSON.stringify(granted.body))
  assert.equal(granted.body.role, 'campaign_organizer')
  assert.equal(granted.body.grantedBy, ANNA.name)
  assert.deepEqual((await me(h, bernd)).body.roles, ['campaign_organizer'])
  assert.equal((await send(h, anna, 'POST', '/api/admin/roles', { userId: berndId, role: 'campaign_organizer', reason: 'noch einmal' })).status, 409)
  assert.equal((await send(h, anna, 'POST', '/api/admin/roles', { userId: '00000000-0000-4000-8000-000000000000', role: 'campaign_organizer', reason: 'x' })).status, 404)
  assert.equal((await send(h, anna, 'POST', '/api/admin/roles', { userId: berndId, role: 'superuser', reason: 'x' })).status, 400)
  // An organizer is no administrator.
  assert.equal((await get(h, bernd, '/api/admin/roles')).status, 403)

  const grants = await get<{ grants: Grant[] }>(h, anna, '/api/admin/roles')
  assert.deepEqual(grants.body.grants.map((g) => [g.displayName, g.role]), [[ANNA.name, 'school_admin'], [BERND.name, 'campaign_organizer']])
  const own = grants.body.grants.find((g) => g.displayName === ANNA.name)
  const self = await send<{ error: string }>(h, anna, 'POST', `/api/admin/roles/${own?.id}/revoke`, { reason: 'ich brauche das nicht mehr' })
  assert.equal(self.status, 409)
  assert.equal(self.body.error, 'cannot_revoke_self')

  assert.equal((await send(h, anna, 'POST', `/api/admin/roles/${granted.body.id}/revoke`, { reason: 'Aufgabe abgegeben' })).status, 204)
  assert.deepEqual((await me(h, bernd)).body.roles, [])
  assert.equal((await send(h, anna, 'POST', `/api/admin/roles/${granted.body.id}/revoke`, { reason: 'noch einmal' })).status, 409)
  // A second administrator may be made, and then revoke the first.
  const second = await send<Grant>(h, anna, 'POST', '/api/admin/roles', { userId: berndId, role: 'school_admin', reason: 'Vertretung' })
  assert.equal(second.status, 201)
  assert.equal((await send(h, bernd, 'POST', `/api/admin/roles/${own?.id}/revoke`, { reason: 'Übergabe' })).status, 204)
  assert.deepEqual((await me(h, anna)).body.roles, [])
  assert.equal((await get(h, anna, '/api/admin/roles')).status, 403)

  const db = createDatabase(h.ownerUrl, () => {})
  t.after(() => db.close())
  const events = await readAudit(db, SCHOOL_SCOPE)
  assert.deepEqual(events.map((e) => e.action), ['admin.bootstrapped', 'role.granted', 'role.revoked', 'role.granted', 'role.revoked'])
  assert.deepEqual(events[1]?.metadata.role, 'campaign_organizer')
  assert.equal(events[1]?.metadata.reason, 'Organisiert die Projektwoche')
  assert.equal(events[4]?.actor.oid, BERND.oid)
  assert.equal(verifyAuditChain(events).valid, true)
})

test('a block ends the session at the next request and refuses the next sign-in; an unblock lets the person back in; nobody blocks themselves', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const sara = await signIn(h, SARA)
  const saraId = (await me(h, sara)).body.id
  const annaId = (await me(h, anna)).body.id

  const self = await send<{ error: string }>(h, anna, 'POST', `/api/admin/users/${annaId}/block`, { reason: 'Versehen' })
  assert.equal(self.status, 409)
  assert.equal(self.body.error, 'cannot_block_self')
  // In whatever case the id is written.
  assert.equal((await send(h, anna, 'POST', `/api/admin/users/${annaId.toUpperCase()}/block`, { reason: 'Versehen' })).status, 409)

  assert.equal((await send(h, anna, 'POST', `/api/admin/users/${saraId}/block`, { reason: 'Konto kompromittiert' })).status, 204)
  assert.equal((await me(h, sara)).status, 204)
  assert.equal((await send(h, anna, 'POST', `/api/admin/users/${saraId}/block`, { reason: 'noch einmal' })).status, 409)
  const refused = await h.app.inject({ method: 'GET', url: '/api/auth/login' })
  const callback = h.entra.authorize(refused.headers.location as string, { claims: { oid: SARA.oid, name: SARA.name, email: SARA.email, preferred_username: SARA.email } })
  const jar = new (await import('./helpers/fake-entra.ts')).CookieJar()
  jar.update(refused)
  assert.equal((await h.app.inject({ method: 'GET', url: callback, headers: { cookie: jar.header() } })).statusCode, 403)
  const listed = await get<{ users: { id: string, blocked: boolean }[] }>(h, anna, '/api/admin/users?q=sara')
  assert.deepEqual(listed.body.users.map((u) => u.blocked), [true])
  assert.equal((await send(h, sara, 'POST', `/api/admin/users/${annaId}/block`, { reason: 'x' })).status, 401, 'a blocked person\'s session is worth nothing')

  assert.equal((await send(h, anna, 'POST', `/api/admin/users/${saraId}/unblock`, { reason: 'Geklärt' })).status, 204)
  assert.equal((await send(h, anna, 'POST', `/api/admin/users/${saraId}/unblock`, { reason: 'noch einmal' })).status, 409)
  const saraAgain = await signIn(h, SARA)
  assert.equal((await me(h, saraAgain)).status, 200)
  assert.equal((await send(h, anna, 'POST', '/api/admin/users/00000000-0000-4000-8000-000000000000/block', { reason: 'x' })).status, 404)
  assert.equal((await send(h, saraAgain, 'POST', `/api/admin/users/${annaId}/block`, { reason: 'x' })).status, 403)

  const db = createDatabase(h.ownerUrl, () => {})
  t.after(() => db.close())
  const events = await readAudit(db, SCHOOL_SCOPE)
  assert.deepEqual(events.map((e) => e.action), ['admin.bootstrapped', 'user.blocked', 'user.unblocked'])
  assert.equal(events[1]?.metadata.userId, saraId)
  // The audit log is readable by administrators and auditors.
  const log = await get<{ events: { action: string }[] }>(h, anna, '/api/admin/audit')
  assert.equal(log.body.events.length, 3)
  assert.equal((await get(h, saraAgain, '/api/admin/audit')).status, 403)
  await send(h, anna, 'POST', '/api/admin/roles', { userId: saraId, role: 'read_only_auditor', reason: 'Prüfung' })
  assert.equal((await get(h, saraAgain, '/api/admin/audit')).status, 200)
})
