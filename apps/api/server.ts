import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.ts'
import { ConfigError, loadConfig, type Config } from './config.ts'
import { checkRuntimeConnection, createDatabase, describeDatabase } from './lib/db.ts'
import { interruptStaleJobs } from './lib/jobs.ts'
import { sqlState } from './lib/pg-errors.ts'

// An operator problem: name it and stop, without a stack trace to read past.
function refuse(reason: string): never {
  console.error(`Refusing to start: ${reason}`)
  process.exit(1)
}

let config: Config
try {
  config = loadConfig(process.env)
} catch (err) {
  if (!(err instanceof ConfigError)) throw err
  refuse(err.message)
}

// The pool needs its error handler before the app (and its logger) exists.
const started: { app?: FastifyInstance } = {}
const db = createDatabase(config.databaseUrl, (err) => started.app?.log.error({ err }, 'database client failed'))

// Fail fast: an unreachable database or a connection as the wrong role stops
// the process, so a restart loop is visible instead of a server answering
// 503s or running with rights the application never gets.
let problems: string[]
try {
  problems = await checkRuntimeConnection(db)
} catch (err) {
  refuse(`cannot query ${describeDatabase(config.databaseUrl)} (${(err as Error).name} ${sqlState(err) ?? ''})`.trim())
}
if (problems.length > 0) {
  refuse(problems.join('; '))
}

const server = await buildApp(config, { db })
started.app = server
server.addHook('onClose', async () => {
  await server.stopBackground()
  await db.close()
})
server.log.info({ database: describeDatabase(config.databaseUrl) }, 'database connection checked')

// This process is the only one that runs jobs: whatever is still unfinished
// was interrupted by the previous process's end (lib/jobs.ts).
const interrupted = await interruptStaleJobs(db)
if (interrupted > 0) server.log.warn({ interrupted }, 'jobs left unfinished by the previous process were marked interrupted')

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.log.info({ signal }, 'shutting down')
    server.close().then(
      () => process.exit(0),
      (err: unknown) => {
        server.log.error({ err }, 'shutdown failed')
        process.exit(1)
      },
    )
  })
}

await server.listen({ host: config.host, port: config.port })
