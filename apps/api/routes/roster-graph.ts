// Graph authorization, roster refresh and group picker. Token handles belong to this app instance.

import { GraphPickerTokens } from '../lib/graph-picker-tokens.ts'
import { findGraphGroups, prepareGraphImport } from '../services/graph-picker.ts'

import * as endpoints from '@school-allocation/api-contracts/roster-graph-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import type { Config } from '../config.ts'
import { actorOf } from '../lib/actor.ts'
import { callerOf, withinSeconds, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { registerGraphAuthorization, SIGN_IN_SECONDS, SignInError } from '../lib/entra.ts'
import { GRAPH_BASE_URL, GraphError } from '../lib/graph.ts'
import { importGraphRoster } from '../services/roster-import.ts'

export interface RosterGraphOptions {
  config: Config
  db: Database
  guards: Guards
  /** Where Entra is reached; only tests set it. */
  entraAuthority?: string
  /** Where Graph is reached; only tests set it. */
  graphBaseUrl?: string
}

export async function rosterGraphRoutes(app: FastifyInstance, { config, db, guards, entraAuthority, graphBaseUrl = GRAPH_BASE_URL }: RosterGraphOptions): Promise<void> {
  const admin = { preHandler: guards.requireRole('school_admin') }

  const graph = await registerGraphAuthorization(app, config.entra, `${config.publicUrl}/api/admin/roster/graph/callback`, db, config.basePath, config.graphScopes, entraAuthority)

  const rosterPage = `${config.basePath}/verwaltung/stammdaten`

  // The picker's tokens, by the handle the session carries. Per server
  // instance: a restart forgets them, and the administrator authorizes again.
  const pickerTokens = new GraphPickerTokens(() => db.now().getTime())

  // Sets the state cookie and the pending refresh; changes nothing on the
  // server. The callback, with the token the administrator just consented
  // to, does the reading.
  registerEndpoint(app, endpoints.getAdminRosterGraphStart, { ...admin, exposeHeadRoute: false }, async (request, reply) => {
    const purpose = request.query.purpose ?? 'refresh'
    const schoolYear = request.query.schoolYear ?? ''
    if (purpose === 'refresh') await prepareGraphImport(db, schoolYear)
    const nonce = randomBytes(32).toString('base64url')
    request.userSession.set('graphRefresh', { nonce, schoolYear, purpose, startedAt: db.now().getTime() })
    return reply.redirect(await graph.authorizationUrl(request, reply, nonce), 302)
  })

  // The callback is a GET that changes state, as the sign-in's is, and it
  // is guarded the same way: the state must match this browser's cookie,
  // the pending refresh must be this session's, and the ID token that
  // comes with the Graph token must name the administrator who is signed
  // in, so the token read with is their own. The browser ends up on the
  // batch's page, or on the roster page with what went wrong.
  registerEndpoint(app, endpoints.getAdminRosterGraphCallback, { ...admin, exposeHeadRoute: false }, async (request, reply) => {
    const failed = (code: string, err?: unknown) => {
      request.log.warn({ err }, `roster refresh failed: ${code}`)
      return reply.redirect(`${rosterPage}?fehler=${encodeURIComponent(code)}`, 303)
    }
    if (!graph.stateMatches(request, request.query.state)) return failed('state_mismatch')
    const session = request.userSession
    const pending = session.get('graphRefresh')
    if (pending) session.set('graphRefresh', undefined)
    if (!pending || !withinSeconds(pending.startedAt, SIGN_IN_SECONDS, db.now().getTime())) return failed('no_pending_refresh')
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
      const handle = pickerTokens.store(caller.id, accessToken)
      session.set('graphPicker', handle)
      return reply.redirect(`${rosterPage}?gruppen=suchen`, 303)
    }
    try {
      const batch = await importGraphRoster(db, graphBaseUrl, accessToken, pending.schoolYear, actorOf(caller))
      return reply.redirect(`${rosterPage}/import/${batch.id}`, 303)
    } catch (err) {
      return failed(err instanceof GraphError ? err.code : 'import_failed', err)
    }
  })

  // The picker's search, with the token the administrator authorized for it;
  // 409 asks them to authorize (again) when there is none or it has expired.
  registerEndpoint(app, endpoints.getAdminRosterGraphGroups, { ...admin }, async (request, reply) => {
    const token = pickerTokens.read(request.userSession.get('graphPicker'), callerOf(request).id)
    if (!token) return reply.code(409).send({ error: 'graph_not_authorized' })
    try {
      return await findGraphGroups(graphBaseUrl, token, request.query)
    } catch (err) {
      if (!(err instanceof GraphError)) throw err
      request.log.warn({ err }, `group search failed: ${err.code}`)
      if (err.code === 'graph_unauthorized') {
        // Graph does not take the token any more: forgotten, and authorized anew.
        const handle = request.userSession.get('graphPicker')
        pickerTokens.forget(handle)
        request.userSession.set('graphPicker', undefined)
        return reply.code(409).send({ error: 'graph_not_authorized' })
      }
      return reply.code(err.code === 'graph_forbidden' ? 403 : 502).send({ error: err.code })
    }
  })
}
