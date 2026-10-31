// One clock (app_now(), lib/db.ts): without a clock of its own the
// application reads the database's now(); with one, everything it writes
// and compares follows that clock, the tables' defaults, the sign-in's
// token check, the session's lifetime and the outbox's due times
// included. The rest of the tests run on the system's clock.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { createDatabase, readSnapshot } from '../lib/db.ts'
import { claimNextMail, enqueueMail, recordRetry } from '../lib/mail/outbox.ts'
import { SESSION_SECONDS } from '../plugins/session.ts'
import { ControlledClock } from './helpers/clock.ts'
import { createTestDatabase, DB, withClient } from './helpers/db.ts'
import { harness, me, signIn } from './helpers/harness.ts'
import { ANNA } from './helpers/personas.ts'

const MONDAY = new Date('2034-03-06T07:00:00.000Z') // 08:00 in Vienna

test('no column takes the database\'s own now() as its default; every time default is app_now()', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const defaults = await withClient(testDb.ownerUrl, async (client) => (await client.query<{ name: string, value: string }>(
    `select table_name || '.' || column_name as name, column_default as value from information_schema.columns
      where table_schema = 'public' and data_type like 'timestamp%' and column_default is not null and table_name <> 'schema_migrations'
      order by 1`,
  )).rows)
  assert.ok(defaults.length >= 25, `${defaults.length} time defaults`)
  assert.deepEqual(defaults.filter((d) => d.value !== 'app_now()'), [])
})

test('without a clock of its own, app_now() is the database\'s now()', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const db = createDatabase(testDb.runtimeUrl, () => {})
  t.after(() => db.close())
  const { rows: [row] } = await db.query<{ same: boolean }>('select app_now() = now() as same')
  assert.equal(row?.same, true)
  assert.equal(await db.tx(async (client) => (await client.query<{ same: boolean }>('select app_now() = now() as same')).rows[0]?.same), true)
})

test('with a clock of its own, statements, transactions and snapshots read it', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const clock = new ControlledClock(MONDAY)
  const db = createDatabase(testDb.runtimeUrl, () => {}, clock)
  t.after(() => db.close())
  const at = async (fn: () => Promise<Date | undefined>) => (await fn())?.getTime() ?? NaN
  const near = (ms: number) => Math.abs(ms - MONDAY.getTime()) < 100
  assert.ok(near(await at(async () => (await db.query<{ at: Date }>('select app_now() as at')).rows[0]?.at)))
  assert.ok(near(await at(() => db.tx(async (client) => (await client.query<{ at: Date }>('select app_now() as at')).rows[0]?.at))))
  // SET takes no snapshot: the read-only, repeatable-read transaction still chooses its isolation after the clock is set.
  assert.ok(near(await at(() => readSnapshot(db, async (client) => (await client.query<{ at: Date }>('select app_now() as at')).rows[0]?.at))))
  assert.ok(near(db.now().getTime()))
  // The setting lasts one transaction: a connection back in the pool reads the next transaction's time.
  clock.advance(86_400_000)
  assert.ok(Math.abs(await at(async () => (await db.query<{ at: Date }>('select app_now() as at')).rows[0]?.at) - MONDAY.getTime() - 86_400_000) < 100)
})

test('the outbox\'s due times follow the clock', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const clock = new ControlledClock(MONDAY)
  const db = createDatabase(testDb.runtimeUrl, () => {}, clock)
  t.after(() => db.close())
  await db.tx((client) => enqueueMail(client, { kind: 'choice_invitation', campaignId: null, personId: null, to: 'anna@schule.example.org', subject: 's', body: 'b', dedupeKey: 'clock-test' }))
  const { mail } = await claimNextMail(db, 0)
  assert.ok(mail)
  await recordRetry(db, mail.id, 'later', 60_000)
  assert.equal((await claimNextMail(db, 0)).mail, undefined, 'a minute later on the clock, not yet')
  clock.advance(61_000)
  assert.equal((await claimNextMail(db, 0)).mail?.id, mail.id)
})

test('signing in, the audit log and the session\'s lifetime follow the clock', DB, async (t) => {
  const clock = new ControlledClock(MONDAY)
  const h = await harness(t, { BOOTSTRAP_ADMINS: ANNA.email ?? '' }, undefined, clock)
  // The stand-in issues the ID token at the clock's time, years from the system's: the verifier checks it against the clock.
  const anna = await signIn(h, ANNA)
  assert.deepEqual((await me(h, anna)).body.roles, ['school_admin'])
  const owner = createDatabase(h.ownerUrl, () => {})
  t.after(() => owner.close())
  const { rows: [user] } = await owner.query<{ first: Date, last: Date }>('select first_sign_in_at as first, last_sign_in_at as last from app_user')
  for (const time of [user?.first, user?.last]) assert.ok(Math.abs((time?.getTime() ?? NaN) - MONDAY.getTime()) < 1000, String(time))
  const [event] = await readAudit(owner, SCHOOL_SCOPE)
  assert.equal(event?.action, 'admin.bootstrapped')
  assert.ok(Math.abs(Date.parse(event?.at ?? '') - MONDAY.getTime()) < 1000, event?.at)

  clock.advance(SESSION_SECONDS * 1000 - 5_000)
  assert.equal((await me(h, anna)).status, 200)
  clock.advance(10_000)
  assert.equal((await me(h, anna)).status, 204, 'eight hours on the clock: signed out')
})
