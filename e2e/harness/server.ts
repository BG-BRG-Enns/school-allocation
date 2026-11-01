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
// The school around the test people is the scenario's (e2e/scenario): the
// stand-in for Graph holds its tenant from the start, and the control port
// loads the rest of it stage by stage, as the journeys get there
// (e2e/support/scenario.ts).
//
// The solver is a greedy stand-in, enough for the journeys; with
// E2E_SOLVER=real the harness starts the real one (apps/solver, with uv)
// on a free port, for the handbook's pictures.
//
// Nothing here is a production knob: the stand-ins and the clock are passed
// to the app as the API tests pass them, and no environment variable of
// the server could point a deployed server at another authority or time.

import { spawn } from 'node:child_process'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createNetServer, type AddressInfo } from 'node:net'
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
import { TENANT_ID } from '../../apps/api/test/helpers/env.ts'
import { startFakeEntra } from '../../apps/api/test/helpers/fake-entra.ts'
import { CLASS_5A_GROUP, startFakeGraph, TEACHERS_GROUP } from '../../apps/api/test/helpers/fake-graph.ts'
import { startFakeSolver } from '../../apps/api/test/helpers/fake-solver.ts'
import { ANNA, SARA, TIM } from '../../apps/api/test/helpers/personas.ts'
import { scenarioLoader, stockTenant } from '../scenario/load.ts'
import { BASE_PATH } from '../support/base.ts'
import { CONTROL_PORT, STORY_STARTS } from '../support/clock.ts'
import { LOCALE } from '../support/messages.ts'
import { sample } from '../support/sample.ts'
import { SCHOOL, type Stage } from '../support/scenario.ts'

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
  // The stand-in for Graph, with the scenario's tenant: the classes, the
  // leavers nobody labels and the teachers, 5A and the teachers under the
  // group ids the journeys label.
  const graph = await startFakeGraph(entra.issued)
  stockTenant(graph, SCHOOL)
  // Two groups named after their class alone, as a school's tenant has them, for the search of all classes.
  for (const [id, name] of [['44444444-4444-4444-8444-444444444444', '7B'], ['55555555-5555-4555-8555-555555555555', '8C']] as const) {
    graph.groups.set(id, [])
    graph.names.set(id, name)
  }
  cleanups.push(() => graph.close())
  const solverUrl = process.env.E2E_SOLVER === 'real' ? await startRealSolver() : await startStandIn()
  const db = createDatabase(testDb.runtimeUrl, (err) => console.error('database client failed', err), clock)
  cleanups.push(() => db.close())
  const config = loadConfig({
    ...SERVER_ENV,
    PUBLIC_URL: `${ORIGIN}${BASE_PATH}`,
    HOST: '127.0.0.1',
    PORT: String(PORT),
    WEB_DIST_DIR: path.join(ROOT, 'apps', 'web', 'dist'),
    SOLVER_URL: solverUrl,
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
  const story = scenarioLoader({ db, clock, graph, accessToken: '', tenantId: TENANT_ID, bootstrapAdmins: [ANNA.email ?? ''], context: { baseUrl: config.publicUrl } }, SCHOOL)
  /** What the stage does: the rest of the school, around what the journeys did through the pages. */
  async function load(stage: Stage, until: unknown): Promise<object> {
    switch (stage) {
      case 'groups':
        // Every class's group but 5A's, and not the teachers': the journeys label those.
        return { labelled: await story.labelGroups(new Set([CLASS_5A_GROUP, TEACHERS_GROUP])) }
      case 'staff':
        // Every class teacher but 5A's, whom the journeys assign.
        await story.assignStaff(new Set(['5A']))
        return {}
      case 'catalogue': {
        const registration = await story.registrationNamed(sample.projectWeek)
        if (registration.state !== 'catalogue') throw new Error(`${sample.projectWeek} is ${registration.state}, not taking proposals`)
        return { items: (await story.catalogue(registration.id, await story.ensureCategories())).size }
      }
      case 'choices': {
        if (typeof until !== 'string' || Number.isNaN(Date.parse(until))) throw new Error('until must be an ISO 8601 time')
        // Sara's and Tim's lists are the journeys'.
        return await story.saveChoices((await story.registrationNamed(sample.projectWeek)).id, { until, skip: new Set([SARA.oid, TIM.oid]) })
      }
    }
  }
  /** GET /clock: where the clock stands; POST /clock {"at"} sets it; POST /tick runs the scheduler once at the clock's time; POST /scenario {"stage", "until"} loads a stage of the scenario. */
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
    if (request.method === 'POST' && request.url === '/scenario') {
      const { stage, until } = JSON.parse(await bodyOf(request)) as { stage?: unknown, until?: unknown }
      if (stage !== 'groups' && stage !== 'staff' && stage !== 'catalogue' && stage !== 'choices') return reply(400, { error: 'stage must be groups, staff, catalogue or choices' })
      return reply(200, await load(stage, until))
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

/** The stand-in for the solver: a greedy answer in the contract's shape, enough for the journeys through a run. */
async function startStandIn(): Promise<string> {
  const solver = await startFakeSolver()
  cleanups.push(() => solver.close())
  return solver.baseUrl
}

/** The real solver, with uv from apps/solver, on a free port; stopped with the harness. */
async function startRealSolver(): Promise<string> {
  const port = await freePort()
  const child = spawn('uv', ['run', '--frozen', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port), '--log-level', 'warning'], { cwd: path.join(ROOT, 'apps', 'solver'), stdio: ['ignore', 'ignore', 'inherit'], detached: true })
  const exited = new Promise<never>((_, reject) => child.once('exit', (code) => reject(new Error(`the solver exited with ${code}`))))
  // Its end at the harness's own is no failure; before the solver answers, the race below sees it.
  exited.catch(() => {})
  cleanups.push(async () => {
    if (child.pid === undefined || child.exitCode !== null) return
    // The whole group, uv and the uvicorn it runs; killed when a solve in flight keeps it from stopping.
    const stopped = new Promise((resolve) => child.once('exit', resolve))
    process.kill(-child.pid, 'SIGTERM')
    if (await Promise.race([stopped.then(() => true), new Promise((resolve) => setTimeout(resolve, 5000, false))])) return
    process.kill(-child.pid, 'SIGKILL')
    await stopped
  })
  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 120_000
  for (;;) {
    const healthy = await Promise.race([fetch(`${url}/health`).then((r) => r.ok, () => false), exited])
    if (healthy) return url
    if (Date.now() > deadline) throw new Error('the solver did not answer within two minutes')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })
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
