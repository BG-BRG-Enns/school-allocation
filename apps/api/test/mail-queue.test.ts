// The mail queue an organizer sees and manages: every mail by state, kind
// and registration without subject or text; waiting ones taken out of the
// queue, audited; a failed or discarded one queued again as a copy; who
// may.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DiscardResponse, MailQueueResponse, RetryResponse } from '@school-allocation/api-contracts/mail'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import { secretFile } from './helpers/env.ts'
import { startFakeSmtp } from './helpers/fake-smtp.ts'
import { DB, get, harness, send, signIn } from './helpers/harness.ts'
import { ANNA, BERND } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }

test('the queue lists every mail without its text, by state and kind; waiting ones are discarded and audited; a discarded or failed one is sent again as a copy; a teacher may not', DB, async (t) => {
  const smtp = await startFakeSmtp()
  t.after(() => smtp.close())
  const env = {
    ...ADMIN, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), SMTP_SECURE: 'false', SMTP_REQUIRE_TLS: 'false',
    SMTP_USER: 'wahl', SMTP_PASSWORD_FILE: secretFile('smtp-password', 'test-password\n'),
    MAIL_FROM: 'SchulWahl <wahl@schule.example.org>',
  }
  // No sender in the harness: what is queued stays queued.
  const h = await harness(t, env)
  const anna = await signIn(h, ANNA)
  assert.equal((await send(h, anna, 'PUT', '/api/admin/mail/paused', { paused: true })).status, 200)
  for (const kind of ['choice_invitation', 'choice_reminder', 'class_missing']) {
    assert.equal((await send(h, anna, 'POST', `/api/admin/mail-templates/${kind}/test`)).status, 202)
  }
  const all = await get<MailQueueResponse>(h, anna, '/api/admin/mail')
  assert.equal(all.status, 200, JSON.stringify(all.body))
  assert.equal(all.body.total, 3)
  assert.deepEqual(all.body.mails.map((m) => [m.kind, m.state, m.to, m.campaignName]), [['class_missing', 'queued', ANNA.email, null], ['choice_reminder', 'queued', ANNA.email, null], ['choice_invitation', 'queued', ANNA.email, null]])
  assert.ok(all.body.mails.every((m) => !('subject' in m) && !('body' in m) && !('dedupeKey' in m)), 'never the text, never the key')
  const reminders = await get<MailQueueResponse>(h, anna, '/api/admin/mail?kind=choice_reminder&state=queued&limit=1')
  assert.equal(reminders.status, 200, JSON.stringify(reminders.body))
  assert.deepEqual([reminders.body.total, reminders.body.mails.length], [1, 1])
  assert.equal((await get(h, anna, '/api/admin/mail?limit=0')).status, 400)
  assert.equal((await get(h, anna, '/api/admin/mail?limit=5000')).status, 400)

  // Two taken out of the queue: expired, marked discarded, one audit event with the counts by kind.
  const [first, second, third] = all.body.mails
  assert.ok(first && second && third)
  const discarded = await send<DiscardResponse>(h, anna, 'POST', '/api/admin/mail/discard', { ids: [first.id, second.id] })
  assert.equal(discarded.status, 200, JSON.stringify(discarded.body))
  assert.equal(discarded.body.discarded, 2)
  const expired = await get<MailQueueResponse>(h, anna, '/api/admin/mail?state=expired')
  assert.deepEqual(expired.body.mails.map((m) => [m.id, m.detail]), [[first.id, 'discarded'], [second.id, 'discarded']])
  assert.equal((await get<MailQueueResponse>(h, anna, '/api/admin/mail?state=queued')).body.total, 1)
  const audit = (await readAudit(h.db, SCHOOL_SCOPE)).filter((e) => e.action === 'mail.discarded')
  assert.equal(audit.length, 1)
  assert.deepEqual(audit[0]?.metadata, { discarded: 2, inFlight: 0, byKind: { class_missing: 1, choice_reminder: 1 } })
  // The same again takes nothing and records nothing.
  assert.equal((await send<DiscardResponse>(h, anna, 'POST', '/api/admin/mail/discard', { ids: [first.id] })).body.discarded, 0)
  assert.equal((await readAudit(h.db, SCHOOL_SCOPE)).filter((e) => e.action === 'mail.discarded').length, 1)

  // Sent again: a copy queued under a new key, the original as it was; only a failed or discarded one.
  const retried = await send<RetryResponse>(h, anna, 'POST', `/api/admin/mail/${first.id}/retry`)
  assert.equal(retried.status, 200, JSON.stringify(retried.body))
  assert.deepEqual([retried.body.mail.kind, retried.body.mail.state, retried.body.mail.to], [first.kind, 'queued', first.to])
  assert.notEqual(retried.body.mail.id, first.id)
  assert.equal((await get<MailQueueResponse>(h, anna, `/api/admin/mail?state=expired`)).body.total, 2)
  assert.equal((await readAudit(h.db, SCHOOL_SCOPE)).filter((e) => e.action === 'mail.retried').length, 1)
  const notFailed = await send<{ error: string }>(h, anna, 'POST', `/api/admin/mail/${third.id}/retry`)
  assert.deepEqual([notFailed.status, notFailed.body.error], [409, 'mail_state'])
  assert.equal((await send(h, anna, 'POST', '/api/admin/mail/00000000-0000-4000-8000-000000000000/retry')).status, 404)

  // By registration: a registration without mails takes nothing; an unknown one is refused.
  const created = await send<Campaign>(h, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: ['2027-06-21'] })
  assert.equal(created.status, 201)
  assert.equal((await send<DiscardResponse>(h, anna, 'POST', '/api/admin/mail/discard', { campaignId: created.body.id })).body.discarded, 0)
  assert.equal((await get<MailQueueResponse>(h, anna, `/api/admin/mail?campaignId=${created.body.id}`)).body.total, 0)
  assert.equal((await send(h, anna, 'POST', '/api/admin/mail/discard', { campaignId: '00000000-0000-4000-8000-000000000000' })).status, 404)
  assert.equal((await send(h, anna, 'POST', '/api/admin/mail/discard', {})).status, 400)

  // A teacher sees and manages nothing of it.
  const bernd = await signIn(h, BERND)
  assert.equal((await get(h, bernd, '/api/admin/mail')).status, 403)
  assert.equal((await send(h, bernd, 'POST', '/api/admin/mail/discard', { ids: [third.id] })).status, 403)
  assert.equal((await send(h, bernd, 'POST', `/api/admin/mail/${first.id}/retry`)).status, 403)
})
