// The roster, for school administrators (docs/data-sources.md §3):
//
//   GET  /api/admin/roster                      the batch in force, the labelled groups, recent batches
//   PUT  /api/admin/roster/groups               label the Entra groups the Graph import reads
//   GET  /api/admin/roster/graph/start          authorize a refresh from the groups with the administrator's own Graph token,
//                                               or (purpose=picker) a token the group picker searches with
//   GET  /api/admin/roster/graph/callback       Entra sends the browser back here; the batch is written and shown, or the
//                                               picker's token is kept in memory for its lifetime
//   GET  /api/admin/roster/graph/groups?q=      the tenant's groups by name, with that token (D-23)
//   POST /api/admin/roster/csv                  a CSV roster, as a pending batch with its diff
//   GET  /api/admin/roster/csv/template         the file to start from
//   GET  /api/admin/roster/batches/:id          a batch with its diff, problems and warnings
//   POST /api/admin/roster/batches/:id/commit   it is the roster now
//   POST /api/admin/roster/batches/:id/discard
//   GET  /api/admin/roster/persons?q=           the persons of the roster in force, for binding an account
//
// An import is a job (lib/jobs.ts): the nightly update stays away while it
// runs. Commit and discard are decisions on stored rows and need no job.

import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Type, type Static } from 'typebox'
import { CLASS_NAME, CSV_LIMITS, GRADES, isSchoolYear, parseRosterCsv, ROSTER_CSV_TEMPLATE, schoolYearOf } from '@school-allocation/school-core'
import type { Config } from '../config.ts'
import { callerOf, withinSeconds, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { registerGraphAuthorization, SIGN_IN_SECONDS, SignInError } from '../lib/entra.ts'
import { GRAPH_BASE_URL, GraphError, listGroupMembers, membersToEntries, searchGroups, type GraphMember } from '../lib/graph.ts'
import { runJob } from '../lib/jobs.ts'
import { commitBatch, createBatch, currentBatch, discardBatch, listBatches, readBatch, RosterConflict, searchPersons, type Actor } from '../lib/roster.ts'
import { readGroups, replaceGroups } from '../lib/roster-groups.ts'
import { ErrorResponse, PersonKindSchema, SingleLineText, StrictObject, Uuid } from '../lib/schemas/common.ts'

export interface AdminRosterOptions {
  config: Config
  db: Database
  guards: Guards
  /** Where Entra is reached; only tests set it. */
  entraAuthority?: string
  /** Where Graph is reached; only tests set it. */
  graphBaseUrl?: string
}

const SchoolYear = Type.String({ pattern: '^[0-9]{4}/[0-9]{2}$' })

const GroupInput = StrictObject({
  groupId: Uuid,
  label: SingleLineText(200),
  kind: PersonKindSchema,
  className: Type.Optional(Type.String({ pattern: CLASS_NAME.source, maxLength: 16 })),
  grade: Type.Optional(Type.Integer({ minimum: GRADES.min, maximum: GRADES.max })),
})
const GroupsBody = StrictObject({ groups: Type.Array(GroupInput, { maxItems: 200 }) })

const CsvBody = StrictObject({
  csv: Type.String({ minLength: 1, maxLength: CSV_LIMITS.rows * (CSV_LIMITS.field + 1) * 8 }),
  schoolYear: SchoolYear,
})
/** The JSON around a CSV of CSV_LIMITS.rows rows of long fields. */
const CSV_BODY_LIMIT = 12 * 1024 * 1024

const IdParams = StrictObject({ id: Uuid })
const GraphStartQuery = StrictObject({
  schoolYear: Type.Optional(SchoolYear),
  purpose: Type.Optional(Type.Union([Type.Literal('refresh'), Type.Literal('picker')])),
})
const GroupsQuery = StrictObject({ q: Type.String({ minLength: 1, maxLength: 100 }) })

/**
 * How long the picker keeps an administrator's Graph token: Entra issues
 * them for about an hour; well inside that, so a search never fails on an
 * expired one it still holds.
 */
const PICKER_TOKEN_SECONDS = 50 * 60

/** A Graph token held for the picker, in this process's memory only: never stored, never logged. */
interface PickerToken {
  accessToken: string
  userId: string
  expiresAt: number
}
// Not strict: Entra adds parameters of its own. Only these are read.
const GraphCallbackQuery = Type.Object({
  code: Type.Optional(Type.String({ maxLength: 8192 })),
  state: Type.Optional(Type.String({ maxLength: 512 })),
  error: Type.Optional(Type.String({ maxLength: 512 })),
})
const PersonsQuery = StrictObject({ q: Type.Optional(Type.String({ maxLength: 100 })) })

export async function adminRosterRoutes(app: FastifyInstance, { config, db, guards, entraAuthority, graphBaseUrl = GRAPH_BASE_URL }: AdminRosterOptions): Promise<void> {
  const admin = { preHandler: guards.requireRole('school_admin') }
  const graph = await registerGraphAuthorization(app, config.entra, `${config.publicUrl}/api/admin/roster/graph/callback`, config.basePath, config.graphScopes, entraAuthority)
  const rosterPage = `${config.basePath}/verwaltung/stammdaten`
  // The picker's tokens, by the handle the session carries. Per server
  // instance: a restart forgets them, and the administrator authorizes again.
  const pickerTokens = new Map<string, PickerToken>()
  const pickerToken = (request: FastifyRequest): PickerToken | undefined => {
    const now = Date.now()
    for (const [handle, token] of pickerTokens) if (token.expiresAt <= now) pickerTokens.delete(handle)
    const handle = request.userSession.get('graphPicker')
    const token = handle === undefined ? undefined : pickerTokens.get(handle)
    return token !== undefined && token.userId === callerOf(request).id ? token : undefined
  }

  app.get('/api/admin/roster', { ...admin, schema: { response: { '4xx': ErrorResponse } } }, async () => {
    const [current, groups, batches] = await Promise.all([currentBatch(db), readGroups(db), listBatches(db)])
    return { current: current ?? null, groups, batches, suggestedSchoolYear: suggestedSchoolYear(), graphScopes: config.graphScopes }
  })

  app.put<{ Body: Static<typeof GroupsBody> }>('/api/admin/roster/groups', { ...admin, schema: { body: GroupsBody, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const seen = new Set<string>()
    for (const group of request.body.groups) {
      const id = group.groupId.toLowerCase()
      if (seen.has(id)) return reply.code(422).send({ error: 'duplicate_group' })
      seen.add(id)
      const complete = group.className !== undefined && group.grade !== undefined
      if (group.kind === 'student' ? !complete : (group.className !== undefined || group.grade !== undefined)) {
        return reply.code(422).send({ error: 'group_label_incomplete' })
      }
    }
    const groups = await replaceGroups(db, request.body.groups.map((group) => ({ ...group, groupId: group.groupId.toLowerCase() })), actorOf(request))
    return { groups }
  })

  // Sets the state cookie and the pending refresh; changes nothing on the
  // server. The callback, with the token the administrator just consented
  // to, does the reading.
  app.get<{ Querystring: Static<typeof GraphStartQuery> }>('/api/admin/roster/graph/start', {
    ...admin,
    exposeHeadRoute: false,
    schema: { querystring: GraphStartQuery, response: { '4xx': ErrorResponse } },
  }, async (request, reply) => {
    const purpose = request.query.purpose ?? 'refresh'
    const schoolYear = request.query.schoolYear ?? ''
    if (purpose === 'refresh') {
      if (!isSchoolYear(schoolYear)) return reply.code(422).send({ error: 'invalid_school_year' })
      if ((await readGroups(db)).length === 0) return reply.code(409).send({ error: 'no_groups' })
    }
    const nonce = randomBytes(32).toString('base64url')
    request.userSession.set('graphRefresh', { nonce, schoolYear, purpose, startedAt: Date.now() })
    return reply.redirect(await graph.authorizationUrl(request, reply, nonce), 302)
  })

  // The callback is a GET that changes state, as the sign-in's is, and it
  // is guarded the same way: the state must match this browser's cookie,
  // the pending refresh must be this session's, and the ID token that
  // comes with the Graph token must name the administrator who is signed
  // in, so the token read with is their own. The browser ends up on the
  // batch's page, or on the roster page with what went wrong.
  app.get<{ Querystring: Static<typeof GraphCallbackQuery> }>('/api/admin/roster/graph/callback', {
    ...admin,
    exposeHeadRoute: false,
    schema: { querystring: GraphCallbackQuery, response: { '4xx': ErrorResponse } },
  }, async (request, reply) => {
    const failed = (code: string, err?: unknown) => {
      request.log.warn({ err }, `roster refresh failed: ${code}`)
      return reply.redirect(`${rosterPage}?fehler=${encodeURIComponent(code)}`, 303)
    }
    if (!graph.stateMatches(request, request.query.state)) return failed('state_mismatch')
    const session = request.userSession
    const pending = session.get('graphRefresh')
    if (pending) session.set('graphRefresh', undefined)
    if (!pending || !withinSeconds(pending.startedAt, SIGN_IN_SECONDS)) return failed('no_pending_refresh')
    const caller = callerOf(request)
    let accessToken: string
    try {
      if (request.query.error !== undefined || request.query.code === undefined) throw new SignInError('no_code')
      const token = await graph.exchangeCode(request, reply)
      const identity = await graph.verifyIdToken(token.idToken, pending.nonce)
      if (identity.oid !== caller.oid) throw new SignInError('token_of_someone_else')
      accessToken = token.accessToken
    } catch (err) {
      return failed('graph_authorization_failed', err)
    }
    if (pending.purpose === 'picker') {
      // Kept for the picker's searches, under a handle only this session
      // knows; the token itself never leaves the process.
      const handle = randomBytes(24).toString('base64url')
      pickerTokens.set(handle, { accessToken, userId: caller.id, expiresAt: Date.now() + PICKER_TOKEN_SECONDS * 1000 })
      session.set('graphPicker', handle)
      return reply.redirect(`${rosterPage}?gruppen=suchen`, 303)
    }
    try {
      const batch = await runJob(db, 'roster_import_graph', caller.id, async () => {
        const groups = await readGroups(db)
        const members = new Map<string, GraphMember[]>()
        for (const group of groups) members.set(group.groupId, await listGroupMembers(graphBaseUrl, accessToken, group.groupId))
        const { entries, warnings } = membersToEntries(groups, members)
        return createBatch(db, { source: 'graph:groups', schoolYear: pending.schoolYear, entries, warnings, triggeredBy: caller.id })
      })
      return reply.redirect(`${rosterPage}/import/${batch.id}`, 303)
    } catch (err) {
      return failed(err instanceof GraphError ? err.code : 'import_failed', err)
    }
  })

  // The picker's search, with the token the administrator authorized for it;
  // 409 asks them to authorize (again) when there is none or it has expired.
  app.get<{ Querystring: Static<typeof GroupsQuery> }>('/api/admin/roster/graph/groups', { ...admin, schema: { querystring: GroupsQuery, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const token = pickerToken(request)
    if (!token) return reply.code(409).send({ error: 'graph_not_authorized' })
    try {
      return { groups: await searchGroups(graphBaseUrl, token.accessToken, request.query.q.trim()) }
    } catch (err) {
      if (!(err instanceof GraphError)) throw err
      request.log.warn({ err }, `group search failed: ${err.code}`)
      if (err.code === 'graph_unauthorized') {
        // Graph does not take the token any more: forgotten, and authorized anew.
        const handle = request.userSession.get('graphPicker')
        if (handle !== undefined) pickerTokens.delete(handle)
        request.userSession.set('graphPicker', undefined)
        return reply.code(409).send({ error: 'graph_not_authorized' })
      }
      return reply.code(err.code === 'graph_forbidden' ? 403 : 502).send({ error: err.code })
    }
  })

  app.post<{ Body: Static<typeof CsvBody> }>('/api/admin/roster/csv', {
    ...admin,
    bodyLimit: CSV_BODY_LIMIT,
    schema: { body: CsvBody, response: { '4xx': ErrorResponse } },
  }, async (request, reply) => {
    if (!isSchoolYear(request.body.schoolYear)) return reply.code(422).send({ error: 'invalid_school_year' })
    const parsed = parseRosterCsv(request.body.csv)
    if (parsed.fileProblems.length > 0) {
      return reply.code(422).send({ error: 'csv_invalid', message: parsed.fileProblems.map(describeFileProblem).join('; ') })
    }
    const caller = callerOf(request)
    const batch = await runJob(db, 'roster_import_csv', caller.id, () => createBatch(db, {
      source: 'csv',
      schoolYear: request.body.schoolYear,
      entries: parsed.entries,
      problems: parsed.problems,
      triggeredBy: caller.id,
    }))
    return reply.code(201).send(batch)
  })

  app.get('/api/admin/roster/csv/template', { ...admin, exposeHeadRoute: false }, (_request, reply) => {
    void reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="schulwahl-personen.csv"')
      .send(ROSTER_CSV_TEMPLATE)
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/admin/roster/batches/:id', { ...admin, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const batch = await readBatch(db, request.params.id)
    if (!batch) return reply.code(404).send({ error: 'not_found' })
    return batch
  })

  app.post<{ Params: Static<typeof IdParams> }>('/api/admin/roster/batches/:id/commit', { ...admin, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    return decide(reply, () => commitBatch(db, request.params.id, actorOf(request), config.entra.tenantId))
  })

  app.post<{ Params: Static<typeof IdParams> }>('/api/admin/roster/batches/:id/discard', { ...admin, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    return decide(reply, () => discardBatch(db, request.params.id, actorOf(request)))
  })

  app.get<{ Querystring: Static<typeof PersonsQuery> }>('/api/admin/roster/persons', { ...admin, schema: { querystring: PersonsQuery, response: { '4xx': ErrorResponse } } }, async (request) => {
    return { persons: await searchPersons(db, request.query.q?.trim() ?? '', 200) }
  })
}

/** The decision's result, or 404 for a batch that does not exist and 409 with the code for one the state refuses. */
async function decide<T>(reply: FastifyReply, fn: () => Promise<T | undefined>) {
  try {
    const result = await fn()
    if (result === undefined) return reply.code(404).send({ error: 'not_found' })
    return result
  } catch (err) {
    if (err instanceof RosterConflict) return reply.code(409).send({ error: err.code })
    throw err
  }
}

/** The caller as an audit actor. */
export function actorOf(request: FastifyRequest): Actor {
  const caller = callerOf(request)
  return { id: caller.id, tid: caller.tid, oid: caller.oid, name: caller.displayName }
}

/** The school year today falls in, by the school's clock. */
function suggestedSchoolYear(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Vienna', year: 'numeric', month: 'numeric' }).formatToParts(now)
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return schoolYearOf(part('year'), part('month'))
}

function describeFileProblem(problem: { code: string, line?: number, column?: string }): string {
  const where = problem.line === undefined ? '' : ` (line ${problem.line})`
  const what = problem.column === undefined ? '' : ` (${problem.column})`
  return `${problem.code}${what}${where}`
}
