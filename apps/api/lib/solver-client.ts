// The solver over HTTP (docs/domain-and-api.md §6): one operation, one
// health check, on the internal network. The answer is checked against the
// contract's schema before the caller sees it, so a solver that drifts
// from the contract is a refusal with a reason, not a stored result. A
// solve may take minutes and answers only when it is through; the one
// wall-clock bound here covers the whole exchange and is for a solver that
// is gone, not a bound on the solving, which the request's deterministic
// limit gives. node:http rather than fetch, whose transport gives up on
// headers after five minutes whatever the signal says.

import { SolveResponseSchema } from '@school-allocation/api-contracts/allocation'
import type { SolveRequest, SolveResponse } from '@school-allocation/school-core'
import http from 'node:http'
import https from 'node:https'
import { Value } from 'typebox/value'

export type SolverErrorCode = 'solver_unreachable' | 'solver_answer_invalid'

export class SolverError extends Error {
  override name = 'SolverError'
  readonly code: SolverErrorCode
  constructor(code: SolverErrorCode, detail: string) {
    super(detail)
    this.code = code
  }
}

export interface SolverHealth {
  ortools: string
  contract: string
}

export interface SolverClient {
  health(): Promise<SolverHealth>
  solve(request: SolveRequest): Promise<SolveResponse>
}

export interface SolverClientOptions {
  /** The least a solve may take before the solver counts as gone; a request with more levels or a higher limit gets more (solveTimeoutMs). */
  timeoutMs?: number
}

/** A deterministic second has taken up to seven wall-clock seconds on a small machine; thirty leave room, per level and deterministic second, plus a start-up minute. */
const WALL_MS_PER_DETERMINISTIC_SECOND = 30_000

/** The bound of one solve: what the request permits the solver, generously, never less than the client's floor. */
export function solveTimeoutMs(request: SolveRequest, floorMs: number): number {
  return Math.max(floorMs, request.levels.length * request.limits.deterministicTimePerLevel * WALL_MS_PER_DETERMINISTIC_SECOND + 60_000)
}

/** One request to the solver, the body read whole, bounded in time; the status and the parsed body, or why not. */
function exchange(url: URL, method: 'GET' | 'POST', payload: string | undefined, timeoutMs: number): Promise<{ status: number, body: unknown }> {
  return new Promise((resolve, reject) => {
    const gone = (detail: string) => reject(new SolverError('solver_unreachable', `${detail}: the solver at ${url.origin} did not answer`))
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method,
      headers: { accept: 'application/json', ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }) },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('error', (err) => gone(err.name))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        try {
          resolve({ status: response.statusCode ?? 0, body: text === '' ? undefined : JSON.parse(text) as unknown })
        } catch {
          reject(new SolverError('solver_answer_invalid', 'the solver did not answer JSON'))
        }
      })
    })
    const timer = setTimeout(() => {
      request.destroy(new Error('timeout'))
    }, timeoutMs)
    timer.unref()
    request.on('error', (err) => gone(err.message === 'timeout' ? 'timeout' : err.name))
    request.on('close', () => clearTimeout(timer))
    request.end(payload)
  })
}

/** A client for the solver at `baseUrl` (an origin, no trailing slash). */
export function createSolverClient(baseUrl: string, options: SolverClientOptions = {}): SolverClient {
  const timeoutMs = options.timeoutMs ?? 15 * 60_000
  const call = async (path: string, method: 'GET' | 'POST', payload: string | undefined, timeout: number): Promise<unknown> => {
    const { status, body } = await exchange(new URL(`${baseUrl}${path}`), method, payload, timeout)
    if (status < 200 || status >= 300) throw new SolverError('solver_unreachable', `the solver answered ${status}`)
    return body
  }
  return {
    async health() {
      const body = await call('/health', 'GET', undefined, 10_000)
      if (typeof body !== 'object' || body === null || typeof (body as { ortools?: unknown }).ortools !== 'string' || typeof (body as { contract?: unknown }).contract !== 'string') {
        throw new SolverError('solver_answer_invalid', 'the health answer names no solver')
      }
      const { ortools, contract } = body as SolverHealth
      return { ortools, contract }
    },
    async solve(request) {
      const body = await call('/v1/solve', 'POST', JSON.stringify(request), solveTimeoutMs(request, timeoutMs))
      if (!Value.Check(SolveResponseSchema, body)) {
        const first = [...Value.Errors(SolveResponseSchema, body)][0]
        throw new SolverError('solver_answer_invalid', `the answer does not follow the contract: ${first?.message ?? 'unknown problem'}`)
      }
      return body
    },
  }
}
