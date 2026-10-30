// Startup configuration: read from the environment once, validated before
// anything listens. A missing or unsafe value stops the process with one
// message that names every problem, instead of booting half-configured.
//
// No check here reads NODE_ENV. A safety rule that an environment variable
// can switch off is one a wrong deployment setting switches off.

import { readFileSync } from 'node:fs'
import { isIP } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMailbox } from './lib/mail/mailbox.ts'

export interface Config {
  host: string
  port: number
  /**
   * The address browsers use, without a trailing slash: an origin such as
   * https://wahl.example.org, or an origin with a path such as
   * https://www.example.org/wahl when the app runs under a path of a
   * shared host. Everything the app emits or compares derives from it.
   */
  publicUrl: string
  /** Its origin, which the CSRF check compares against. */
  publicOrigin: string
  /** Its path, '' at the root of a host or '/wahl': every route, cookie path and link starts with it. */
  basePath: string
  /** Addresses and CIDRs of the proxies whose X-Forwarded-* headers count. */
  trustProxy: string[]
  logLevel: LogLevel
  webDistDir: string
  /** Runtime connection, as the unprivileged role, password included. */
  databaseUrl: string
  entra: EntraConfig
  /** Key material the session cookie keys are derived from; at least 32 bytes. */
  sessionSecret: Buffer
  /**
   * Who becomes a school administrator at sign-in (lib/roles.ts): Entra
   * object ids or school addresses, in lower case. Empty when nobody is
   * listed; then the first grant has to come from the database.
   */
  bootstrapAdmins: string[]
  /**
   * The Microsoft Graph permissions an administrator's roster refresh asks
   * for, delegated, by name (lib/graph.ts): GroupMember.Read.All reads the
   * labelled groups' members, User.ReadBasic.All their names and addresses
   * (without it Graph lists ids only; verified on a tenant 2026-10-29),
   * Group.Read.All finds groups by name for the picker (docs/data-sources.md §3).
   */
  graphScopes: string[]
  /** How notices leave the school (D-18); null when SMTP_HOST is unset, and the outbox then only queues. */
  mail: MailConfig | null
  /**
   * Where the allocation solver answers (apps/solver, docs/domain-and-api.md
   * §6), an http(s) origin on the internal network, without a trailing
   * slash; null when SOLVER_URL is unset, and a run cannot be started.
   */
  solverUrl: string | null
  build: BuildInfo
}

/** The SMTP submission the sender uses (lib/mail/transport.ts): authenticated, over STARTTLS or implicit TLS. */
export interface MailConfig {
  host: string
  port: number
  /** Implicit TLS from the first byte (port 465); otherwise STARTTLS. */
  secure: boolean
  /** Refuse to send without STARTTLS when `secure` is false; off only for a test server on a private network. */
  requireTls: boolean
  user: string
  password: string
  /** The From header: a mailbox such as "SchulWahl <wahl@schule.example.org>". */
  from: string
  replyTo: string | null
  /** The envelope sender, where bounces go; the From address when unset. */
  envelopeFrom: string | null
}

/**
 * What was built, as the image records it (APP_VERSION and GIT_SHA, set from
 * build arguments). Outside an image they are unset: "dev" and "unknown".
 */
export interface BuildInfo {
  /** The release tag, such as v1.2.0. */
  version: string
  /** The commit the image was built from, lower-case hex. */
  gitSha: string
}

/** The school's own Entra ID app registration; single tenant, confidential client. */
export interface EntraConfig {
  /** Directory (tenant) id, lower-case GUID. */
  tenantId: string
  /** Application (client) id, lower-case GUID. */
  clientId: string
  clientSecret: string
}

export interface MigrationConfig {
  /** Owner connection, password included. Never given to the server. */
  databaseUrl: string
  /** Password the migrator sets on the runtime role. */
  runtimePassword: string
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'

export class ConfigError extends Error {
  override name = 'ConfigError'
}

type Env = Record<string, string | undefined>

const here = path.dirname(fileURLToPath(import.meta.url))
const loopbackOnly = ['127.0.0.0/8', '::1/128']

export function loadConfig(env: Env): Config {
  const problems: string[] = []
  const check = <T>(parse: () => T, fallback: T): T => {
    try {
      return parse()
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err
      problems.push(err.message)
      return fallback
    }
  }

  const publicUrl = check(() => parsePublicUrl(env.PUBLIC_URL), undefined)
  check(() => refuseRenamed(env), undefined)
  const host = env.HOST?.trim() || '127.0.0.1'
  const local = (publicUrl?.loopback ?? false) && isLoopbackHost(host)
  const config: Config = {
    host,
    port: check(() => parsePort(env.PORT), 0),
    publicUrl: publicUrl?.url ?? '',
    publicOrigin: publicUrl?.origin ?? '',
    basePath: publicUrl?.basePath ?? '',
    trustProxy: check(() => parseTrustProxy(env.TRUST_PROXY), []),
    logLevel: check(() => parseLogLevel(env.LOG_LEVEL, local), 'info'),
    webDistDir: env.WEB_DIST_DIR?.trim() || path.resolve(here, '..', 'web', 'dist'),
    databaseUrl: check(() => databaseUrl(env, 'DATABASE_URL', 'DATABASE_PASSWORD'), ''),
    entra: {
      tenantId: check(() => guid(env, 'ENTRA_TENANT_ID'), ''),
      clientId: check(() => guid(env, 'ENTRA_CLIENT_ID'), ''),
      // Printable ASCII is also all the token request accepts; checked here
      // so a bad file stops startup with this message, not with a library
      // error that quotes the secret.
      clientSecret: check(() => printableAscii(readSecret(env, 'ENTRA_CLIENT_SECRET'), 'ENTRA_CLIENT_SECRET_FILE'), ''),
    },
    sessionSecret: check(() => sessionSecret(env), Buffer.alloc(0)),
    bootstrapAdmins: check(() => parseBootstrapAdmins(env.BOOTSTRAP_ADMINS), []),
    graphScopes: check(() => parseGraphScopes(env.GRAPH_DELEGATED_SCOPES), []),
    mail: check(() => parseMail(env), null),
    solverUrl: check(() => parseSolverUrl(env.SOLVER_URL), null),
    build: {
      version: check(() => buildValue(env, 'APP_VERSION', 'dev', /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/, 'a release tag such as v1.2.0'), ''),
      gitSha: check(() => buildValue(env, 'GIT_SHA', 'unknown', /^[0-9a-f]{7,64}$/, 'a commit hash in lower-case hex'), ''),
    },
  }
  check(() => refuseDebugNamespaces(env.DEBUG, local), undefined)

  throwIfAny(problems)
  return config
}

/** What the migrator needs; the server never reads these variables. */
export function loadMigrationConfig(env: Env): MigrationConfig {
  const problems: string[] = []
  const check = (parse: () => string): string => {
    try {
      return parse()
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err
      problems.push(err.message)
      return ''
    }
  }
  const config = {
    databaseUrl: check(() => databaseUrl(env, 'MIGRATION_DATABASE_URL', 'MIGRATION_DATABASE_PASSWORD')),
    runtimePassword: check(() => printableAscii(readSecret(env, 'DB_RUNTIME_PASSWORD'), 'DB_RUNTIME_PASSWORD_FILE')),
  }
  throwIfAny(problems)
  return config
}

// The migrator hashes this password itself (SCRAM-SHA-256); for printable
// ASCII the normalisation PostgreSQL applies first changes nothing, so the
// stored verifier is exactly the one PostgreSQL would compute.
function printableAscii(value: string, name: string): string {
  if (!/^[\x20-\x7e]+$/.test(value)) {
    throw new ConfigError(`${name} must contain printable ASCII characters only, e.g. the output of openssl rand -hex 24`)
  }
  return value
}

function throwIfAny(problems: string[]): void {
  if (problems.length === 0) return
  const list = problems.map((problem) => '  - ' + problem).join('\n')
  throw new ConfigError(`invalid configuration:\n${list}`)
}

// A postgres:// URL without a password, plus the password from its secret
// file. A password written into the URL would end up wherever the variable
// is visible, so it is refused.
function databaseUrl(env: Env, urlName: string, secretName: string): string {
  const raw = env[urlName]?.trim()
  if (!raw) throw new ConfigError(`${urlName} must be set, e.g. postgres://user@host:5432/database`)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError(`${urlName} is not a URL`)
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new ConfigError(`${urlName} must be a postgres:// URL`)
  }
  if (url.password !== '') {
    throw new ConfigError(`${urlName} must not contain a password; set ${secretName}_FILE instead`)
  }
  // The driver lets query parameters override the URL: ?password= would
  // bypass the secret file, ?user= switch roles, ?options= change session
  // settings, ?host= redirect the connection. Only the TLS mode may be set.
  const extra = [...url.searchParams.keys()].filter((key) => key !== 'sslmode')
  if (extra.length > 0 || url.hash !== '') {
    throw new ConfigError(`${urlName} may carry no query parameters except sslmode, got ${extra.join(', ') || 'a fragment'}`)
  }
  if (url.username === '' || url.pathname.length <= 1) {
    throw new ConfigError(`${urlName} must name a user and a database`)
  }
  try {
    decodeURIComponent(url.username)
    decodeURIComponent(url.pathname)
  } catch {
    throw new ConfigError(`${urlName} contains a malformed percent escape in the user or database name`)
  }
  // Encoded explicitly: the URL setter leaves '%' as it is, so a password
  // containing one would be decoded into something else on connect.
  url.password = encodeURIComponent(readSecret(env, secretName))
  return url.toString()
}

/**
 * A secret is read from the file named by `<NAME>_FILE`, never from `<NAME>`
 * itself: environment values show up in `podman inspect`, process listings
 * and crash dumps, while a read-only mounted file does not. Setting the
 * inline variable is an error rather than something silently ignored.
 */
export function readSecret(env: Env, name: string, readFile = (file: string) => readFileSync(file, 'utf8')): string {
  if (env[name] !== undefined) {
    throw new ConfigError(`${name} must not be set; put the secret in a file and set ${name}_FILE to its path`)
  }
  const file = env[`${name}_FILE`]?.trim()
  if (!file) throw new ConfigError(`${name}_FILE must be set`)
  let value: string
  try {
    value = readFile(file)
  } catch {
    throw new ConfigError(`${name}_FILE: cannot read ${file}`)
  }
  value = value.trim()
  if (value === '') throw new ConfigError(`${name}_FILE: ${file} is empty`)
  return value
}

// The one address everything the app emits or compares derives from: the
// Entra redirect URI, the routes it serves, the cookie paths, the return
// paths of a sign-in, the page it sends and the links on the cards. An
// origin, or an origin with a path where the app runs under a path of a
// shared host; nothing else, since a query, a fragment or credentials
// would make every derived address ambiguous. The path is plain segments
// (no dot segments, no escapes), kept without its trailing slash.
function parsePublicUrl(raw: string | undefined): { url: string, origin: string, basePath: string, loopback: boolean } {
  const value = raw?.trim()
  if (!value) throw new ConfigError('PUBLIC_URL must be set, e.g. https://wahl.example.org, or https://www.example.org/wahl under a path')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfigError(`PUBLIC_URL is not a URL: ${value}`)
  }
  if (url.origin === 'null' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || /[?#]$/.test(value)) {
    throw new ConfigError(`PUBLIC_URL must be an address without query, fragment or credentials, e.g. ${url.protocol}//${url.host}`)
  }
  const basePath = url.pathname.replace(/\/$/, '')
  if (basePath !== '' && !/^(?:\/[A-Za-z0-9_-]+)+$/.test(basePath)) {
    throw new ConfigError(`PUBLIC_URL may end in a path of plain segments such as /wahl, got ${url.pathname}`)
  }
  const loopback = isLoopbackHost(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new ConfigError(`PUBLIC_URL must use https (http only for a loopback address), got ${url.origin}`)
  }
  return { url: `${url.origin}${basePath}`, origin: url.origin, basePath, loopback }
}

// The setting's earlier name, which took the origin alone. A deployment
// that still sets it is told, rather than running with a value it does
// not know it has.
function refuseRenamed(env: Env): void {
  if (env.PUBLIC_ORIGIN !== undefined) {
    throw new ConfigError('PUBLIC_ORIGIN is no longer read; set PUBLIC_URL to the address browsers use, with its path if the app runs under one')
  }
}

/** Whether a host name or address is this machine's: localhost, ::1 or 127.x. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '')
  return host === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.'))
}

function parsePort(raw: string | undefined): number {
  const value = raw?.trim() || '3000'
  const port = Number(value)
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new ConfigError(`PORT must be an integer between 1 and 65535, got ${value}`)
  }
  return port
}

// Fastify would also take `true` or a hop count, which let any client that
// reaches the port claim an arbitrary address and protocol. Only explicit
// addresses and CIDRs are accepted; unset means loopback only.
function parseTrustProxy(raw: string | undefined): string[] {
  const entries = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (entries.length === 0) return loopbackOnly
  const bad = entries.filter((entry) => !isAddressOrCidr(entry))
  if (bad.length > 0) {
    throw new ConfigError(`TRUST_PROXY must list IP addresses or CIDRs separated by commas, got ${bad.join(', ')}`)
  }
  return entries
}

function isAddressOrCidr(entry: string): boolean {
  const [address = '', prefix, ...rest] = entry.split('/')
  const family = isIP(address)
  if (family === 0 || rest.length > 0) return false
  if (prefix === undefined) return true
  return /^\d+$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128)
}

// debug and trace exist for local development only: libraries log more at
// those levels than this application controls. They need both a loopback
// origin and a loopback listening address, so a server anyone else can
// reach, such as a container listening on 0.0.0.0, cannot switch them on,
// whatever its origin says.
function parseLogLevel(raw: string | undefined, local: boolean): LogLevel {
  const value = raw?.trim() || 'info'
  if (value === 'info' || value === 'warn' || value === 'error') return value
  if ((value === 'debug' || value === 'trace') && local) return value
  if (value === 'debug' || value === 'trace') {
    throw new ConfigError(`LOG_LEVEL=${value} is allowed only with a loopback PUBLIC_URL and HOST`)
  }
  throw new ConfigError(`LOG_LEVEL must be info, warn or error, got ${value}`)
}

// DEBUG switches on the `debug` package that some dependencies log through,
// to stderr and past every serializer here. The OAuth client prints its
// token request with it, client secret included, so the same rule as for
// LOG_LEVEL applies.
function refuseDebugNamespaces(raw: string | undefined, local: boolean): void {
  if (raw?.trim() && !local) {
    throw new ConfigError('DEBUG is allowed only with a loopback PUBLIC_URL and HOST; unset it')
  }
}

export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Single tenant: the directory is named by its id. "common",
// "organizations" or a domain name are refused, because the issuer and
// tenant checks of every sign-in compare against exactly this value.
function guid(env: Env, name: string): string {
  const value = env[name]?.trim().toLowerCase()
  if (!value) throw new ConfigError(`${name} must be set to the GUID from the Entra app registration`)
  if (!GUID.test(value)) throw new ConfigError(`${name} must be a GUID such as 00000000-0000-0000-0000-000000000000, got ${value}`)
  return value
}

// A short list, each entry an object id (a GUID) or a school address; the
// comparison at sign-in is in lower case, so the list is kept that way. A
// typo here would quietly grant nobody, so anything else is refused.
const MAX_BOOTSTRAP_ADMINS = 20

export function parseBootstrapAdmins(raw: string | undefined): string[] {
  const entries = (raw ?? '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean)
  if (entries.length > MAX_BOOTSTRAP_ADMINS) {
    throw new ConfigError(`BOOTSTRAP_ADMINS lists ${entries.length} people; at most ${MAX_BOOTSTRAP_ADMINS} are bootstrapped, the rest are granted in the app`)
  }
  const bad = entries.filter((entry) => !GUID.test(entry) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry))
  if (bad.length > 0) {
    throw new ConfigError(`BOOTSTRAP_ADMINS must list Entra object ids or school e-mail addresses separated by commas, got ${bad.join(', ')}`)
  }
  return [...new Set(entries)]
}

/**
 * The mail settings, all or nothing: with SMTP_HOST set, the server, the
 * credentials (SMTP_USER and SMTP_PASSWORD_FILE) and MAIL_FROM are
 * required; without it, mail is off and the outbox only queues.
 */
function parseMail(env: Env): MailConfig | null {
  const host = env.SMTP_HOST?.trim()
  if (!host) {
    // SMTP_PASSWORD_FILE may stay: the unit mounts the file on every host, empty where no mail is sent.
    for (const name of ['SMTP_PORT', 'SMTP_USER', 'MAIL_FROM']) {
      if (env[name]?.trim()) throw new ConfigError(`${name} is set but SMTP_HOST is not; set SMTP_HOST to send mail, or unset the rest`)
    }
    return null
  }
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(host)) throw new ConfigError('SMTP_HOST must be a host name')
  const port = env.SMTP_PORT?.trim() ? Number(env.SMTP_PORT) : 587
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError('SMTP_PORT must be a port number')
  const user = env.SMTP_USER?.trim()
  if (!user) throw new ConfigError('SMTP_USER must be set when SMTP_HOST is')
  const password = printableAscii(readSecret(env, 'SMTP_PASSWORD'), 'SMTP_PASSWORD_FILE')
  const from = env.MAIL_FROM?.trim()
  if (!from || parseMailbox(from) === null) throw new ConfigError('MAIL_FROM must be a mailbox such as "SchulWahl <wahl@schule.example.org>"')
  const replyTo = env.MAIL_REPLY_TO?.trim() || null
  if (replyTo !== null && parseMailbox(replyTo) === null) throw new ConfigError('MAIL_REPLY_TO must be a mailbox')
  const envelopeFrom = env.MAIL_ENVELOPE_FROM?.trim() || null
  const envelope = envelopeFrom === null ? null : parseMailbox(envelopeFrom)
  // A bare address: parsed, and without a display name.
  if (envelopeFrom !== null && (envelope === null || envelope.name !== null)) throw new ConfigError('MAIL_ENVELOPE_FROM must be a bare address')
  return {
    host,
    port,
    secure: flag(env, 'SMTP_SECURE', false),
    requireTls: flag(env, 'SMTP_REQUIRE_TLS', true),
    user,
    password,
    from,
    replyTo,
    envelopeFrom,
  }
}

/** The solver's address: an http or https URL with nothing but an origin and, under a shared host, a path; null when unset. */
function parseSolverUrl(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfigError('SOLVER_URL must be a URL such as http://school-allocation-solver:8000')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ConfigError('SOLVER_URL must use http or https')
  if (url.username || url.password || url.search || url.hash) throw new ConfigError('SOLVER_URL must carry no credentials, query or fragment')
  // A loop, not /\/+$/: V8 retries that pattern from every slash of a run, quadratic in a long one.
  let href = url.href
  while (href.endsWith('/')) href = href.slice(0, -1)
  return href
}

/** `true` or `false`, or the default when unset. */
function flag(env: Env, name: string, fallback: boolean): boolean {
  const value = env[name]?.trim().toLowerCase()
  if (!value) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new ConfigError(`${name} must be true or false`)
}

/** What a refresh asks for unless the deployment says otherwise: the least that lists a group's members with their names and addresses, and what the group picker needs to find groups by name (D-23). */
export const DEFAULT_GRAPH_SCOPES = ['GroupMember.Read.All', 'User.ReadBasic.All', 'Group.Read.All']
const MAX_GRAPH_SCOPES = 5

// Permission names as Graph writes them (Resource.Operation.Scope), a few
// at most; they end up in the authorization URL, so nothing else is taken.
export function parseGraphScopes(raw: string | undefined): string[] {
  const entries = (raw ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
  if (entries.length === 0) return [...DEFAULT_GRAPH_SCOPES]
  if (entries.length > MAX_GRAPH_SCOPES) {
    throw new ConfigError(`GRAPH_DELEGATED_SCOPES lists ${entries.length} permissions; a roster refresh needs at most ${MAX_GRAPH_SCOPES}`)
  }
  const bad = entries.filter((entry) => !/^[A-Za-z]+(?:\.[A-Za-z]+)+$/.test(entry))
  if (bad.length > 0) {
    throw new ConfigError(`GRAPH_DELEGATED_SCOPES must list Microsoft Graph permission names such as GroupMember.Read.All separated by commas, got ${bad.join(', ')}`)
  }
  return [...new Set(entries)]
}

// Build metadata ends up in responses and, later, in stored results, so only
// a short value from a fixed alphabet is taken as it is.
function buildValue(env: Env, name: string, fallback: string, pattern: RegExp, example: string): string {
  const value = env[name]?.trim()
  if (!value) return fallback
  if (!pattern.test(value)) throw new ConfigError(`${name} must be ${example}, got ${value.slice(0, 80)}`)
  return value
}

function sessionSecret(env: Env): Buffer {
  const value = readSecret(env, 'SESSION_KEY')
  if (!/^(?:[0-9a-fA-F]{2}){32,}$/.test(value)) {
    throw new ConfigError('SESSION_KEY_FILE must hold at least 32 random bytes in hex, e.g. the output of openssl rand -hex 32')
  }
  return Buffer.from(value, 'hex')
}
