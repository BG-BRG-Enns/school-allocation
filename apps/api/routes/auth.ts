// Sign-in for everyone, students and teachers alike, and the session it
// starts.
//
//   GET  /api/auth/login?returnTo=/path  start sign-in at Entra
//   GET  /api/auth/callback              Entra sends the browser back here
//   POST /api/auth/logout
//   GET  /api/auth/me                    who is signed in; 204 when nobody is
//
// The callback is the one GET that changes state: it records the person,
// grants the first administrators their role, and starts the session. It
// has to be a GET, because Entra returns the browser with a top-level
// redirect that carries the code in the query. A forged or replayed callback
// gets nowhere: the state must match the state cookie, the code is redeemed
// only with the client secret, and the ID token must carry the nonce from
// the sealed session; state and nonce are set in this browser by the login
// that started this sign-in, and used once.

import * as endpoints from '@school-allocation/api-contracts/auth-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomBytes } from 'node:crypto'
import type { Config } from '../config.ts'
import { currentUser, loadCaller, withinSeconds } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { registerEntra, SIGN_IN_SECONDS, SignInError } from '../lib/entra.ts'
import { safeReturnTo } from '../lib/return-to.ts'
import { recordSignIn } from '../services/sign-in.ts'

export interface AuthRoutesOptions {
  config: Config
  db: Database
  /** Where Entra is reached; only tests set it. */
  entraAuthority?: string
}

// Starting and completing a sign-in is limited per client address: generous
// enough for a class behind one NAT address, tight enough that nobody can
// make this server send Entra a token request per request they send. Only
// the routes that set this are limited; the plugin logs nothing.
const SIGN_IN_RATE_LIMIT = { max: 60, timeWindow: 60_000 }

export async function authRoutes(app: FastifyInstance, { config, db, entraAuthority }: AuthRoutesOptions): Promise<void> {
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => Object.assign(new Error('rate limited'), { statusCode: context.statusCode, code: 'rate_limited' }),
  })
  const entra = await registerEntra(app, config.entra, `${config.publicUrl}/api/auth/callback`, config.basePath, entraAuthority)

  // Sets the state cookie and the pending sign-in; changes nothing on the
  // server. After an sso_reload the same URL would fail silently again, so
  // that retry asks for the interactive sign-in page once.
  registerEndpoint(app, endpoints.getAuthLogin, { exposeHeadRoute: false, config: { rateLimit: SIGN_IN_RATE_LIMIT } }, async (request, reply) => {
    const nonce = randomBytes(32).toString('base64url')
    request.userSession.set('signIn', { nonce, returnTo: safeReturnTo(request.query.returnTo, config.basePath), startedAt: Date.now() })
    const interactive = request.query.sso_reload === 'true'
    return reply.redirect(await entra.authorizationUrl(request, reply, nonce, interactive), 302)
  })

  registerEndpoint(app, endpoints.getAuthCallback, { exposeHeadRoute: false, config: { rateLimit: SIGN_IN_RATE_LIMIT } }, async (request, reply) => {
    // Only the callback of this browser's own sign-in may use it up. The
    // session cookie is Lax, so another site can send the browser here, and
    // that must not cancel a sign-in in progress. Entra returns the state
    // with an error too, so only a callback without it is turned away here.
    if (!entra.stateMatches(request, request.query.state)) {
      return refuse(request, reply, new SignInError('state_mismatch'))
    }
    const session = request.userSession
    const pending = session.get('signIn')
    if (pending) session.set('signIn', undefined)
    if (!pending || !withinSeconds(pending.startedAt, SIGN_IN_SECONDS)) {
      return refuse(request, reply, new SignInError('no_pending_sign_in'))
    }
    let identity
    try {
      // Entra reports a cancelled or refused sign-in as ?error=.
      if (request.query.error !== undefined || request.query.code === undefined) throw new SignInError('no_code')
      identity = await entra.verifyIdToken(await entra.exchangeCode(request, reply), pending.nonce)
    } catch (err) {
      return refuse(request, reply, err)
    }
    // The person is recorded, a listed first administrator gets the role,
    // and a CSV roster entry with this address is bound to the identity, in
    // one transaction with the audit events of the grant and the binding.
    // The school scope's lock comes first, before the person's row is
    // touched: the administrative changes take it first too and then write
    // app_user (a block), so the two never wait for each other.
    const user = await recordSignIn(db, identity, config.bootstrapAdmins)
    if (user.blocked) {
      request.log.warn('sign-in refused: blocked')
      return reply.code(403).send({ error: 'blocked' })
    }
    session.set('user', { id: user.id, displayName: identity.displayName, issuedAt: Date.now() })
    // Checked at login and sealed since; checked again all the same.
    return reply.redirect(safeReturnTo(pending.returnTo, config.basePath), 303)
  })

  registerEndpoint(app, endpoints.postAuthLogout, { }, (request, reply) => {
    request.userSession.delete()
    void reply.code(204).send()
  })

  // The app's shell asks this on every page. Nobody signed in is an answer
  // (204), not a refusal: a browser logs every error status it gets, and a
  // signed-out visit is not an error. The roles come from the database on
  // every call, so a grant or a block shows at the next page load.
  registerEndpoint(app, endpoints.getAuthMe, { }, async (request, reply) => {
    const user = currentUser(request)
    const caller = user ? await loadCaller(db, user.id) : undefined
    if (!caller) {
      if (user) request.userSession.delete()
      return reply.code(204).send()
    }
    return { id: caller.id, displayName: caller.displayName, roles: caller.roles, person: caller.person }
  })
}

// The log line says why, by error type and code; never a token, a claim or
// the message of a library error.
function refuse(request: FastifyRequest, reply: FastifyReply, err: unknown) {
  request.log.warn({ err }, 'sign-in refused')
  return reply.code(401).send({ error: 'sign_in_failed' })
}
