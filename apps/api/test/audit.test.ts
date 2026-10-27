// The audit log on a real database: events chain per scope, verify, and
// stay linear under concurrent writers.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendAudit, readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { verifyAuditChain } from '../lib/audit-chain.ts'
import { createDatabase } from '../lib/db.ts'
import { createTestDatabase, DB } from './helpers/db.ts'

const ACTOR = { tid: '3f2b8c1d-6e4a-4b7f-9c2d-8a1e5f6b7c90', oid: 'a0000000-0000-4000-8000-00000000000a', name: 'Anna Lehrerin' }
const CAMPAIGN = '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

test('events chain within their scope, verify, and a change to one breaks verification there', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const db = createDatabase(testDb.runtimeUrl, () => {})
  t.after(() => db.close())

  await db.tx(async (client) => {
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: ACTOR, action: 'role.granted', metadata: { role: 'school_admin', userId: 'u1' } })
    await appendAudit(client, { scopeId: CAMPAIGN, actor: ACTOR, action: 'role.granted', metadata: { role: 'campaign_organizer' } })
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: ACTOR, action: 'user.blocked', metadata: { userId: 'u2' } })
  })
  await db.tx((client) => appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: ACTOR, action: 'user.unblocked', metadata: { userId: 'u2' } }))

  const school = await readAudit(db, SCHOOL_SCOPE)
  assert.deepEqual(school.map((e) => e.action), ['role.granted', 'user.blocked', 'user.unblocked'])
  assert.equal(school[0]?.prevHash, null)
  assert.equal(school[1]?.prevHash, school[0]?.hash)
  assert.equal(school[2]?.prevHash, school[1]?.hash)
  assert.deepEqual(verifyAuditChain(school), { valid: true, length: 3, head: school[2]?.hash ?? null })

  const campaign = await readAudit(db, CAMPAIGN)
  assert.deepEqual(verifyAuditChain(campaign), { valid: true, length: 1, head: campaign[0]?.hash ?? null })

  const tampered = structuredClone(school)
  tampered[1] = { ...tampered[1]!, metadata: { userId: 'u3' } }
  assert.deepEqual(verifyAuditChain(tampered), { valid: false, length: 3, index: 1, problem: 'hash-mismatch' })
  assert.deepEqual(verifyAuditChain(school.slice(1)), { valid: false, length: 2, index: 0, problem: 'broken-link' })
})

test('concurrent writers to one scope get distinct predecessors: the chain stays linear', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const db = createDatabase(testDb.runtimeUrl, () => {})
  t.after(() => db.close())
  await Promise.all(Array.from({ length: 8 }, (_, i) =>
    db.tx((client) => appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: ACTOR, action: 'role.granted', metadata: { i } })),
  ))
  const events = await readAudit(db, SCHOOL_SCOPE)
  assert.equal(events.length, 8)
  assert.equal(verifyAuditChain(events).valid, true)
})

test('an unknown action or oversized metadata is refused before anything is written', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const db = createDatabase(testDb.runtimeUrl, () => {})
  t.after(() => db.close())
  await assert.rejects(db.tx((client) => appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: ACTOR, action: 'ballot.cast' as never })), /not an audit action/)
  await assert.rejects(db.tx((client) => appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: ACTOR, action: 'role.granted', metadata: { text: 'x'.repeat(5000) } })), /too large/)
  assert.deepEqual(await readAudit(db, SCHOOL_SCOPE), [])
})
