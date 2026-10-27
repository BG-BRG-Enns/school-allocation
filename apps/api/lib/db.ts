import pg from 'pg'

/** The unprivileged role the server connects as; created by the migrator. */
export const RUNTIME_ROLE = 'school_allocation_app'

export interface Database {
  query: <R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]) => Promise<pg.QueryResult<R>>
  /** Runs fn in a transaction: commit on success, rollback on throw, client always released. */
  tx: <T>(fn: (client: pg.PoolClient) => Promise<T>) => Promise<T>
  close: () => Promise<void>
}

/** What a query runs on: the pool, or the client of the transaction it is part of. */
export type Queryable = Pick<Database, 'query'>

export function createDatabase(connectionString: string, onClientError: (err: Error) => void): Database {
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

  return {
    query: (text, values) => pool.query(text, values),
    async tx(fn) {
      const client = await pool.connect()
      let broken = false
      const onError = (err: Error) => {
        broken = true
        onClientError(err)
      }
      client.on('error', onError)
      try {
        await client.query('begin')
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
    },
    close: () => pool.end(),
  }
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
