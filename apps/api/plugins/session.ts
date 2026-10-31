// Sessions live in the cookie itself, sealed by @fastify/secure-session
// (libsodium secretbox: encrypted and authenticated). The server keeps no
// session table, and a tampered, truncated, expired or foreign cookie reads
// as no session at all.
//
// One kind of session, for everyone who signs in: students, teachers and
// the people with a privileged role. The cookie carries who signed in and
// when; what they may do is read from the database on every request
// (lib/auth.ts), so a block or a revoked role takes effect at once.
//
// Sign-out only drops the cookie in that browser; a copied cookie stays
// valid until it expires. The lifetime is therefore short and absolute,
// counted from sign-in.
//
// The session counts only beside the binding cookie of the browser it was
// started in (SESSION_BIND_COOKIE below): under a base path its cookie is
// __Secure-, which other hosts of the same site can plant.

import { createHash, hkdfSync } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import secureSession, { type Session } from '@fastify/secure-session'
import type { Config } from '../config.ts'

/** The session's cookie at the root of a host: __Host-, which binds it to this host and the path / alone. */
export const SESSION_COOKIE = '__Host-session'

/**
 * The cookie's name for a base path. Under a path the cookie carries that
 * path, so the browser sends it to this app alone and not to the rest of
 * the host; __Host- forbids a path, so the name is __Secure- there.
 */
export function sessionCookie(basePath: string): string {
  return basePath === '' ? SESSION_COOKIE : '__Secure-session'
}
/** A school day, however active the session is. */
export const SESSION_SECONDS = 8 * 60 * 60

/**
 * The binding cookie: random, set at the start of a sign-in, and __Host-,
 * so only this host can set it, at the path / that __Host- requires. The
 * session carries its digest and counts only beside it. Under a base path
 * the session cookie is __Secure-, and any host of the same site may set a
 * __Secure- cookie for the whole domain, at a longer path the browser sends
 * first: someone could plant their own session, or their own sign-in in
 * progress, in another person's browser, who would then work as them. Its
 * digest is not that browser's, so it reads as none. At the root the
 * session cookie is __Host- already; the binding holds there too, so both
 * run the same code.
 */
export const SESSION_BIND_COOKIE = '__Host-session-bind'
/** 32 random bytes, base64url. */
export const SESSION_BIND_VALUE = /^[\w-]{43}$/

/** What the session carries of a binding cookie's value. */
export function bindDigest(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

/** Whether the session was started in this browser: it carries the digest of this browser's binding cookie. */
export function sessionBound(request: FastifyRequest): boolean {
  const value = request.cookies[SESSION_BIND_COOKIE]
  const bind = request.userSession.get('bind')
  return typeof value === 'string' && SESSION_BIND_VALUE.test(value) && typeof bind === 'string' && bind === bindDigest(value)
}

/** Who signed in; set by the sign-in callback only. */
export interface SessionUser {
  /** app_user.id */
  id: string
  displayName: string
  /** Date.now() at sign-in; the lifetime is counted from here. */
  issuedAt: number
}

/** Between GET /api/auth/login and the callback. */
export interface PendingSignIn {
  /** Must come back inside the ID token. */
  nonce: string
  returnTo: string
  startedAt: number
}

/** Between an administrator's start of a Graph authorization and its callback: a roster refresh, or the group picker's token. */
export interface PendingGraphRefresh {
  /** Must come back inside the ID token of the authorization. */
  nonce: string
  /** The school year the batch is for (a refresh). */
  schoolYear: string
  purpose: 'refresh' | 'picker'
  startedAt: number
}

export interface UserSessionData {
  user: SessionUser
  signIn: PendingSignIn
  graphRefresh: PendingGraphRefresh
  /** The handle of the Graph token the picker searches groups with; the token itself stays in the server's memory (routes/admin-roster.ts). */
  graphPicker: string
  /** bindDigest() of the browser's binding cookie; set with the pending sign-in. */
  bind: string
}

declare module 'fastify' {
  interface FastifyRequest {
    userSession: Session<UserSessionData>
  }
}

export async function registerSessions(app: FastifyInstance, config: Config): Promise<void> {
  await app.register(secureSession, [{
    sessionName: 'userSession',
    cookieName: sessionCookie(config.basePath),
    key: sessionKey(config.sessionSecret, 'school-allocation user session v1'),
    expiry: SESSION_SECONDS,
    // Only this host, over https, for the whole app: the base path, or /.
    // Lax, not Strict: the browser has to send it on the top-level
    // navigation back from Entra, which carries the pending sign-in.
    // Cross-site writes are refused by the fetch-metadata check, not by
    // SameSite.
    cookie: { path: config.basePath || '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: SESSION_SECONDS },
  }])
}

/** A 32-byte secretbox key for one kind of session. */
export function sessionKey(secret: Buffer, label: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), label, 32))
}
