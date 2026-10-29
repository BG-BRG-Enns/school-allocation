// The solver over HTTP (docs/domain-and-api.md §6): one operation, one
// health check, on the internal network. The answer is checked against the
// contract's schema before the caller sees it, so a solver that drifts
// from the contract is a refusal with a reason, not a stored result. A
// solve may take minutes; the wall-clock limit here is for a solver that
// is gone, not a bound on the solving, which the request's deterministic
// limit gives.

import { SolveResponseSchema } from '@school-allocation/api-contracts/allocation'
import type { SolveRequest, SolveResponse } from '@school-allocation/school-core'
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
  /** How long a solve may take on the wire before the solver counts as gone. */
  timeoutMs?: number
  fetch?: typeof fetch
}

/** A client for the solver at `baseUrl` (an origin, no trailing slash). */
export function createSolverClient(baseUrl: string, options: SolverClientOptions = {}): SolverClient {
  const timeoutMs = options.timeoutMs ?? 15 * 60_000
  const doFetch = options.fetch ?? fetch
  const call = async (path: string, init: RequestInit, timeout: number): Promise<unknown> => {
    let response: Response
    try {
      response = await doFetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeout) })
    } catch (err) {
      throw new SolverError('solver_unreachable', `${(err as Error).name}: the solver at ${baseUrl} did not answer`)
    }
    if (!response.ok) throw new SolverError('solver_unreachable', `the solver answered ${response.status}`)
    try {
      return await response.json()
    } catch {
      throw new SolverError('solver_answer_invalid', 'the solver did not answer JSON')
    }
  }
  return {
    async health() {
      const body = await call('/health', { method: 'GET', headers: { accept: 'application/json' } }, 10_000)
      if (typeof body !== 'object' || body === null || typeof (body as { ortools?: unknown }).ortools !== 'string' || typeof (body as { contract?: unknown }).contract !== 'string') {
        throw new SolverError('solver_answer_invalid', 'the health answer names no solver')
      }
      const { ortools, contract } = body as SolverHealth
      return { ortools, contract }
    },
    async solve(request) {
      const body = await call('/v1/solve', { method: 'POST', headers: { 'accept': 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(request) }, timeoutMs)
      if (!Value.Check(SolveResponseSchema, body)) {
        const first = [...Value.Errors(SolveResponseSchema, body)][0]
        throw new SolverError('solver_answer_invalid', `the answer does not follow the contract: ${first?.message ?? 'unknown problem'}`)
      }
      return body
    },
  }
}
