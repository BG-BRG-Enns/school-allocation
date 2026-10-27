// Sign-in with Microsoft Entra ID for one tenant, as a confidential client:
// the authorization code flow with state and nonce. @fastify/oauth2 builds
// the authorization URL, keeps the state in a short-lived __Host- cookie,
// checks it and exchanges the code. jose then verifies the ID token against
// the tenant's signing keys, and the claims are checked here, failing
// closed. Nothing contacts Entra before the first sign-in: the keys are
// fetched on first use and cached.
//
// No PKCE, by decision: the client is confidential, so an intercepted code
// is worth nothing without the client secret, and the nonce ties the ID
// token to the browser that started the sign-in, so a code injected into
// another browser's callback is refused.
//
// No app roles: who is a student, a teacher or an administrator is the
// roster's and the application's to say (docs/identity-and-roles.md), so a
// token's roles claim is not read.
//
// The same flow, with Microsoft Graph scopes, gets an administrator's own
// Graph token for a roster refresh (registerGraphAuthorization): the app
// holds no directory permission of its own, and the token lives for the
// one request that uses it.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import oauth2, { type OAuth2Namespace } from '@fastify/oauth2'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { GUID, type EntraConfig } from '../config.ts'
import { boundedName, type EntraIdentity } from './app-user.ts'
import { GRAPH_BASE_URL } from './graph.ts'

export const ENTRA_AUTHORITY = 'https://login.microsoftonline.com'
/** Holds the state of a started sign-in until its callback; at the root of a host, where __Host- binds it to the host and the path /. */
export const STATE_COOKIE = '__Host-oauth2-redirect-state'
/** The same for a started Graph authorization. */
export const GRAPH_STATE_COOKIE = '__Host-oauth2-graph-state'

/**
 * The state cookie for a base path: under one it carries the routes' path,
 * which __Host- forbids, so the name is __Secure- there. One cookie per
 * flow, so a sign-in and a Graph authorization in the same browser do not
 * overwrite each other's state.
 */
export function stateCookie(basePath: string, flow: 'sign-in' | 'graph' = 'sign-in'): { name: string, path: string } {
  if (flow === 'graph') {
    return basePath === '' ? { name: GRAPH_STATE_COOKIE, path: '/' } : { name: '__Secure-oauth2-graph-state', path: `${basePath}/api/admin/roster/graph` }
  }
  return basePath === '' ? { name: STATE_COOKIE, path: '/' } : { name: '__Secure-oauth2-redirect-state', path: `${basePath}/api/auth` }
}
/** How long a started sign-in may take. */
export const SIGN_IN_SECONDS = 10 * 60

export interface EntraClient {
  /**
   * The URL to send the browser to; sets the state cookie on the reply.
   * `interactive` asks Entra for the sign-in page instead of single sign-on.
   */
  authorizationUrl: (request: FastifyRequest, reply: FastifyReply, nonce: string, interactive: boolean) => Promise<string>
  /** Whether a callback carries the state of the sign-in this browser started. */
  stateMatches: (request: FastifyRequest, state: string | undefined) => boolean
  /** Checks the state, redeems the code, clears the state cookie; returns the ID token. */
  exchangeCode: (request: FastifyRequest, reply: FastifyReply) => Promise<string>
  verifyIdToken: (idToken: string, nonce: string) => Promise<EntraIdentity>
}

/** The Graph authorization an administrator goes through for a roster refresh. */
export interface GraphAuthorization {
  authorizationUrl: (request: FastifyRequest, reply: FastifyReply, nonce: string) => Promise<string>
  stateMatches: (request: FastifyRequest, state: string | undefined) => boolean
  /** Checks the state, redeems the code, clears the state cookie; returns the Graph access token and the ID token that says whose it is. */
  exchangeCode: (request: FastifyRequest, reply: FastifyReply) => Promise<{ accessToken: string, idToken: string }>
  verifyIdToken: (idToken: string, nonce: string) => Promise<EntraIdentity>
}

/** A refused sign-in; `code` says why and is safe to log. */
export class SignInError extends Error {
  override name = 'SignInError'
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

interface OAuthEndpoints {
  authority: string
  tenant: string
}

function endpoints(config: EntraConfig, authority: string): OAuthEndpoints {
  return { authority, tenant: `/${config.tenantId}` }
}

function oauthOptions(name: string, config: EntraConfig, scope: string[], redirectUri: string, cookie: { name: string, path: string }, { authority, tenant }: OAuthEndpoints) {
  return {
    name,
    scope,
    credentials: {
      client: { id: config.clientId, secret: config.clientSecret },
      auth: {
        authorizeHost: authority,
        authorizePath: `${tenant}/oauth2/v2.0/authorize`,
        tokenHost: authority,
        tokenPath: `${tenant}/oauth2/v2.0/token`,
      },
      // A token endpoint that does not answer must not hold the callback.
      http: { timeout: 10_000 },
    },
    callbackUri: redirectUri,
    redirectStateCookieName: cookie.name,
    hostPrefixedCookies: true,
    cookie: { path: cookie.path, httpOnly: true, sameSite: 'lax' as const, maxAge: SIGN_IN_SECONDS },
  }
}

/**
 * Verifies an ID token of this tenant's client: signature by a current
 * tenant key, issuer, audience, expiry, then the tenant, the nonce and a
 * well-formed object id. The expected issuer is Entra's whatever
 * `authority` the keys come from (tests point it at a stand-in).
 */
export function idTokenVerifier(config: EntraConfig, authority: string): (idToken: string, nonce: string) => Promise<EntraIdentity> {
  const { tenant } = endpoints(config, authority)
  const keys = createRemoteJWKSet(new URL(`${authority}${tenant}/discovery/v2.0/keys`))
  const issuer = `${ENTRA_AUTHORITY}${tenant}/v2.0`
  return async (idToken, nonce) => {
    const { payload } = await jwtVerify(idToken, keys, {
      issuer,
      audience: config.clientId,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'nonce', 'tid', 'oid'],
      clockTolerance: 60,
    })
    if (payload.tid !== config.tenantId) throw new SignInError('wrong_tenant')
    if (payload.nonce !== nonce) throw new SignInError('wrong_nonce')
    const oid = typeof payload.oid === 'string' ? payload.oid.toLowerCase() : ''
    if (!GUID.test(oid)) throw new SignInError('no_oid')
    const upn = address(payload.preferred_username)
    return {
      tid: config.tenantId,
      oid,
      displayName: boundedName(payload.name) ?? boundedName(payload.preferred_username) ?? oid,
      email: address(payload.email) ?? upn ?? null,
      upn: upn ?? null,
    }
  }
}

/**
 * Registers the OAuth client on `app` (an encapsulated instance: only the
 * sign-in routes see it). `authority` is where Entra is reached; tests point
 * it at a local stand-in.
 */
export async function registerEntra(app: FastifyInstance, config: EntraConfig, redirectUri: string, basePath = '', authority = ENTRA_AUTHORITY): Promise<EntraClient> {
  const cookie = stateCookie(basePath)
  // openid for the ID token, email and profile for the address and the
  // name. No API scope: the access token is never used, and no token is
  // kept after sign-in.
  await app.register(oauth2, oauthOptions('entra', config, ['openid', 'email', 'profile'], redirectUri, cookie, endpoints(config, authority)))
  const client = app.getDecorator<OAuth2Namespace>('entra')
  const verifyIdToken = idTokenVerifier(config, authority)

  return {
    async authorizationUrl(request, reply, nonce, interactive) {
      const url = new URL(await client.generateAuthorizationUri(request, reply))
      url.searchParams.set('nonce', nonce)
      if (interactive) url.searchParams.set('prompt', 'login')
      return url.toString()
    },
    stateMatches: (request, state) => cookieStateMatches(request, cookie.name, state),
    async exchangeCode(request, reply) {
      const token = await redeem(client, request, reply)
      return token.idToken
    },
    verifyIdToken,
  }
}

/**
 * The authorization an administrator gives for one roster refresh: the
 * same client, the Graph scopes the deployment asks for, and openid so the
 * ID token says whose token it is. Registered on an encapsulated instance
 * of its own, beside the sign-in's.
 */
export async function registerGraphAuthorization(app: FastifyInstance, config: EntraConfig, redirectUri: string, basePath: string, scopes: readonly string[], authority = ENTRA_AUTHORITY): Promise<GraphAuthorization> {
  const cookie = stateCookie(basePath, 'graph')
  const scope = ['openid', ...scopes.map((name) => `${GRAPH_BASE_URL}/${name}`)]
  await app.register(oauth2, oauthOptions('graphConsent', config, scope, redirectUri, cookie, endpoints(config, authority)))
  const client = app.getDecorator<OAuth2Namespace>('graphConsent')
  const verifyIdToken = idTokenVerifier(config, authority)

  return {
    async authorizationUrl(request, reply, nonce) {
      const url = new URL(await client.generateAuthorizationUri(request, reply))
      url.searchParams.set('nonce', nonce)
      return url.toString()
    },
    stateMatches: (request, state) => cookieStateMatches(request, cookie.name, state),
    exchangeCode: (request, reply) => redeem(client, request, reply),
    verifyIdToken,
  }
}

// The comparison the code exchange makes again: the cookie as the start of
// the flow set it, against the state Entra sent back.
function cookieStateMatches(request: FastifyRequest, cookieName: string, state: string | undefined): boolean {
  const expected = request.cookies[cookieName]
  return expected !== undefined && expected !== '' && state === expected
}

async function redeem(client: OAuth2Namespace, request: FastifyRequest, reply: FastifyReply): Promise<{ accessToken: string, idToken: string }> {
  let token: { id_token?: unknown, access_token?: unknown }
  try {
    token = (await client.getAccessTokenFromAuthorizationCodeFlow(request, reply)).token
  } catch (err) {
    throw new SignInError(exchangeFailure(err))
  }
  if (typeof token.id_token !== 'string') throw new SignInError('no_id_token')
  if (typeof token.access_token !== 'string') throw new SignInError('no_access_token')
  return { accessToken: token.access_token, idToken: token.id_token }
}

// What an operator needs to tell a forged or stale callback from a broken
// app registration or an unreachable Entra. @fastify/oauth2 reports a state
// that does not match its cookie with exactly the error "Invalid state".
// The HTTP client fails with a Boom error; an answer from the token
// endpoint carries an OAuth error code (such as invalid_client for a wrong
// secret), a fixed vocabulary that is safe to log, unlike
// `error_description`. Anything else is a failed token request.
function exchangeFailure(err: unknown): string {
  if (err instanceof Error && err.message === 'Invalid state' && !('isBoom' in err)) return 'state_mismatch'
  const code = (err as { data?: { payload?: { error?: unknown } } } | null)?.data?.payload?.error
  return typeof code === 'string' && /^[a-z_]{1,64}$/.test(code) ? `token_request_${code}` : 'token_request_failed'
}

/** An address claim as it is kept: trimmed text, bounded like any address; undefined when absent or not one. */
function address(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text !== '' && text.length <= 254 ? text : undefined
}
