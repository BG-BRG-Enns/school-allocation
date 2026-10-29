// Real PostgreSQL for tests: one throwaway database per caller, created on
// the server named by TEST_DATABASE_URL (a superuser connection) and
// dropped afterwards. In CI the database tests must run: without
// TEST_DATABASE_URL they fail instead of being skipped quietly.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { migrate, RUNTIME_ROLE } from '../../scripts/migrate.ts'

/** Contains the characters a connection URL must encode. */
export const TEST_RUNTIME_PASSWORD = 'runtime p@ss:w/rd%'

export interface TestDatabase {
  name: string
  ownerUrl: string
  runtimeUrl: string
  drop: () => Promise<void>
}

/**
 * Options for a test that needs PostgreSQL: test(name, DB, fn). Without
 * TEST_DATABASE_URL such tests are skipped locally; in CI loading the file
 * throws, so the run fails instead of passing without them.
 */
export const DB = { skip: databaseSkipReason() }

function databaseSkipReason(): string | false {
  if (process.env.TEST_DATABASE_URL) {
    refuseDevelopmentServer(process.env.TEST_DATABASE_URL)
    return false
  }
  if (process.env.CI === 'true') throw new Error('TEST_DATABASE_URL must be set in CI; database tests must not be skipped')
  return 'TEST_DATABASE_URL is not set'
}

/**
 * The tests migrate every throwaway database with their own runtime
 * password, and a role's password is the server's, not a database's: run
 * on the development server, they lock the development API out of its
 * database (28P01 at the next start). Refuse the server apps/api/.env
 * names; `npm run db:test` starts a second one.
 */
function refuseDevelopmentServer(testUrl: string): void {
  let env: string
  try {
    env = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), 'utf8')
  } catch {
    return
  }
  const line = env.split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l))
  if (!line) return
  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  const server = (url: string) => {
    const u = new URL(url)
    return `${u.hostname}:${u.port || '5432'}`
  }
  try {
    if (server(testUrl) === server(value)) {
      throw new Error(`TEST_DATABASE_URL names the development server (${server(testUrl)}, DATABASE_URL in apps/api/.env); the tests would reset the runtime role's password there. Start a second server with npm run db:test and point TEST_DATABASE_URL at it.`)
    }
  } catch (err) {
    if (err instanceof TypeError) return // not a URL: the connection fails on its own terms
    throw err
  }
}

let counter = 0

/** An empty database; `migrated` also applies every migration. */
export async function createTestDatabase(t: TestContext, { migrated = true } = {}): Promise<TestDatabase> {
  const admin = new URL(process.env.TEST_DATABASE_URL ?? '')
  const name = `sa_test_${process.pid}_${counter++}`
  await withClient(admin.toString(), (client) => client.query(`create database ${name}`))

  const owner = new URL(admin)
  owner.pathname = `/${name}`
  const runtime = new URL(owner)
  runtime.username = RUNTIME_ROLE
  runtime.password = encodeURIComponent(TEST_RUNTIME_PASSWORD)

  const db: TestDatabase = {
    name,
    ownerUrl: owner.toString(),
    runtimeUrl: runtime.toString(),
    drop: () => withClient(admin.toString(), (client) => client.query(`drop database if exists ${name} with (force)`)).then(() => {}),
  }
  t.after(db.drop)
  // The migrator serialises runs on one database with an advisory lock, which is a database's; the runtime role it
  // alters is the server's. Test files run in parallel processes, each migrating its own fresh database, and two
  // `alter role` at once fail with "tuple concurrently updated": one lock on the server, held while migrating.
  if (migrated) {
    await withClient(admin.toString(), async (client) => {
      await client.query('select pg_advisory_lock($1)', [MIGRATE_LOCK])
      try {
        await migrate({ databaseUrl: db.ownerUrl, runtimePassword: TEST_RUNTIME_PASSWORD })
      } finally {
        await client.query('select pg_advisory_unlock($1)', [MIGRATE_LOCK])
      }
    })
  }
  return db
}

/** One key for every test process on the server; nothing else locks it. */
const MIGRATE_LOCK = 7331

export async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** The quoted values of the CHECK constraint that lists a column's values, in their order. */
export async function checkedValues(url: string, table: string, column: string): Promise<string[]> {
  return withClient(url, async (client) => {
    const { rows } = await client.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = $1::regclass and contype = 'c' and pg_get_constraintdef(oid) like $2`,
      [table, `%(${column} = ANY%`],
    )
    if (rows.length !== 1) throw new Error(`expected one CHECK listing the values of ${table}.${column}, found ${rows.length}`)
    return [...(rows[0]?.def ?? '').matchAll(/'([a-z0-9-]+)'::text/g)].map((match) => match[1] ?? '')
  })
}
