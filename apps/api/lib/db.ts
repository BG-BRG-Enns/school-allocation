import pg from 'pg'
import { systemClock, type Clock } from './clock.ts'
import { SQLSTATE, sqlState } from './pg-errors.ts'

/** The unprivileged role the server connects as; created by the migrator. */
export const RUNTIME_ROLE = 'school_allocation_app'

export interface Database {
  query: <R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]) => Promise<pg.QueryResult<R>>
  /** Runs fn in a transaction: commit on success, rollback on throw, client always released. */
  tx: <T>(fn: (client: pg.PoolClient) => Promise<T>) => Promise<T>
  /** The time on the clock the database was created with (lib/clock.ts); under a test's clock, `app_now()` reads the same in SQL. */
  now: () => Date
  close: () => Promise<void>
}

/** What a query runs on: the pool, or the client of the transaction it is part of. */
export type Queryable = Pick<Database, 'query'>

/**
 * The pool the server works with. Without `clock`, as the server runs, the
 * system's clock answers `db.now()` and the database's own `now()` answers
 * `app_now()` (0001_baseline.sql). A test passes a clock of its own: then every
 * transaction starts by setting `app.now` to its time, which `app_now()`
 * reads, and a statement outside a transaction runs in one of its own, so
 * the database follows the clock too.
 */
export function createDatabase(connectionString: string, onClientError: (err: Error) => void, clock?: Clock): Database {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    // Fail a boot, a health check or a request in bounded time instead of
    // hanging on an unreachable or stuck server.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 15_000,
    application_name: 'school-allocation',
    // Unqualified table names resolve in public only, whatever search_path
    // a per-role or per-database setting would give the session.
    options: '-c search_path=public',
  })
  // Without a listener, a client that loses its connection crashes the
  // process with an unhandled 'error' event. The pool listens for idle
  // clients; tx() listens for the one it has checked out.
  pool.on('error', onClientError)

  async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect()
    let broken = false
    const onError = (err: Error) => {
      broken = true
      onClientError(err)
    }
    client.on('error', onError)
    try {
      await client.query('begin')
      if (clock !== undefined) await client.query(setNow(clock.now()))
      const result = await fn(client)
      await client.query('commit')
      return result
    } catch (err) {
      try {
        await client.query('rollback')
      } catch {
        // A connection that cannot even roll back is not reused.
        broken = true
      }
      throw err
    } finally {
      client.off('error', onError)
      client.release(broken)
    }
  }

  return {
    query: clock === undefined
      ? (text, values) => pool.query(text, values)
      : <R extends pg.QueryResultRow>(text: string, values?: unknown[]) => tx((client) => client.query<R>(text, values)),
    tx,
    now: () => (clock ?? systemClock).now(),
    close: () => pool.end(),
  }
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/**
 * What sets `app_now()` for the rest of a transaction. SET, unlike a
 * select, takes no snapshot, so readSnapshot can still choose its isolation
 * after it. SET takes no parameter: the value is the clock's instant as
 * toISOString writes it, checked to be exactly that.
 */
function setNow(at: Date): string {
  const instant = at.toISOString()
  if (!ISO_INSTANT.test(instant)) throw new Error(`not a clock time: ${instant}`)
  return `set local app.now = '${instant}'`
}

/**
 * Runs reads that must see one state, such as a campaign read over several
 * queries, in a read-only, repeatable-read transaction.
 */
export function readSnapshot<T>(db: Database, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return db.tx(async (client) => {
    await client.query('set transaction isolation level repeatable read, read only')
    return fn(client)
  })
}

/**
 * What is wrong with the runtime connection, checked at startup: the server
 * must connect as the runtime role, whose rights the migrator resets on
 * every run (scripts/migrate.ts). Any other role, the owner or a superuser,
 * could hold rights the application never gets. Throws when the database
 * cannot be queried.
 */
export async function checkRuntimeConnection(db: Queryable): Promise<string[]> {
  const { rows: [role] } = await db.query<{ name: string }>('select current_user::text as name')
  if (role?.name !== RUNTIME_ROLE) return [`the server connects as ${role?.name ?? 'an unknown role'}; it must connect as ${RUNTIME_ROLE}`]
  return []
}

/**
 * Why the server must not start on this database: a migration of its own
 * that has not run, or a schema version a newer release raised the schema
 * to (scripts/migrate.ts, SCHEMA_VERSION). `own` is the release's
 * migrations and the version they are built for; an empty list means the
 * database has the schema this release was built for. A newer release's
 * migrations that keep the version are no reason: they are written so
 * that older code runs on them.
 */
export async function checkSchema(db: Queryable, own: { names: readonly string[], version: number }): Promise<string[]> {
  let rows: { filename: string, schema_version: number | null }[]
  try {
    rows = (await db.query<{ filename: string, schema_version: number | null }>('select filename, schema_version from schema_migrations')).rows
  } catch (err) {
    // No bookkeeping yet, or one the migrator of this release has not
    // brought up to date and granted: its migrations have not run.
    if ([SQLSTATE.undefinedTable, SQLSTATE.undefinedColumn, SQLSTATE.insufficientPrivilege].some((code) => code === sqlState(err))) {
      return ['the migrations of this release have not run on the database (apps/api/scripts/migrate.ts)']
    }
    throw err
  }
  const applied = new Set(rows.map((row) => row.filename))
  const missing = own.names.filter((name) => !applied.has(name))
  const version = Math.max(0, ...rows.map((row) => row.schema_version ?? 0))
  return [
    ...(missing.length > 0 ? [`${missing.length} migration(s) of this release have not run on the database, the first ${missing[0]} (apps/api/scripts/migrate.ts)`] : []),
    ...(version > own.version ? [`the database is at schema version ${version}, set by a newer release; this release is built for ${own.version} and does not run on it`] : []),
  ]
}

/** user@host:port/database, for log lines: never the password. */
export function describeDatabase(connectionString: string): string {
  const url = new URL(connectionString)
  let user = url.username
  try {
    user = decodeURIComponent(user)
  } catch {
    // Keep the encoded form; this only describes the database in a message.
  }
  return `${user}@${url.host}${url.pathname}`
}
