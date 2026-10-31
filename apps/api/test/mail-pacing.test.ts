// Mail pacing (migration 0013), on a clock the test moves: one claim per
// spacing, measured from the last claim the database holds, so a sender
// started anew keeps it; the mails someone waits for first, then the
// staff's, then the students'; nothing while sending is paused, which an
// organizer sets and the school's audit chain records; a reminder still
// queued at the end of its window is never sent, nor one a transient
// failure puts back while the window ends.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import type { MailKind } from '@school-allocation/api-contracts/mail'
import { loadConfig } from '../config.ts'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { createDatabase, type Database } from '../lib/db.ts'
import { claimNextMail, enqueueMail, expireCampaignMails, expireMails, recordRetry, spacingOf, type NewMail } from '../lib/mail/outbox.ts'
import { Sender } from '../lib/mail/sender.ts'
import type { MailTransport } from '../lib/mail/transport.ts'
import { ControlledClock } from './helpers/clock.ts'
import { createTestDatabase } from './helpers/db.ts'
import { ORIGIN, secretFile, SERVER_ENV } from './helpers/env.ts'
import { DB, get, harness, send, signIn } from './helpers/harness.ts'
import { ANNA, BERND } from './helpers/personas.ts'

const MONDAY = new Date('2034-03-06T07:00:00.000Z') // 08:00 in Vienna
const TID = '3f2b8c1d-6e4a-4b7f-9c2d-8a1e5f6b7c90'
/** 200 an hour, the default: 18 seconds. */
const SPACING = spacingOf(200)

function mail(kind: MailKind, n: number, extra: Partial<NewMail> = {}): NewMail {
  return { kind, campaignId: null, personId: null, to: `p${n}@schule.example.org`, subject: 's', body: 'b', dedupeKey: `pacing:${kind}:${n}`, ...extra }
}

/** Queues each mail in a transaction of its own, so each has a time of its own. */
async function queue(db: Database, ...mails: NewMail[]): Promise<void> {
  for (const m of mails) await db.tx((client) => enqueueMail(client, m))
}

/** Whom the next claim takes; fails when it takes nobody. */
async function claimed(db: Database): Promise<string> {
  const claim = await claimNextMail(db, SPACING)
  if (claim.mail === undefined) return assert.fail(`no mail, next in ${claim.retryInMs} ms`)
  return claim.mail.to
}

/** How long until a claim may take a mail (null: until something changes); fails when it took one. */
async function waitOf(db: Database): Promise<number | null> {
  const claim = await claimNextMail(db, SPACING)
  if (claim.mail !== undefined) return assert.fail(`claimed ${claim.mail.to}`)
  return claim.retryInMs
}

test('one claim per spacing, measured from the last one the database holds; the personal mails first, then the staff\'s, then the students\'', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const clock = new ControlledClock(MONDAY)
  const db = createDatabase(testDb.runtimeUrl, () => {}, clock)
  t.after(() => db.close())
  assert.equal(await waitOf(db), null, 'an empty queue: nothing to wait for')

  // Queued in the opposite order of their turns, the bulk first.
  await queue(db, mail('choice_invitation', 1), mail('result_published', 2), mail('class_missing', 3), mail('item_cancelled', 4),
    mail('swap_confirmed', 5), mail('choice_reminder', 6, { priority: 1 }))
  assert.equal(await claimed(db), 'p5@schule.example.org')
  const wait = await waitOf(db)
  assert.ok(wait !== null && wait > SPACING - 50 && wait <= SPACING, String(wait))
  clock.advance(10_000)
  const later = await waitOf(db)
  assert.ok(later !== null && later > SPACING - 10_050 && later <= SPACING - 10_000, String(later))
  const order = []
  for (let i = 0; i < 5; i++) {
    clock.advance(SPACING)
    order.push(await claimed(db))
  }
  assert.deepEqual(order, ['p6', 'p3', 'p4', 'p1', 'p2'].map((p) => `${p}@schule.example.org`), 'a test mail of any kind is personal; age decides within a priority')
})

test('a reminder still queued at the end of its window expires and is never sent', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const clock = new ControlledClock(MONDAY)
  const db = createDatabase(testDb.runtimeUrl, () => {}, clock)
  t.after(() => db.close())
  const closesAt = new Date(MONDAY.getTime() + 3_600_000).toISOString()
  await queue(db, mail('choice_reminder', 1, { expiresAt: closesAt }), mail('choice_invitation', 2))
  clock.advance(3_600_000)
  assert.equal(await expireMails(db), 1)
  assert.equal(await claimed(db), 'p2@schule.example.org')
  clock.advance(SPACING)
  assert.equal(await waitOf(db), null)
  const owner = createDatabase(testDb.ownerUrl, () => {})
  t.after(() => owner.close())
  const { rows } = await owner.query<{ kind: string, state: string, attempts: number }>('select kind, state, attempts from outbox_mail order by to_address')
  assert.deepEqual(rows, [{ kind: 'choice_reminder', state: 'expired', attempts: 0 }, { kind: 'choice_invitation', state: 'sending', attempts: 1 }])
})

test('a reminder failing transiently while its window ends early expires all the same: the end waits for the retry and reads it again', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const clock = new ControlledClock(MONDAY)
  const db = createDatabase(testDb.runtimeUrl, () => {}, clock)
  t.after(() => db.close())
  const owner = createDatabase(testDb.ownerUrl, () => {})
  t.after(() => owner.close())
  const { rows: [user] } = await owner.query<{ id: string }>('insert into app_user (tid, oid, display_name) values ($1, $2, $3) returning id', [TID, ANNA.oid, ANNA.name])
  const { rows: [campaign] } = await owner.query<{ id: string }>(
    `insert into campaign (kind, name, school_year, project_days, created_by) values ('project_week', 'PW', '2033/34', '{2034-07-03}', $1) returning id`, [user?.id],
  )
  const campaignId = campaign?.id ?? assert.fail('no campaign')
  await queue(db, mail('choice_reminder', 1, { campaignId, expiresAt: new Date(MONDAY.getTime() + 7 * 86_400_000).toISOString() }))
  const id = (await claimNextMail(db, SPACING)).mail?.id ?? assert.fail('no mail')

  // The mail server's 451 is being recorded when the window ends a week early.
  let pid: number | undefined
  let expiry: Promise<number> | undefined
  await db.tx(async (client) => {
    await recordRetry(client, id, '451 busy', 0)
    expiry = db.tx(async (other) => {
      pid = (await other.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]?.pid
      return expireCampaignMails(other, campaignId, ['choice_reminder'])
    })
    expiry.catch(() => {}) // awaited below; a failure meanwhile must not end the process
    for (let i = 0; ; i++) {
      if (pid !== undefined && (await owner.query('select 1 from pg_locks where pid = $1 and not granted', [pid])).rows.length > 0) break
      if (i === 500) assert.fail('the end of the window never waited for the retry')
      await sleep(10)
    }
  })
  assert.equal(await expiry, 1)
  const { rows } = await owner.query<{ state: string, expired: boolean }>('select state, expires_at <= $1 as expired from outbox_mail', [clock.peek()])
  assert.deepEqual(rows, [{ state: 'expired', expired: true }])
  clock.advance(SPACING)
  assert.equal(await waitOf(db), null)
})

test('a sender started anew keeps the spacing; an organizer pauses sending and resumes it, audited, and the status says what waits and until when', DB, async (t) => {
  const clock = new ControlledClock(MONDAY)
  const smtp = { SMTP_HOST: '127.0.0.1', SMTP_USER: 'wahl', SMTP_PASSWORD_FILE: secretFile('smtp-password', 'x\n'), MAIL_FROM: 'SchulWahl <wahl@schule.example.org>' }
  const env = { BOOTSTRAP_ADMINS: ANNA.email ?? '', ...smtp }
  const h = await harness(t, env, undefined, clock)
  const config = loadConfig({ ...SERVER_ENV, PUBLIC_URL: ORIGIN, ...env })
  assert.ok(config.mail)
  const sent: string[] = []
  const transport: MailTransport = {
    send: (message) => {
      sent.push(typeof message.to === 'string' ? message.to : JSON.stringify(message.to))
      return Promise.resolve({ ok: true, response: '250 OK' })
    },
    close: () => {},
  }
  const senderOf = () => new Sender({ db: h.db, transport, config: config.mail!, log: h.app.log })
  const anna = await signIn(h, ANNA)
  const bernd = await signIn(h, BERND)

  await queue(h.db, mail('choice_invitation', 1), mail('choice_invitation', 2), mail('class_missing', 3), mail('swap_confirmed', 4))
  type Status = { paused: boolean, perHour: number | null, waiting: Record<string, number>, sending: number, expectedEndAt: string | null }
  const status = async () => (await get<Status>(h, anna, '/api/admin/mail/status')).body
  const before = await status()
  assert.deepEqual([before.perHour, before.waiting, before.sending], [200, { personal: 1, staff: 1, students: 2 }, 0])
  // Nothing claimed yet: the first goes now, the last three spacings later.
  const end = Date.parse(before.expectedEndAt ?? '') - clock.peek().getTime()
  assert.ok(end > 3 * SPACING - 100 && end <= 3 * SPACING, String(end))

  const first = senderOf()
  assert.equal(await first.runOnce(), 1)
  await first.stop()
  // A restart: a sender with nothing in memory waits all the same.
  const second = senderOf()
  t.after(() => second.stop())
  assert.equal(await second.runOnce(), 0)
  clock.advance(SPACING)
  assert.equal(await second.runOnce(), 1)
  assert.deepEqual(sent, ['p4@schule.example.org', 'p3@schule.example.org'])

  // Paused: nothing goes, nothing is due; the second pause changes nothing.
  assert.equal((await send(h, bernd, 'PUT', '/api/admin/mail/paused', { paused: true })).status, 403, 'a teacher does not pause the school\'s mail')
  const paused = await send<Status>(h, anna, 'PUT', '/api/admin/mail/paused', { paused: true })
  assert.equal(paused.status, 200, JSON.stringify(paused.body))
  assert.deepEqual([paused.body.paused, paused.body.waiting, paused.body.expectedEndAt], [true, { personal: 0, staff: 0, students: 2 }, null])
  assert.equal((await send(h, anna, 'PUT', '/api/admin/mail/paused', { paused: true })).status, 200)
  clock.advance(3_600_000)
  assert.equal(await second.runOnce(), 0)
  assert.equal(await waitOf(h.db), null, 'paused: not until it is resumed')
  assert.equal(sent.length, 2)

  const resumed = await send<Status>(h, anna, 'PUT', '/api/admin/mail/paused', { paused: false })
  assert.deepEqual([resumed.body.paused, resumed.body.expectedEndAt === null], [false, false])
  assert.equal(await second.runOnce(), 1)
  assert.deepEqual(sent.slice(2), ['p1@schule.example.org'])
  const owner = createDatabase(h.ownerUrl, () => {})
  t.after(() => owner.close())
  const actions = (await readAudit(owner, SCHOOL_SCOPE)).filter((e) => e.action.startsWith('mail.')).map((e) => [e.action, e.actor.name])
  assert.deepEqual(actions, [['mail.paused', ANNA.name], ['mail.resumed', ANNA.name]])
  assert.equal((await send(h, anna, 'PUT', '/api/admin/mail/paused', { paused: 'yes' })).status, 400)
})
