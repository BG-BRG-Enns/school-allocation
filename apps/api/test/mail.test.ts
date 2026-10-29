// Mail: the templates an organizer edits, checked against the subset and
// their kind's placeholders; the test mail through the real outbox and an
// SMTP stand-in with authentication; the sender's states: sent on the
// server's acceptance, retried on a transient reply, failed on a permanent
// one or after the last attempt, and interrupted work failed at start.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfig } from '../config.ts'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { createDatabase } from '../lib/db.ts'
import { recoverInterruptedMails } from '../lib/mail/outbox.ts'
import { Sender } from '../lib/mail/sender.ts'
import { createMailTransport } from '../lib/mail/transport.ts'
import { checkTemplate, renderTemplate } from '../services/mail-templates.ts'
import { ORIGIN, secretFile, SERVER_ENV } from './helpers/env.ts'
import { bodyOf, decodeHeader, headerOf, startFakeSmtp, type FakeSmtp } from './helpers/fake-smtp.ts'
import { DB, get, harness, send, signIn } from './helpers/harness.ts'
import { ANNA, BERND } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }

/** The mail settings for a stand-in on `smtp`: plain, authenticated, no TLS, as a test server on a private network. */
function mailEnv(smtp: FakeSmtp): Record<string, string> {
  return {
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), SMTP_SECURE: 'false', SMTP_REQUIRE_TLS: 'false',
    SMTP_USER: 'wahl', SMTP_PASSWORD_FILE: secretFile('smtp-password', 'test-password\n'),
    MAIL_FROM: 'SchulWahl <wahl@schule.example.org>', MAIL_REPLY_TO: 'sekretariat@schule.example.org',
  }
}

test('a template is checked against the subset and its kind\'s placeholders; a save is audited; the test mail needs mail to be set up', DB, async (t) => {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const list = await get<{ templates: { kind: string, placeholders: string[] }[], mailEnabled: boolean }>(h, anna, '/api/admin/mail-templates')
  assert.equal(list.status, 200)
  assert.deepEqual(list.body.templates.map((tpl) => tpl.kind), ['choice_invitation', 'choice_reminder', 'class_missing', 'grace_invitation', 'grace_reminder', 'missed_deadline'])
  assert.deepEqual(list.body.templates.find((tpl) => tpl.kind === 'class_missing')?.placeholders, ['vorname', 'name', 'wahl', 'link', 'klasse', 'fenster', 'liste'])
  assert.equal(list.body.mailEnabled, false)
  assert.equal((await get(h, await signIn(h, BERND), '/api/admin/mail-templates')).status, 403)

  const each = await send<{ error: string, problems: { code: string, message: string }[] }>(h, anna, 'PUT', '/api/admin/mail-templates/choice_reminder', { subject: 'x', body: '{{#each a}}y{{/each}}' })
  assert.equal(each.status, 422)
  assert.deepEqual(each.body.problems.map((p) => p.code), ['body_syntax'])
  const stranger = await send<{ problems: { code: string, message: string }[] }>(h, anna, 'PUT', '/api/admin/mail-templates/choice_reminder', { subject: '{{klasse}}', body: 'Hallo {{vorname}}, {{liste}}' })
  assert.deepEqual(stranger.body.problems, [{ code: 'unknown_placeholder', message: 'klasse' }, { code: 'unknown_placeholder', message: 'liste' }])
  assert.equal((await send(h, anna, 'PUT', '/api/admin/mail-templates/nope', { subject: 'x', body: 'y' })).status, 400)
  const empty = await send<{ problems: { code: string }[] }>(h, anna, 'PUT', '/api/admin/mail-templates/choice_reminder', { subject: '{{#if name}}{{else}}Hinweis{{/if}}', body: 'x' })
  assert.deepEqual(empty.body.problems.map((p) => p.code), ['subject_empty'], 'a subject that renders empty for a named recipient would block the notice')
  assert.equal(renderTemplate({ subject: '{{frist}}', body: 'x' }, {}).subject, 'SchulWahl', 'and never reaches the outbox empty')
  const saved = await send<{ template: { subject: string, body: string } }>(h, anna, 'PUT', '/api/admin/mail-templates/choice_reminder', { subject: 'Erinnerung: {{wahl}}', body: 'Hallo {{vorname}},\n{{#if frist}}bis {{frist}}{{/if}}: {{link}}' })
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  assert.equal(saved.body.template.subject, 'Erinnerung: {{wahl}}')
  const owner = createDatabase(h.ownerUrl, () => {})
  t.after(() => owner.close())
  assert.deepEqual((await readAudit(owner, SCHOOL_SCOPE)).at(-1)?.action, 'mail.template-changed')

  assert.deepEqual(renderTemplate(saved.body.template, { vorname: 'Sara', wahl: 'Projektwoche', frist: 'Mo., 08.03.', link: 'https://x' }), { subject: 'Erinnerung: Projektwoche', body: 'Hallo Sara,\nbis Mo., 08.03.: https://x' })
  assert.deepEqual(renderTemplate({ subject: 'a <b>', body: '{{name}}' }, { name: 'A & B' }), { subject: 'a <b>', body: 'A & B' }, 'plain text: nothing is escaped')
  assert.equal(renderTemplate({ subject: 'x', body: '{{name}}'.repeat(2000) }, { name: 'y'.repeat(100) }).body.length, 100_000, 'a body that renders past the outbox\'s bound is cut while rendering, never refused: a template must not block a transition')
  assert.deepEqual(checkTemplate('missed_deadline', '{{vorname', 'x'), [{ code: 'subject_syntax', message: 'Unclosed mustache at line 1, column 1' }])

  const off = await send<{ error: string }>(h, anna, 'POST', '/api/admin/mail-templates/choice_reminder/test')
  assert.equal(off.status, 409)
  assert.equal(off.body.error, 'mail_off')
})

test('the test mail goes through the outbox to an authenticated SMTP server; transient replies are retried, permanent ones fail; interrupted work is failed at start', DB, async (t) => {
  const replies: string[] = []
  const smtp = await startFakeSmtp({ dataReply: () => replies.shift() ?? '250 OK queued' })
  t.after(() => smtp.close())
  const env = { ...ADMIN, ...mailEnv(smtp) }
  const h = await harness(t, env)
  const config = loadConfig({ ...SERVER_ENV, PUBLIC_URL: ORIGIN, ...env })
  assert.ok(config.mail)
  const sender = new Sender({ db: h.db, transport: createMailTransport(config.mail), config: config.mail, log: h.app.log, retryDelayMs: 20, maxAttempts: 2 })
  t.after(() => sender.stop())
  const anna = await signIn(h, ANNA)
  assert.deepEqual((await get<{ mailEnabled: boolean, queued: number }>(h, anna, '/api/admin/mail/status')).body, { mailEnabled: true, queued: 0 })

  const queued = await send<{ queued: boolean }>(h, anna, 'POST', '/api/admin/mail-templates/choice_invitation/test')
  assert.equal(queued.status, 202, JSON.stringify(queued.body))
  assert.equal(await sender.runOnce(), 1)
  assert.equal(smtp.received.length, 1)
  const mail = smtp.received[0]!
  assert.deepEqual(smtp.logins, ['wahl'])
  assert.equal(mail.from, 'wahl@schule.example.org')
  assert.deepEqual(mail.to, [ANNA.email])
  assert.equal(headerOf(mail.data, 'From'), 'SchulWahl <wahl@schule.example.org>')
  assert.equal(headerOf(mail.data, 'Reply-To'), 'sekretariat@schule.example.org')
  assert.equal(decodeHeader(headerOf(mail.data, 'Subject') ?? ''), '[TEST] Projektwoche Projektwoche 2027: Wünsche bis Mo., 08.03.2027, 20:00 abgeben')
  assert.match(headerOf(mail.data, 'Message-ID') ?? '', /^<[0-9a-f-]+@schule\.example\.org>$/)
  assert.match(bodyOf(mail.data), /Hallo Maria,/)
  const owner = createDatabase(h.ownerUrl, () => {})
  t.after(() => owner.close())
  const rows = async () => (await owner.query<{ kind: string, state: string, attempts: number, detail: string | null }>('select kind, state, attempts, detail from outbox_mail order by created_at')).rows
  assert.deepEqual((await rows()).map((r) => [r.state, r.attempts]), [['sent', 1]])
  assert.match((await rows())[0]?.detail ?? '', /250 OK queued/)
  assert.deepEqual((await readAudit(owner, SCHOOL_SCOPE)).at(-1)?.action, 'mail.test-sent')

  // A transient reply: retried after the pause; after the last attempt, failed.
  replies.push('451 4.7.0 busy', '451 4.7.0 busy again')
  await send(h, anna, 'POST', '/api/admin/mail-templates/choice_reminder/test')
  assert.equal(await sender.runOnce(), 0)
  assert.deepEqual((await rows()).at(-1)?.state, 'queued', 'back in the queue for the retry')
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(await sender.runOnce(), 0)
  const failed = (await rows()).at(-1)
  assert.deepEqual([failed?.state, failed?.attempts], ['failed', 2])
  assert.match(failed?.detail ?? '', /451 4\.7\.0 busy again/)

  // A permanent reply fails at once.
  replies.push('550 5.1.1 no such user')
  await send(h, anna, 'POST', '/api/admin/mail-templates/missed_deadline/test')
  await sender.runOnce()
  assert.deepEqual((await rows()).at(-1)?.state, 'failed')
  assert.equal((await rows()).at(-1)?.attempts, 1)

  // Left in sending by a process that died: failed at the next start, with the detail saying so.
  await send(h, anna, 'POST', '/api/admin/mail-templates/grace_reminder/test')
  await owner.query('update outbox_mail set state = \'sending\', attempts = 1 where state = \'queued\'')
  assert.equal(await recoverInterruptedMails(h.db), 1)
  assert.deepEqual((await rows()).at(-1), { kind: 'grace_reminder', state: 'failed', attempts: 1, detail: 'interrupted' })
  assert.deepEqual((await get<{ queued: number }>(h, anna, '/api/admin/mail/status')).body.queued, 0)
})
