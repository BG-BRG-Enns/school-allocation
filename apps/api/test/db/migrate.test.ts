// The migrator against a real server: idempotent, and the runtime role ends
// up with exactly the listed rights. What the triggers keep, whoever writes.

import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { migrate, MigrationError, MIGRATIONS_DIR, ownSchema } from '../../scripts/migrate.ts'
import { checkSchema } from '../../lib/db.ts'
import { RUNTIME_TABLES } from '../../lib/runtime-privileges.ts'
import { SQLSTATE, sqlState } from '../../lib/pg-errors.ts'
import { LOCALES } from '@school-allocation/messages'
import { checkedValues, createTestDatabase, DB, migrateTestDatabase, TEST_RUNTIME_PASSWORD, withClient } from '../helpers/db.ts'

const TID = '3f2b8c1d-6e4a-4b7f-9c2d-8a1e5f6b7c90'
const OID = 'a0000000-0000-4000-8000-00000000000a'

test('a second run applies nothing, and every table in public is either granted or deliberately not', DB, async (t) => {
  const db = await createTestDatabase(t)
  assert.deepEqual(await migrate({ databaseUrl: db.ownerUrl, runtimePassword: TEST_RUNTIME_PASSWORD }), [])
  const tables = await withClient(db.ownerUrl, async (c) => (await c.query<{ name: string }>(
    'select relname::text as name from pg_class where relnamespace = \'public\'::regnamespace and relkind in (\'r\', \'p\', \'v\', \'m\')',
  )).rows.map((r) => r.name).sort())
  // schema_migrations too: the server reads it to check the schema.
  assert.deepEqual(tables, Object.keys(RUNTIME_TABLES).sort())
})

test('the runtime role may not create, may not change identities, and may not touch the audit log', DB, async (t) => {
  const db = await createTestDatabase(t)
  await withClient(db.runtimeUrl, async (c) => {
    const refused = async (sql: string, code: string = SQLSTATE.insufficientPrivilege) => {
      await assert.rejects(c.query(sql), (err: unknown) => sqlState(err) === code, sql)
    }
    await refused('create table x (id int)')
    await c.query('insert into app_user (tid, oid, display_name) values ($1, $2, $3)', [TID, OID, 'Anna'])
    await c.query('update app_user set display_name = $1 where oid = $2', ['Anna L.', OID])
    await refused(`update app_user set oid = '${TID}'`)
    await refused('delete from app_user')
    await refused('delete from audit_event')
    await refused('update audit_event set action = \'x\'')
    await refused('delete from schema_migrations')
    await refused('update schema_migrations set schema_version = 1')
    await refused('delete from role_grant')
    await refused('update role_grant set reason = \'x\'')
  })
})

test('a role grant is revoked, never changed or removed; the audit log is append-only, for the owner too', DB, async (t) => {
  const db = await createTestDatabase(t)
  await withClient(db.ownerUrl, async (c) => {
    const { rows: [user] } = await c.query<{ id: string }>('insert into app_user (tid, oid, display_name) values ($1, $2, $3) returning id', [TID, OID, 'Anna'])
    const { rows: [grant] } = await c.query<{ id: string }>(
      'insert into role_grant (user_id, role, granted_by, reason) values ($1, \'school_admin\', $1, \'test\') returning id', [user?.id],
    )
    const refused = async (sql: string, values: unknown[] = []) => {
      await assert.rejects(c.query(sql, values), (err: unknown) => sqlState(err) === SQLSTATE.objectNotInPrerequisiteState, sql)
    }
    await refused('update role_grant set reason = \'changed\' where id = $1', [grant?.id])
    await refused('update role_grant set role = \'read_only_auditor\' where id = $1', [grant?.id])
    await refused('delete from role_grant where id = $1', [grant?.id])
    // The same person cannot hold the same school-wide role twice at once.
    await assert.rejects(c.query('insert into role_grant (user_id, role, granted_by, reason) values ($1, \'school_admin\', $1, \'again\')', [user?.id]), (err: unknown) => sqlState(err) === '23505')
    await c.query('update role_grant set revoked_at = now(), revoked_by = $2 where id = $1', [grant?.id, user?.id])
    await refused('update role_grant set revoked_at = null, revoked_by = null where id = $1', [grant?.id])
    // Revoked, the role can be granted anew.
    await c.query('insert into role_grant (user_id, role, granted_by, reason) values ($1, \'school_admin\', $1, \'again\')', [user?.id])

    await c.query(
      `insert into audit_event (scope_id, at, actor_tid, actor_oid, actor_name, action, metadata, hash)
       values ('00000000-0000-0000-0000-000000000000', date_trunc('milliseconds', now()), $1, $2, 'Anna', 'role.granted', '{}', repeat('0', 64))`,
      [TID, OID],
    )
    await refused('update audit_event set action = \'role.revoked\'')
    await refused('delete from audit_event')
    await refused('truncate audit_event')
    await refused('truncate role_grant')
  })
})

test('a batch is decided once, an entry is resolved once, a binding is closed and never removed, and none of them is truncated', DB, async (t) => {
  const db = await createTestDatabase(t)
  await withClient(db.ownerUrl, async (c) => {
    const refused = async (sql: string, values: unknown[] = []) => {
      await assert.rejects(c.query(sql, values), (err: unknown) => sqlState(err) === SQLSTATE.objectNotInPrerequisiteState, sql)
    }
    const { rows: [user] } = await c.query<{ id: string }>('insert into app_user (tid, oid, display_name) values ($1, $2, $3) returning id', [TID, OID, 'Anna'])
    const { rows: [batch] } = await c.query<{ id: string }>(
      `insert into import_batch (source, school_year, payload_sha256, row_count, triggered_by, diff_summary) values ('csv', '2026/27', repeat('a', 64), 1, $1, '{}') returning id`, [user?.id],
    )
    const { rows: [entry] } = await c.query<{ id: string }>(
      `insert into roster_entry (batch_id, kind, mail, display_name, class_name, grade) values ($1, 'student', 'Sara@schule.example.org', 'Sara', '5A', 9) returning id`, [batch?.id],
    )
    // The same key twice in one batch, whatever the case of the address.
    await assert.rejects(c.query(`insert into roster_entry (batch_id, kind, mail, display_name, class_name, grade) values ($1, 'teacher', 'sara@schule.example.org', 'Sara', null, null)`, [batch?.id]), (err: unknown) => sqlState(err) === SQLSTATE.uniqueViolation)
    // A student needs a class and a grade.
    await assert.rejects(c.query(`insert into roster_entry (batch_id, kind, mail, display_name) values ($1, 'student', 'tim@schule.example.org', 'Tim')`, [batch?.id]), (err: unknown) => sqlState(err) === '23514')

    await refused('update import_batch set school_year = \'2027/28\' where id = $1', [batch?.id])
    await refused('delete from import_batch where id = $1', [batch?.id])
    await refused('update roster_entry set display_name = \'Sarah\' where id = $1', [entry?.id])
    await refused('delete from roster_entry where id = $1', [entry?.id])
    // A batch is born pending or rejected, and is committed only once every entry has its person.
    await refused(`insert into import_batch (source, state, school_year, payload_sha256, row_count, triggered_by, diff_summary, decided_at, decided_by) values ('csv', 'committed', '2026/27', repeat('b', 64), 0, $1, '{}', now(), $1)`, [user?.id])
    await refused(`update import_batch set state = 'committed', decided_at = now(), decided_by = $2 where id = $1`, [batch?.id, user?.id])
    const { rows: [person] } = await c.query<{ id: string }>('insert into person default values returning id')
    await c.query('update roster_entry set person_id = $2 where id = $1', [entry?.id, person?.id])
    await refused('update roster_entry set person_id = null where id = $1', [entry?.id])
    await c.query(`update import_batch set state = 'committed', decided_at = now(), decided_by = $2 where id = $1`, [batch?.id, user?.id])
    await refused(`update import_batch set state = 'discarded' where id = $1`, [batch?.id])

    const { rows: [binding] } = await c.query<{ id: string }>(
      `insert into identity_binding (person_id, tid, oid, method, bound_by) values ($1, $2, $3, 'email_match', $4) returning id`, [person?.id, TID, OID, user?.id],
    )
    // One active binding per identity and per person.
    await assert.rejects(c.query(`insert into identity_binding (person_id, tid, oid, method, bound_by) values ($1, $2, $3, 'admin', $4)`, [person?.id, TID, '0000000b-0000-4000-8000-00000000000b', user?.id]), (err: unknown) => sqlState(err) === SQLSTATE.uniqueViolation)
    await refused('update identity_binding set method = \'admin\' where id = $1', [binding?.id])
    await refused('delete from identity_binding where id = $1', [binding?.id])
    await c.query('update identity_binding set unbound_at = now(), unbound_by = $2, unbind_reason = \'x\' where id = $1', [binding?.id, user?.id])
    await refused('update identity_binding set unbound_at = null, unbound_by = null, unbind_reason = null where id = $1', [binding?.id])
    // Closed, the identity and the person can be bound anew.
    await c.query(`insert into identity_binding (person_id, tid, oid, method, bound_by) values ($1, $2, $3, 'admin', $4)`, [person?.id, TID, OID, user?.id])
    for (const table of ['import_batch', 'roster_entry', 'identity_binding']) await refused(`truncate ${table} cascade`)
  })
})

test('an item past draft is withdrawn rather than removed, keeps its campaign and its number; a campaign is never removed by the runtime role', DB, async (t) => {
  const db = await createTestDatabase(t)
  await withClient(db.ownerUrl, async (c) => {
    const refused = async (sql: string, values: unknown[] = []) => {
      await assert.rejects(c.query(sql, values), (err: unknown) => sqlState(err) === SQLSTATE.objectNotInPrerequisiteState, sql)
    }
    const { rows: [user] } = await c.query<{ id: string }>('insert into app_user (tid, oid, display_name) values ($1, $2, $3) returning id', [TID, OID, 'Anna'])
    const { rows: [campaign] } = await c.query<{ id: string }>(
      `insert into campaign (kind, name, school_year, project_days, created_by) values ('project_week', 'PW', '2026/27', '{2027-06-21}', $1) returning id`, [user?.id],
    )
    const { rows: [item] } = await c.query<{ id: string }>(
      `insert into catalog_item (campaign_id, title, places, proposed_by) values ($1, 'Klettern', 10, $2) returning id`, [campaign?.id, user?.id],
    )
    await c.query(`update catalog_item set state = 'proposed' where id = $1`, [item?.id])
    await refused('delete from catalog_item where id = $1', [item?.id])
    await refused('update catalog_item set proposed_by = $2 where id = $1', [item?.id, user?.id === undefined ? null : '00000000-0000-4000-8000-000000000000'])
    await c.query(`update catalog_item set state = 'approved', approved_at = now(), approved_by = $2, number = 1 where id = $1`, [item?.id, user?.id])
    await refused('update catalog_item set number = 2 where id = $1', [item?.id])
    // Back in draft but numbered: it was in a published catalogue once, so it stays.
    await c.query(`update catalog_item set state = 'draft', approved_at = null, approved_by = null where id = $1`, [item?.id])
    await refused('delete from catalog_item where id = $1', [item?.id])
    await refused('truncate catalog_item cascade')
    // A withdrawn item needs the time, the person and the reason.
    await assert.rejects(c.query(`update catalog_item set state = 'withdrawn' where id = $1`, [item?.id]), (err: unknown) => sqlState(err) === '23514')
    await assert.rejects(c.query(`update catalog_item set state = 'withdrawn', withdrawn_at = now(), withdrawn_by = $2 where id = $1`, [item?.id, user?.id]), (err: unknown) => sqlState(err) === '23514')
    await c.query(`update catalog_item set state = 'withdrawn', withdrawn_at = now(), withdrawn_by = $2, withdraw_reason = 'doppelt' where id = $1`, [item?.id, user?.id])
  })
  // The runtime role may add and change campaigns, not remove them.
  await withClient(db.runtimeUrl, async (c) => {
    await assert.rejects(c.query('delete from campaign'), (err: unknown) => sqlState(err) === SQLSTATE.insufficientPrivilege)
    await assert.rejects(c.query('update campaign set created_by = created_by'), (err: unknown) => sqlState(err) === SQLSTATE.insufficientPrivilege)
  })
})

test('0011: the seeded mail templates go, a saved one stays in German with its placeholders renamed in every form; a reset removes a row, nothing truncates the table', DB, async (t) => {
  const db = await createTestDatabase(t, { until: '0010_retention.sql' })
  await withClient(db.ownerUrl, async (c) => {
    assert.equal((await c.query('select 1 from mail_template where updated_by is null')).rowCount, 11, 'the seed: every kind, no author')
    const { rows: [user] } = await c.query<{ id: string }>('insert into app_user (tid, oid, display_name) values ($1, $2, $3) returning id', [TID, OID, 'Anna'])
    await c.query('update mail_template set subject = $2, body = $3, updated_at = now(), updated_by = $4 where kind = $1', [
      'class_missing',
      '{{ wahl }}: {{klasse}} ({{{fenster}}})',
      '{{#if vorname}}Hallo {{vorname}}{{else}}Hallo{{/if}},\n{{#if  liste }}{{{ liste }}}{{/if}} {{wahlen}} wahl {{name}} {{link}} {{minimum}}',
      user?.id,
    ])
  })
  assert.deepEqual(await migrateTestDatabase(db, '0011_language_and_mail_defaults.sql'), ['0011_language_and_mail_defaults.sql'])
  await withClient(db.ownerUrl, async (c) => {
    assert.deepEqual((await c.query('select kind, subject, body, locale from mail_template')).rows, [{
      kind: 'class_missing',
      subject: '{{ campaign }}: {{class_name}} ({{{window}}})',
      body: '{{#if first_name}}Hallo {{first_name}}{{else}}Hallo{{/if}},\n{{#if  list }}{{{ list }}}{{/if}} {{wahlen}} wahl {{name}} {{link}} {{minimum}}',
      locale: 'de',
    }], 'a name is renamed only where it stands whole inside the braces')
    await assert.rejects(c.query('truncate mail_template'), (err: unknown) => sqlState(err) === SQLSTATE.objectNotInPrerequisiteState, 'not even the owner truncates')
    await assert.rejects(c.query('update mail_template set updated_by = null'), (err: unknown) => sqlState(err) === '23502', 'a row is a text somebody saved')
  })
  assert.deepEqual(await checkedValues(db.ownerUrl, 'mail_template', 'locale'), [...LOCALES])
  await withClient(db.runtimeUrl, async (c) => {
    await assert.rejects(c.query('truncate mail_template'), (err: unknown) => sqlState(err) === SQLSTATE.insufficientPrivilege)
    assert.equal((await c.query('delete from mail_template where kind = $1', ['class_missing'])).rowCount, 1, 'the reset')
  })
})

test('0013: a reminder queued before it expires with its window, at once when the campaign has left the window; the rest keep their turn by kind; an expired mail stays so', DB, async (t) => {
  const db = await createTestDatabase(t, { until: '0012_one_clock.sql' })
  const closes = '2034-03-13T19:00:00.000Z'
  const late = '2034-03-17T19:00:00.000Z'
  await withClient(db.ownerUrl, async (c) => {
    const { rows: [user] } = await c.query<{ id: string }>('insert into app_user (tid, oid, display_name) values ($1, $2, $3) returning id', [TID, OID, 'Anna'])
    const campaign = async (state: string) => (await c.query<{ id: string }>(
      `insert into campaign (kind, name, school_year, state, project_days, created_by, opens_at, closes_at, late_until)
       values ('project_week', $1, '2033/34', $1, '{2034-07-03}', $2, '2034-03-06T07:00:00Z', $3, $4) returning id`,
      [state, user?.id, closes, late],
    )).rows[0]?.id
    const open = await campaign('open')
    const grace = await campaign('grace')
    const mail = (kind: string, campaignId: string | null | undefined, key: string) => c.query(
      'insert into outbox_mail (kind, campaign_id, to_address, subject, body, dedupe_key) values ($1, $2, $3, $4, $5, $6)',
      [kind, campaignId, 'sara@schule.example.org', 's', 'b', key],
    )
    await mail('choice_reminder', open, 'open-reminder')
    await mail('choice_reminder', grace, 'ended-reminder')
    await mail('grace_reminder', grace, 'grace-reminder')
    await mail('swap_confirmed', open, 'swap')
    await mail('choice_reminder', null, 'test:choice_reminder:1')
    await mail('result_published', open, 'result')
  })
  assert.deepEqual(await migrateTestDatabase(db, '0013_mail_pacing.sql'), ['0013_mail_pacing.sql'])
  await withClient(db.ownerUrl, async (c) => {
    const { rows } = await c.query<{ dedupe_key: string, state: string, priority: number, expires_at: Date | null }>('select dedupe_key, state, priority, expires_at from outbox_mail order by dedupe_key')
    assert.deepEqual(rows.map((r) => [r.dedupe_key, r.state, r.priority, r.expires_at?.toISOString() ?? null]), [
      ['ended-reminder', 'expired', 3, closes],
      ['grace-reminder', 'queued', 3, late],
      ['open-reminder', 'queued', 3, closes],
      ['result', 'queued', 3, null],
      ['swap', 'queued', 1, null],
      ['test:choice_reminder:1', 'queued', 1, null],
    ])
    await assert.rejects(c.query('update outbox_mail set state = $1 where dedupe_key = $2', ['queued', 'ended-reminder']), /stays so/, 'not even the owner sends an expired mail after all')
  })
})

test('a database a newer release migrated without raising the schema version is accepted by an older migrator; a gap in known history is not', DB, async (t) => {
  const db = await createTestDatabase(t)
  const lines: string[] = []
  await withClient(db.ownerUrl, (c) => c.query(
    'insert into schema_migrations (filename, sha256) values ($1, $2)', ['9999_from_the_future.sql', 'f'.repeat(64)],
  ))
  assert.deepEqual(await migrate({ databaseUrl: db.ownerUrl, runtimePassword: TEST_RUNTIME_PASSWORD, log: (line) => lines.push(line) }), [])
  assert.ok(lines.some((line) => line.includes('9999_from_the_future.sql') && line.includes('newer release')), lines.join('\n'))

  await withClient(db.ownerUrl, (c) => c.query(
    'insert into schema_migrations (filename, sha256) values ($1, $2)', ['0000_before_the_baseline.sql', 'e'.repeat(64)],
  ))
  await assert.rejects(migrate({ databaseUrl: db.ownerUrl, runtimePassword: TEST_RUNTIME_PASSWORD }), /0000_before_the_baseline\.sql is missing/)
})

/** A migrations directory: this release's files and `extra`, as a later release would have them. */
async function migrationsWith(t: TestContext, extra: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'school-allocation-migrations-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await cp(MIGRATIONS_DIR, dir, { recursive: true })
  for (const [name, sql] of Object.entries(extra)) await writeFile(path.join(dir, name), sql)
  return dir
}

test('a migration that raises the schema version stops every release built for less; one that keeps it does not', DB, async (t) => {
  const db = await createTestDatabase(t)
  const run = (migrationsDir?: string) => migrate({ databaseUrl: db.ownerUrl, runtimePassword: TEST_RUNTIME_PASSWORD, ...(migrationsDir === undefined ? {} : { migrationsDir }) })
  const versionOf = (filename: string) => withClient(db.ownerUrl, async (c) => (await c.query<{ schema_version: number | null }>(
    'select schema_version from schema_migrations where filename = $1', [filename],
  )).rows[0]?.schema_version)
  const own = await ownSchema()
  // An index keeps the version; a change older code cannot run on raises it, and a vulnerability fix may be the line alone.
  const index = { '9001_index.sql': 'create index on app_user (display_name);\n' }
  const raise = { ...index, '9002_breaks.sql': `-- schema-version: ${own.version + 1}\n`, '9003_note.sql': `select 1;\n-- schema-version: ${own.version + 2} is a comment here, not on the first line\n` }
  assert.deepEqual(await run(await migrationsWith(t, index)), ['9001_index.sql'])
  assert.equal(await versionOf('9001_index.sql'), null)
  assert.deepEqual(await run(), [], 'the release before it runs on a schema that kept its version')
  const newer = await migrationsWith(t, raise)
  assert.deepEqual(await run(newer), ['9002_breaks.sql', '9003_note.sql'])
  assert.equal(await versionOf('9002_breaks.sql'), own.version + 1)
  assert.equal(await versionOf('9003_note.sql'), null)

  // The release before it stops, its migrator before it touches anything and its server at start.
  await assert.rejects(run(), (err: unknown) => err instanceof MigrationError && err.message.includes(`schema version ${own.version + 1}`) && err.message.includes('9002_breaks.sql'))
  await withClient(db.runtimeUrl, async (c) => {
    assert.deepEqual(await checkSchema(c, own), [`the database is at schema version ${own.version + 1}, set by a newer release; this release is built for ${own.version} and does not run on it`])
  })
  assert.deepEqual(await run(newer), [], 'the release that raised it still starts')
  assert.deepEqual(await run(await migrationsWith(t, { ...raise, '9004_later.sql': 'select 1;\n' })), ['9004_later.sql'], 'and so does the one after it')
})

test('a schema version goes above every earlier one, and a first line that only looks like one stops the run', DB, async (t) => {
  const db = await createTestDatabase(t)
  const run = (migrationsDir: string) => migrate({ databaseUrl: db.ownerUrl, runtimePassword: TEST_RUNTIME_PASSWORD, migrationsDir })
  const { version } = await ownSchema()
  const twice = await migrationsWith(t, { '9001_a.sql': `-- schema-version: ${version + 1}\n`, '9002_b.sql': `-- schema-version: ${version + 1}\n` })
  await assert.rejects(run(twice), (err: unknown) => err instanceof MigrationError && err.message.includes('9002_b.sql') && err.message.includes(`not above ${version + 1}`))
  for (const line of ['-- schema-version: two', '-- schema-version: 0', `-- schema-version: ${version + 1} and more`]) {
    await assert.rejects(run(await migrationsWith(t, { '9001_a.sql': `${line}\n` })), (err: unknown) => err instanceof MigrationError && err.message.includes('9001_a.sql'), line)
  }
})

test('the server starts only on the schema it was built for: every migration of its own ran, and none raised the version beyond it', DB, async (t) => {
  const db = await createTestDatabase(t)
  const own = await ownSchema()
  await withClient(db.runtimeUrl, async (c) => {
    assert.deepEqual(await checkSchema(c, own), [])
    const ahead = await checkSchema(c, { names: [...own.names, '9999_not_run.sql'], version: own.version })
    assert.equal(ahead.length, 1)
    assert.match(ahead[0] ?? '', /1 migration\(s\) of this release have not run on the database, the first 9999_not_run\.sql/)
  })
  // A newer release's migration that keeps the version is no reason.
  await withClient(db.ownerUrl, (c) => c.query('insert into schema_migrations (filename, sha256) values ($1, $2)', ['9999_newer.sql', 'f'.repeat(64)]))
  await withClient(db.runtimeUrl, async (c) => assert.deepEqual(await checkSchema(c, own), []))
  // A database the migrator never ran on.
  const empty = await createTestDatabase(t, { migrated: false })
  await withClient(empty.ownerUrl, async (c) => {
    assert.deepEqual(await checkSchema(c, own), ['the migrations of this release have not run on the database (apps/api/scripts/migrate.ts)'])
  })
})
