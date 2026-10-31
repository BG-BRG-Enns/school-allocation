// The audit log on a real database: events chain per scope, verify, and
// stay linear under concurrent writers.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendAudit, readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { verifyAuditChain } from '../lib/audit-chain.ts'
import { createDatabase } from '../lib/db.ts'
import { ControlledClock } from './helpers/clock.ts'
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

test('a chain past nine events keeps its order: the tenth follows the ninth, not the first with a two-digit sequence', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const db = createDatabase(testDb.runtimeUrl, () => {})
  t.after(() => db.close())
  // Another scope first, so this scope's sequence numbers start past 1 and
  // cross from one digit to two inside the chain.
  for (let i = 0; i < 3; i++) await db.tx((client) => appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: ACTOR, action: 'user.blocked', metadata: { i } }))
  for (let i = 0; i < 12; i++) await db.tx((client) => appendAudit(client, { scopeId: CAMPAIGN, actor: ACTOR, action: 'item.approved', metadata: { i } }))
  const events = await readAudit(db, CAMPAIGN)
  assert.deepEqual(events.map((e) => e.metadata.i), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  assert.deepEqual(verifyAuditChain(events), { valid: true, length: 12, head: events[11]?.hash ?? null })
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

test('an event never carries a time before the one it follows, though its transaction began earlier', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const start = new Date('2034-03-06T07:00:00.000Z')
  const clock = new ControlledClock(start)
  const db = createDatabase(testDb.runtimeUrl, () => {}, clock)
  t.after(() => db.close())
  // The first transaction begins, then a later one writes its event and
  // commits before the first one takes the lock.
  await db.tx(async (client) => {
    clock.advance(60_000)
    await db.tx((other) => appendAudit(other, { scopeId: SCHOOL_SCOPE, actor: ACTOR, action: 'user.blocked', metadata: { i: 0 } }))
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: ACTOR, action: 'user.unblocked', metadata: { i: 1 } })
  })
  const [first, second] = await readAudit(db, SCHOOL_SCOPE)
  assert.ok(Date.parse(first?.at ?? '') >= start.getTime() + 60_000, String(first?.at))
  assert.equal(second?.at, first?.at)
  assert.equal(verifyAuditChain([first!, second!]).valid, true)
})

test('an unknown action or oversized metadata is refused before anything is written', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const db = createDatabase(testDb.runtimeUrl, () => {})
  t.after(() => db.close())
  await assert.rejects(db.tx((client) => appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: ACTOR, action: 'ballot.cast' as never })), /not an audit action/)
  await assert.rejects(db.tx((client) => appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: ACTOR, action: 'role.granted', metadata: { text: 'x'.repeat(5000) } })), /too large/)
  assert.deepEqual(await readAudit(db, SCHOOL_SCOPE), [])
})
