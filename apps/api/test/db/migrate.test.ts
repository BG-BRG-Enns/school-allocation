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

test('a database a newer release migrated is accepted by an older migrator (the rollback); a gap in known history is not', DB, async (t) => {
  const db = await createTestDatabase(t)
  const lines: string[] = []
  await withClient(db.ownerUrl, (c) => c.query(
    'insert into schema_migrations (filename, sha256) values ($1, $2)', ['0002_from_the_future.sql', 'f'.repeat(64)],
  ))
  assert.deepEqual(await migrate({ databaseUrl: db.ownerUrl, runtimePassword: TEST_RUNTIME_PASSWORD, log: (line) => lines.push(line) }), [])
  assert.ok(lines.some((line) => line.includes('0002_from_the_future.sql') && line.includes('newer release')), lines.join('\n'))

  await withClient(db.ownerUrl, (c) => c.query(
    'insert into schema_migrations (filename, sha256) values ($1, $2)', ['0000_before_the_baseline.sql', 'e'.repeat(64)],
  ))
  await assert.rejects(migrate({ databaseUrl: db.ownerUrl, runtimePassword: TEST_RUNTIME_PASSWORD }), /0000_before_the_baseline\.sql is missing/)
})
