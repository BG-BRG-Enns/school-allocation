// The migrator against a real server: idempotent, and the runtime role ends
// up with exactly the listed rights. What the triggers keep, whoever writes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrate } from '../../scripts/migrate.ts'
import { RUNTIME_TABLES } from '../../lib/runtime-privileges.ts'
import { SQLSTATE, sqlState } from '../../lib/pg-errors.ts'
import { createTestDatabase, DB, TEST_RUNTIME_PASSWORD, withClient } from '../helpers/db.ts'

const TID = '3f2b8c1d-6e4a-4b7f-9c2d-8a1e5f6b7c90'
const OID = 'a0000000-0000-4000-8000-00000000000a'

test('a second run applies nothing, and every table in public is either granted or deliberately not', DB, async (t) => {
  const db = await createTestDatabase(t)
  assert.deepEqual(await migrate({ databaseUrl: db.ownerUrl, runtimePassword: TEST_RUNTIME_PASSWORD }), [])
  const tables = await withClient(db.ownerUrl, async (c) => (await c.query<{ name: string }>(
    'select relname::text as name from pg_class where relnamespace = \'public\'::regnamespace and relkind in (\'r\', \'p\', \'v\', \'m\')',
  )).rows.map((r) => r.name).sort())
  // schema_migrations is the migrator's own and gets no grant.
  assert.deepEqual(tables, [...Object.keys(RUNTIME_TABLES), 'schema_migrations'].sort())
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
    await refused('select 1 from schema_migrations')
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

test('a database a newer release migrated is accepted by an older migrator (the rollback); a gap in known history is not', DB, async (t) => {
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
