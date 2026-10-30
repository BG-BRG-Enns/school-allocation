#!/usr/bin/env node
// Applies the SQL migrations in ../migrations, in filename order, one
// transaction per file. Run as a PostgreSQL superuser, because it creates
// and adjusts the runtime role, as a one-shot step before the server
// starts; a run with nothing to do is a no-op, so a redeploy can always run
// it.
//
// Deterministic: each applied file is recorded with its SHA-256, and an
// applied file that was edited or removed stops the run, so two databases
// with the same records have the same schema.

import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { ConfigError, loadMigrationConfig } from '../config.ts'
import { RUNTIME_ROLE } from '../lib/db.ts'
import { SQLSTATE, sqlState } from '../lib/pg-errors.ts'
import { grantStatements, RUNTIME_FUNCTIONS, RUNTIME_TABLES } from '../lib/runtime-privileges.ts'

export { RUNTIME_ROLE }
export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

// One fixed key: pg_advisory_lock serialises concurrent runs on a database.
const LOCK_KEY = 0x5c0e1ec7
const FILE_NAME = /^\d{4}_[a-z0-9_]+\.sql$/

// The schema version: a migration that code built before it cannot run on
// (a column dropped or renamed, a constraint the old code would break, a
// meaning changed) starts with `-- schema-version: N`, one more than the
// newest before it; an additive one (a table, a column with a default, an
// index) carries none (AGENTS.md). A release is built for the highest
// version among its own migrations (schemaVersionOf), and neither its
// migrator nor its server (lib/db.ts checkSchema) runs on a database at a
// higher one. A release that fixes a vulnerability raises it too, with a
// migration that may hold the line alone, so no earlier release starts on
// a database it migrated, even when a registry serves an earlier signed one.
const SCHEMA_VERSION = /^-- schema-version:/
const SCHEMA_VERSION_LINE = /^-- schema-version: ([1-9]\d{0,8})\s*$/

export interface MigrateOptions {
  /** Owner connection string, password included. */
  databaseUrl: string
  runtimePassword: string
  migrationsDir?: string
  /** Apply files up to and including this one; tests use it to stop between migrations. */
  until?: string
  log?: (line: string) => void
}

export class MigrationError extends Error {
  override name = 'MigrationError'
}

/**
 * The one order migrations run in: by UTF-16 code unit, independent of
 * locale. Sorting and the forward-only check must use the same order.
 */
export function byName(a: string, b: string): number {
  if (a < b) return -1
  return a > b ? 1 : 0
}

export async function migrate(options: MigrateOptions): Promise<string[]> {
  const { databaseUrl, runtimePassword, migrationsDir = MIGRATIONS_DIR, until, log = () => {} } = options
  const files = await migrationFiles(migrationsDir, until)
  const client = new pg.Client({ connectionString: databaseUrl, application_name: 'school-allocation-migrate' })
  await client.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY])
    // Unqualified names, in the bookkeeping and in the migrations, resolve in
    // public only, whatever search_path the superuser would otherwise have.
    await client.query('select set_config(\'search_path\', \'public\', false)')
    await assertMigrationRole(client)
    await client.query(`create table if not exists schema_migrations (
      filename text primary key,
      sha256 text not null,
      applied_at timestamptz not null default now()
    )`)
    // Added after the table's first release; a migrator before it inserts
    // without the column, which records no version.
    await client.query('alter table schema_migrations add column if not exists schema_version integer')
    const rows = (await client.query<{ filename: string, sha256: string, schema_version: number | null }>(
      'select filename, sha256, schema_version from schema_migrations',
    )).rows
    const applied = new Map(rows.map((row) => [row.filename, row.sha256]))

    // The history is validated before the runtime role is touched.
    const pending = pendingMigrations(files, applied, migrationsDir, until)
    const ahead = aheadOf(files, applied)
    const builtFor = schemaVersionOf(files)
    const raised = rows.filter((row) => row.schema_version !== null && row.schema_version > builtFor)
    if (raised.length > 0) {
      throw new MigrationError(`the database is at schema version ${Math.max(...raised.map((row) => row.schema_version ?? 0))}, set by a newer release (${raised.map((row) => row.filename).sort(byName).join(', ')}); this release is built for ${builtFor} and does not run on it`)
    }
    if (ahead.length > 0) {
      // A newer release's migrations that keep the schema version: said
      // out loud, since the privileges reset below grants nothing on what
      // they created, until the newer release runs again.
      log(`the database is ahead of this release: ${ahead.join(', ')} applied by a newer release, at the schema version this release is built for; starting on them`)
    }
    const existed = await ensureRuntimeRole(client, runtimePassword)
    for (const file of pending) {
      log(`applying ${file.name}`)
      await applyMigration(client, file) // NOSONAR: migrations run one after another, each in its own transaction
    }
    // After the migrations, so the objects they created get their grants in
    // the same run.
    await resetRuntimePrivileges(client, { complete: until === undefined })
    // The password of an existing role changes only now: a run that fails
    // above leaves the old password, and with it the running server, working.
    if (existed) await setRuntimePassword(client, runtimePassword)
    log(pending.length === 0 ? 'nothing to apply' : `applied ${pending.length} migration(s)`)
    return pending.map((file) => file.name)
  } finally {
    await client.end()
  }
}

interface MigrationFile {
  name: string
  sql: string
  sha256: string
  /** The schema version its first line raises the schema to (SCHEMA_VERSION), or null. */
  schemaVersion: number | null
}

/** The schema version a set of migrations is built for: the highest one they raise it to, 0 if none does. */
export function schemaVersionOf(files: readonly Pick<MigrationFile, 'schemaVersion'>[]): number {
  return Math.max(0, ...files.map((file) => file.schemaVersion ?? 0))
}

/** This release's migrations as the server checks the database against them: their names and the schema version they are built for. */
export async function ownSchema(dir: string = MIGRATIONS_DIR): Promise<{ names: string[], version: number }> {
  const files = await migrationFiles(dir, undefined)
  return { names: files.map((file) => file.name), version: schemaVersionOf(files) }
}

async function assertMigrationRole(client: pg.Client): Promise<void> {
  const { rows } = await client.query<{ current_user: string, superuser: boolean }>(
    'select current_user, (select rolsuper from pg_roles where rolname = current_user) as superuser',
  )
  if (rows[0]?.current_user === RUNTIME_ROLE) {
    throw new MigrationError(`migrations must not run as the runtime role ${RUNTIME_ROLE}`)
  }
  // Checked up front rather than failing halfway at CREATE ROLE: owning the
  // database is not enough to create and adjust the runtime role.
  if (rows[0]?.superuser !== true) {
    throw new MigrationError('migrations must run as a PostgreSQL superuser: they create and adjust the runtime role')
  }
}

/**
 * The files still to apply, after checking that the history is intact: no
 * applied file edited or missing, and no new file that sorts before the
 * newest applied one, or two databases with the same records could have run
 * the same files in different orders.
 *
 * One kind of unknown applied file is accepted: those that sort after every
 * file this release has (aheadOf), the database a newer release migrated,
 * as long as none of them raised the schema version beyond this release's
 * (migrate refuses that). An unknown file that sorts before a known one is
 * a gap in the history, and stops the run.
 */
export function pendingMigrations(
  files: readonly MigrationFile[],
  applied: ReadonlyMap<string, string>,
  migrationsDir: string,
  until?: string,
): MigrationFile[] {
  const known = new Set(files.map((file) => file.name))
  const ahead = new Set(aheadOf(files, applied))
  const missing = [...applied.keys()].find((name) => !known.has(name) && !ahead.has(name) && (until === undefined || name <= until))
  if (missing) throw new MigrationError(`applied migration ${missing} is missing from ${migrationsDir}`)

  const edited = files.find((file) => applied.has(file.name) && applied.get(file.name) !== file.sha256)
  if (edited) throw new MigrationError(`applied migration ${edited.name} was edited; write a new migration instead`)

  const pending = files.filter((file) => !applied.has(file.name))
  const newest = [...applied.keys()].sort(byName).at(-1)
  const late = newest === undefined ? undefined : pending.find((file) => file.name < newest)
  if (late) {
    throw new MigrationError(`${late.name} sorts before the applied ${newest}; renumber it after the newest applied migration`)
  }
  return pending
}

/** The applied migrations this release does not have and that sort after every one it has: a newer release's, in order. */
export function aheadOf(files: readonly MigrationFile[], applied: ReadonlyMap<string, string>): string[] {
  const newestKnown = files.map((file) => file.name).sort(byName).at(-1)
  const known = new Set(files.map((file) => file.name))
  return [...applied.keys()].filter((name) => !known.has(name) && newestKnown !== undefined && name > newestKnown).sort(byName)
}

async function applyMigration(client: pg.Client, file: MigrationFile): Promise<void> {
  await client.query('begin')
  try {
    await client.query(file.sql)
    await client.query('insert into schema_migrations (filename, sha256, schema_version) values ($1, $2, $3)', [file.name, file.sha256, file.schemaVersion])
    await client.query('commit')
  } catch (err) {
    await client.query('rollback').catch(() => {})
    // The code and the file, not the database's message: messages can quote
    // values from the rows a migration touches.
    throw new MigrationError(`${file.name} failed with SQLSTATE ${sqlState(err) ?? 'unknown'}; nothing of it was applied`, { cause: err })
  }
}

async function migrationFiles(dir: string, until: string | undefined): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort(byName)
  const bad = names.filter((name) => !FILE_NAME.test(name))
  if (bad.length > 0) throw new MigrationError(`migration files must be named NNNN_name.sql: ${bad.join(', ')}`)
  // One file per number: fixtures and reviews refer to migrations by it.
  const duplicate = names.find((name, i) => i > 0 && name.slice(0, 4) === names[i - 1]?.slice(0, 4))
  if (duplicate) throw new MigrationError(`migration number ${duplicate.slice(0, 4)} is used more than once`)
  const selected = until === undefined ? names : names.filter((name) => name <= until)
  const files = await Promise.all(selected.map(async (name) => {
    const sql = await readFile(path.join(dir, name), 'utf8')
    return { name, sql, sha256: createHash('sha256').update(sql).digest('hex'), schemaVersion: schemaVersionLine(name, sql.split('\n', 1)[0] ?? '') }
  }))
  // Each raise goes above the one before it, so the versions follow the files' order.
  let newest = 0
  for (const file of files) {
    if (file.schemaVersion === null) continue
    if (file.schemaVersion <= newest) throw new MigrationError(`${file.name} sets schema version ${file.schemaVersion}, not above ${newest} of an earlier migration`)
    newest = file.schemaVersion
  }
  return files
}

/** The version a migration's first line raises the schema to; a line that starts like the marker but is not one stops the run rather than being read as a comment. */
function schemaVersionLine(name: string, line: string): number | null {
  if (!SCHEMA_VERSION.test(line)) return null
  const match = SCHEMA_VERSION_LINE.exec(line)
  if (!match?.[1]) throw new MigrationError(`${name} starts with a schema version that is not "-- schema-version: N" with N a positive whole number`)
  return Number(match[1])
}

// The runtime role logs in with its own password and holds nothing but what
// lib/runtime-privileges.ts grants it; its attributes are set on every run.
const UNPRIVILEGED = 'login nosuperuser nocreatedb nocreaterole noreplication nobypassrls inherit'

/** Creates the runtime role, or resets the attributes of the existing one; true if it existed. */
async function ensureRuntimeRole(client: pg.Client, password: string): Promise<boolean> {
  let existed = (await client.query('select 1 from pg_roles where rolname = $1', [RUNTIME_ROLE])).rowCount === 1
  if (!existed) {
    try {
      await client.query(await formatted(client, `create role %I with ${UNPRIVILEGED} password %L`, scramVerifier(password)))
    } catch (err) {
      if (sqlState(err) !== SQLSTATE.duplicateObject) throw err
      existed = true
    }
  }
  if (existed) await client.query(await formatted(client, `alter role %I with ${UNPRIVILEGED}`))
  return existed
}

async function setRuntimePassword(client: pg.Client, password: string): Promise<void> {
  await client.query(await formatted(client, 'alter role %I with password %L', scramVerifier(password)))
}

/**
 * The SCRAM-SHA-256 verifier PostgreSQL stores for a password, computed
 * here so the password itself never travels as SQL text: statement logs and
 * pg_stat_statements would otherwise keep it in plaintext. A verifier
 * cannot be used to log in. The password is printable ASCII (checked in
 * config.ts), for which SASLprep changes nothing.
 */
export function scramVerifier(password: string, salt: Buffer = randomBytes(16), iterations = 4096): string {
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  const clientKey = createHmac('sha256', salted).update('Client Key').digest()
  const storedKey = createHash('sha256').update(clientKey).digest()
  const serverKey = createHmac('sha256', salted).update('Server Key').digest()
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
}

// Utility statements take no bind parameters; format() quotes server-side.
async function formatted(client: pg.Client, template: string, password?: string): Promise<string> {
  const { rows } = await client.query<{ sql: string }>('select format($1, $2::text, $3::text) as sql', [template, RUNTIME_ROLE, password ?? null])
  return rows[0]?.sql ?? ''
}

// Privileges are per database, so they are reset here on every run. Every
// database, schema, table, sequence and function privilege of PUBLIC and the
// runtime role is revoked, and the role gets back CONNECT, USAGE on the
// schema and exactly what lib/runtime-privileges.ts lists; no migration
// grants anything itself. That covers PostgreSQL's
// defaults (PUBLIC may connect to a new database, create temporary tables
// and execute every new function), a database restored from a dump, and
// grants a newer version no longer lists.
async function resetRuntimePrivileges(client: pg.Client, { complete }: { complete: boolean }): Promise<void> {
  const tables = new Set((await client.query<{ name: string }>(
    `select relname::text as name from pg_class
      where relnamespace = 'public'::regnamespace and relkind in ('r', 'p', 'v', 'm', 'f')`,
  )).rows.map((row) => row.name))
  const functions = new Set((await client.query<{ signature: string }>(
    'select oid::regprocedure::text as signature from pg_proc where pronamespace = \'public\'::regnamespace',
  )).rows.map((row) => row.signature))
  // A run that stops early (until) has not created everything yet; a full
  // run that lacks a listed object means the list names something no
  // migration creates.
  const missing = [
    ...Object.keys(RUNTIME_TABLES).filter((table) => !tables.has(table)),
    ...RUNTIME_FUNCTIONS.filter((signature) => !functions.has(signature)),
  ]
  if (complete && missing.length > 0) {
    throw new MigrationError(`lib/runtime-privileges.ts grants on ${missing.join(', ')}, which no migration creates`)
  }
  // One transaction: a running server never sees the moment between revoke
  // and grant. PUBLIC is reset too, so a database restored from a dump (which
  // starts with the default privileges) is repaired by the next run.
  await client.query('begin')
  try {
    await client.query(`do $$ begin
      execute format('revoke all on database %I from public, ${RUNTIME_ROLE}', current_database());
      execute format('grant connect on database %I to ${RUNTIME_ROLE}', current_database());
    end $$`)
    await client.query(`revoke all on schema public from public, ${RUNTIME_ROLE}`)
    await client.query(`grant usage on schema public to ${RUNTIME_ROLE}`)
    // Revoking a table privilege revokes it on every column as well. Each
    // list goes as one multi-statement query, inside this transaction.
    await client.query(['tables', 'sequences', 'routines']
      .map((kind) => `revoke all on all ${kind} in schema public from public, ${RUNTIME_ROLE}`).join(';\n'))
    const grants = grantStatements(RUNTIME_ROLE, { tables, functions })
    if (grants.length > 0) await client.query(grants.join(';\n'))
    await client.query('commit')
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = loadMigrationConfig(process.env)
    await migrate({ ...config, log: (line) => console.log(line) })
  } catch (err) {
    if (err instanceof ConfigError || err instanceof MigrationError) {
      console.error(`Migration refused: ${err.message}`)
    } else {
      // A database error: report its code, not its message, which can quote
      // values from the statement.
      console.error(`Migration failed: ${(err as Error).name} ${sqlState(err) ?? ''}`.trim())
    }
    process.exit(1)
  }
}
