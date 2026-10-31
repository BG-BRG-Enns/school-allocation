// The whole server for a test: a fresh database, the stand-ins for Entra
// and Graph, and the app built as production builds it, with helpers that
// sign a person in and speak to the API as the browser would.

import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance, InjectOptions } from 'fastify'
import type { Clock } from '../../lib/clock.ts'
import { createDatabase, type Database } from '../../lib/db.ts'
import { buildTestApp } from './app.ts'
import { createTestDatabase, DB } from './db.ts'
import { CookieJar, startFakeEntra, type FakeEntra } from './fake-entra.ts'
import { startFakeGraph, type FakeGraph, type FakeMember } from './fake-graph.ts'
import { claimsOf, type Person } from './personas.ts'

export { DB }

export interface Harness {
  app: FastifyInstance
  entra: FakeEntra
  graph: FakeGraph
  /** The runtime connection the app uses. */
  db: Database
  ownerUrl: string
  /** Every log line the server wrote so far; what a 500 says about itself. */
  logs: () => string
}

/** `clock`, when a test controls the time (helpers/clock.ts), is the database's and the stand-in for Entra's; the system's otherwise. */
export async function harness(t: TestContext, env: Record<string, string> = {}, groups?: Map<string, FakeMember[]>, clock?: Clock): Promise<Harness> {
  const testDb = await createTestDatabase(t)
  const entra = await startFakeEntra({ clock })
  t.after(() => entra.close())
  const graph = await startFakeGraph(entra.issued, groups)
  t.after(() => graph.close())
  const db = createDatabase(testDb.runtimeUrl, () => {}, clock)
  t.after(() => db.close())
  const { app, logs } = await buildTestApp(env, db, { entraAuthority: entra.authority, graphBaseUrl: graph.baseUrl })
  t.after(() => app.close())
  return { app, entra, graph, db, ownerUrl: testDb.ownerUrl, logs }
}

/** Signs `person` in, in a browser of their own; the jar carries their session. */
export async function signIn({ app, entra }: Harness, person: Person): Promise<CookieJar> {
  const jar = new CookieJar()
  const login = await app.inject({ method: 'GET', url: '/api/auth/login', headers: { cookie: jar.header() } })
  assert.equal(login.statusCode, 302)
  jar.update(login)
  const response = await app.inject({ method: 'GET', url: entra.authorize(login.headers.location as string, { claims: claimsOf(person) }), headers: { cookie: jar.header() } })
  assert.equal(response.statusCode, 303, response.body)
  jar.update(response)
  return jar
}

/** A request from a page of the app: the session's cookies, and the fetch metadata a same-origin request carries. */
export function asBrowser(jar: CookieJar | undefined, options: InjectOptions): InjectOptions {
  return {
    ...options,
    headers: { ...(jar ? { cookie: jar.header() } : {}), 'sec-fetch-site': 'same-origin', ...options.headers },
  }
}

export async function get<T = unknown>(h: Harness, jar: CookieJar | undefined, url: string): Promise<{ status: number, body: T }> {
  const response = await h.app.inject(asBrowser(jar, { method: 'GET', url }))
  return { status: response.statusCode, body: response.statusCode === 204 ? undefined as T : response.json<T>() }
}

export async function send<T = unknown>(h: Harness, jar: CookieJar | undefined, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object): Promise<{ status: number, body: T }> {
  const response = await h.app.inject(asBrowser(jar, { method, url, ...(payload === undefined ? {} : { payload }) }))
  return { status: response.statusCode, body: response.statusCode === 204 ? undefined as T : response.json<T>() }
}

export const me = (h: Harness, jar: CookieJar) => get<{ id: string, displayName: string, roles: string[], person: { id: string, kind: string | null, className: string | null, grade: number | null } | null }>(h, jar, '/api/auth/me')
