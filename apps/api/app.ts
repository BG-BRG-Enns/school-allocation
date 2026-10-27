import { existsSync } from 'node:fs'
import type { Writable } from 'node:stream'
import Fastify, { LogController, type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest, type RouteOptions } from 'fastify'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import { CORE_VERSION } from '@school-allocation/school-core'
import type { Config } from './config.ts'
import { createGuards } from './lib/auth.ts'
import type { Database } from './lib/db.ts'
import { isBusy } from './lib/jobs.ts'
import { ErrorResponse, HealthResponse } from './lib/schemas/common.ts'
import { pathOf } from './lib/url.ts'
import { loadWebIndex, sendWebIndex } from './lib/web-index.ts'
import { applyHardening } from './plugins/hardening.ts'
import { registerSessions } from './plugins/session.ts'
import { adminRosterRoutes } from './routes/admin-roster.ts'
import { adminUsersRoutes } from './routes/admin-users.ts'
import { authRoutes } from './routes/auth.ts'

export interface AppOptions {
  db: Database
  /** Where log lines go; tests capture them. Defaults to stdout. */
  logStream?: Writable
  /** Where Entra ID is reached. Tests point it at a local stand-in; it is not configurable. */
  entraAuthority?: string
  /** Where Microsoft Graph is reached. Tests point it at a local stand-in; it is not configurable. */
  graphBaseUrl?: string
  /** Called with every route as it is registered; tests list them. */
  onRoute?: (route: RouteOptions) => void
}

export async function buildApp(config: Config, options: AppOptions): Promise<FastifyInstance> {
  const { db } = options
  const app = Fastify({
    logger: {
      level: config.logLevel,
      serializers: {
        // What a log line may say about a request: its method and path. Not
        // the query string, not the client address or port, not headers, not
        // the body: those carry names, choices and tokens.
        req: (req: FastifyRequest) => ({ method: req.method, path: pathOf(req.url) }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        // An error is logged by type, code (e.g. a database SQLSTATE) and
        // stack frames, at every log level. Its message is not: exception
        // text can quote a name or a database value, and database errors
        // also carry `detail` and parameters, which are dropped too.
        err: (err: FastifyError) => ({
          type: err.name,
          message: '[not logged]',
          code: typeof err.code === 'string' ? err.code : undefined,
          stack: stackFrames(err),
        }),
      },
      ...(options.logStream ? { stream: options.logStream } : {}),
    },
    // No per-request lines: method, URL, client address and timestamp per
    // request would be a record of who looked at what and when, which the
    // application has no use for. Failures are still logged by the error
    // handler below.
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: config.trustProxy,
    // Rankings, catalogue entries and administrative payloads are small;
    // refuse anything large early. A route that takes a file (a CSV roster,
    // later) declares a larger limit of its own.
    bodyLimit: 64 * 1024,
    // Strict validation: unknown properties are an error rather than being
    // stripped, and "1" is not quietly turned into 1.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
  })

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ['\'self\''],
        baseUri: ['\'none\''],
        objectSrc: ['\'none\''],
        frameAncestors: ['\'none\''],
        formAction: ['\'self\''],
        imgSrc: ['\'self\'', 'data:'],
      },
    },
  })

  // Production-safe errors: a 4xx says what was wrong with the request only
  // for schema validation, whose messages name fields, never values. Other
  // client errors (an unparsable body, for instance, whose parser message
  // quotes the body) get their code alone. A 5xx is logged and answered with
  // a fixed body, so no stack trace or database message reaches a client.
  app.setErrorHandler((err: FastifyError, request, reply) => {
    const status = err.statusCode !== undefined && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500
    if (status >= 500) {
      request.log.error({ err, req: request }, 'request failed')
      return reply.code(status).send({ error: 'internal_error' })
    }
    const body: { error: string, message?: string } = { error: err.code ?? 'bad_request' }
    if (err.validation) body.message = err.message
    return reply.code(status).send(body)
  })

  if (options.onRoute) app.addHook('onRoute', options.onRoute)

  const webDist = existsSync(config.webDistDir) ? config.webDistDir : undefined
  // The page every page path gets, told the base path (lib/web-index.ts).
  const webIndex = webDist === undefined ? undefined : await loadWebIndex(webDist, config.basePath)
  // Hooks before routes: a plugin context inherits only the hooks that
  // exist when it is registered, and the sign-in routes are one.
  applyHardening(app, config, { webIndex })
  // Every route under the base path: at the root of a host there is none.
  const under = config.basePath === '' ? {} : { prefix: config.basePath }
  await registerSessions(app, config)
  const guards = createGuards(db)
  await app.register(authRoutes, { config, db, entraAuthority: options.entraAuthority, ...under })
  await app.register(adminRosterRoutes, { config, db, guards, entraAuthority: options.entraAuthority, graphBaseUrl: options.graphBaseUrl, ...under })
  await app.register(adminUsersRoutes, { db, guards, ...under })

  // The health check also says whether a job is executing: the
  // deployment's nightly update asks it and stays away while one does
  // (deploy/not-busy.sh). The answer names nothing and nobody.
  app.get(`${config.basePath}/api/health`, { schema: { response: { '200': HealthResponse, '503': HealthResponse, '4xx': ErrorResponse } } }, async (_request, reply) => {
    const { version, gitSha } = config.build
    try {
      const busy = await isBusy(db)
      return { status: 'ok' as const, db: 'up' as const, busy, version, gitSha, coreVersion: CORE_VERSION }
    } catch (err) {
      reply.log.warn({ err }, 'health: database unreachable')
      return reply.code(503).send({ status: 'degraded', db: 'down', busy: false, version, gitSha, coreVersion: CORE_VERSION })
    }
  })

  if (webDist && webIndex !== undefined) {
    // The app's start page, with and without the trailing slash; every
    // other page path gets the same page from the not-found handler
    // (plugins/hardening.ts). The static plugin serves the build's files
    // alone: its own index handling would send the page as built, not
    // told its base path.
    const page = (_request: FastifyRequest, reply: FastifyReply) => sendWebIndex(reply, webIndex)
    app.get(`${config.basePath}/`, page)
    if (config.basePath !== '') app.get(config.basePath, page)
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: `${config.basePath}/`,
      index: false,
      // Vite fingerprints everything under assets/, so those can be cached
      // for good; index.html must be revalidated so a deploy takes effect.
      setHeaders(reply, filePath) {
        reply.header('cache-control', filePath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    })
  }

  return app
}

/**
 * The frames of a stack trace without the message. V8 starts the stack with
 * `Name: message`, and the message may span lines that look like frames, so
 * that exact header is cut off first. A stack that does not start with it
 * (the message was changed after the error was created) is dropped whole.
 */
function stackFrames(err: Error): string {
  const stack = err.stack ?? ''
  const header = err.message === '' ? err.name : `${err.name}: ${err.message}`
  if (!stack.startsWith(header)) return ''
  return stack.slice(header.length).split('\n').filter((line) => /^\s+at /.test(line)).join('\n')
}
