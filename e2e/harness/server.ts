// Everything the browser journeys need, started as one process: a fresh
// database on the PostgreSQL server TEST_DATABASE_URL names (as the API
// tests use it), the migrations, the school's language set to E2E_LOCALE
// (German unless set), the stand-in for Entra ID with its
// sign-in page, and the real server with the built web app, listening on
// a loopback origin. Playwright starts it (playwright.config.ts) and
// stops it; stopping drops the database.
//
// The journeys' time is a clock of their own (apps/api/test/helpers/clock.ts),
// the server's, its database's and the stand-in's, starting on Monday
// 7 November 2033, when teachers propose their activities. The control
// port (E2E_CONTROL_PORT, one above the app's) sets and moves it and runs
// the scheduler's tick, which runs at no other time (e2e/support/clock.ts).
//
// Nothing here is a production knob: the stand-in and the clock are passed
// to the app as the API tests pass them, and no environment variable of
// the server could point a deployed server at another authority or time.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../../apps/api/app.ts'
import { loadConfig } from '../../apps/api/config.ts'
import { createDatabase } from '../../apps/api/lib/db.ts'
import { tick } from '../../apps/api/services/scheduling.ts'
import { ControlledClock } from '../../apps/api/test/helpers/clock.ts'
import { createTestDatabase, withClient } from '../../apps/api/test/helpers/db.ts'
import { SERVER_ENV } from '../../apps/api/test/helpers/env.ts'
import { startFakeEntra } from '../../apps/api/test/helpers/fake-entra.ts'
import { startFakeGraph } from '../../apps/api/test/helpers/fake-graph.ts'
import { startFakeSolver } from '../../apps/api/test/helpers/fake-solver.ts'
import { ANNA } from '../../apps/api/test/helpers/personas.ts'
import { BASE_PATH } from '../support/base.ts'
import { CONTROL_PORT, STORY_STARTS } from '../support/clock.ts'
import { LOCALE } from '../support/messages.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PORT = Number(process.env.E2E_PORT ?? 3100)
const ORIGIN = `http://127.0.0.1:${PORT}`

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL must name a PostgreSQL superuser connection, as for the API tests (scripts/postgres.sh starts a fitting server)')
  process.exit(1)
}

// createTestDatabase registers the drop with a test context; this one
// collects everything to undo, in the order it was done, so that a start
// that fails halfway (a busy port, say) undoes what it did and leaves no
// database behind, and a signal undoes all of it.
const cleanups: (() => unknown)[] = []
const context = { after: (fn: () => unknown) => cleanups.push(fn) } as unknown as TestContext

let stopping = false
async function stop(code: number): Promise<never> {
  if (!stopping) {
    stopping = true
    // One after the other, last first: the app closes before the pool, the
    // pool before the database is dropped; a failure is logged and the rest
    // still runs.
    await cleanups.toReversed().reduce<Promise<unknown>>(
      (previous, cleanup) => previous.then(cleanup).catch((err: unknown) => {
        console.error('cleanup failed', err)
        code = 1
      }),
      Promise.resolve(),
    )
  }
  process.exit(code)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void stop(0)
  })
}

try {
  const testDb = await createTestDatabase(context)
  // The school speaks the language the journeys read the catalogue in, from the first page on.
  await withClient(testDb.ownerUrl, (client) => client.query('update school_setting set locale = $1', [LOCALE]))
  const clock = new ControlledClock(STORY_STARTS)
  const entra = await startFakeEntra({ redirectUri: `${ORIGIN}${BASE_PATH}/api/auth/callback`, clock })
  cleanups.push(() => entra.close())
  // The stand-in for Graph, with the groups the journeys label and read,
  // and one more the picker finds and nobody has labelled yet.
  const graph = await startFakeGraph(entra.issued)
  graph.groups.set('33333333-3333-4333-8333-333333333333', [])
  graph.names.set('33333333-3333-4333-8333-333333333333', 'Klasse 6A')
  // Two groups named after their class alone, as a school's tenant has them, for the search of all classes.
  for (const [id, name] of [['44444444-4444-4444-8444-444444444444', '7B'], ['55555555-5555-4555-8555-555555555555', '8C']] as const) {
    graph.groups.set(id, [])
    graph.names.set(id, name)
  }
  cleanups.push(() => graph.close())
  // The stand-in for the solver: a greedy answer in the contract's shape, enough for the journey through a run.
  const solver = await startFakeSolver()
  cleanups.push(() => solver.close())
  const db = createDatabase(testDb.runtimeUrl, (err) => console.error('database client failed', err), clock)
  cleanups.push(() => db.close())
  const config = loadConfig({
    ...SERVER_ENV,
    PUBLIC_URL: `${ORIGIN}${BASE_PATH}`,
    HOST: '127.0.0.1',
    PORT: String(PORT),
    WEB_DIST_DIR: path.join(ROOT, 'apps', 'web', 'dist'),
    SOLVER_URL: solver.baseUrl,
    // Anna administers the school in the journeys.
    BOOTSTRAP_ADMINS: ANNA.email ?? '',
  })
  // No timer of its own: the journeys run the scheduler's tick when the story needs it, on the control port.
  const app = await buildApp(config, { db, entraAuthority: entra.authority, graphBaseUrl: graph.baseUrl, background: false })
  cleanups.push(() => app.close())
  const control = createServer((request, response) => {
    void answer(request, response).catch((err: unknown) => {
      console.error('clock control failed', err)
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    })
  })
  /** GET /clock: where the clock stands; POST /clock {"at"} sets it; POST /tick runs the scheduler once at the clock's time. */
  async function answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (request.method === 'GET' && request.url === '/clock') return reply(200, { at: clock.peek().toISOString() })
    if (request.method === 'POST' && request.url === '/clock') {
      const { at } = JSON.parse(await bodyOf(request)) as { at?: unknown }
      const to = typeof at === 'string' ? new Date(at) : new Date(Number.NaN)
      if (Number.isNaN(to.getTime())) return reply(400, { error: 'at must be an ISO 8601 time' })
      clock.set(to)
      return reply(200, { at: clock.peek().toISOString() })
    }
    if (request.method === 'POST' && request.url === '/tick') {
      return reply(200, await tick(db, { baseUrl: config.publicUrl }, db.now(), { error: ({ err, campaignId }, message) => console.error(message, campaignId, err) }))
    }
    reply(404, { error: 'not_found' })
  }
  await new Promise<void>((resolve, reject) => {
    control.once('error', reject)
    control.listen(CONTROL_PORT, '127.0.0.1', () => resolve())
  })
  cleanups.push(() => new Promise<void>((resolve) => control.close(() => resolve())))
  await app.listen({ host: '127.0.0.1', port: PORT })
  console.log(`e2e server ready at ${ORIGIN}${BASE_PATH} (database ${testDb.name}, language ${LOCALE}, sign-in stand-in at ${entra.authority}, clock at ${clock.peek().toISOString()} on port ${CONTROL_PORT})`)
} catch (err) {
  console.error('e2e server failed to start', err)
  await stop(1)
}

function bodyOf(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}
