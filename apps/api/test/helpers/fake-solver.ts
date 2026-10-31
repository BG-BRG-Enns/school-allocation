// A stand-in for the solver (apps/solver): speaks the contract of
// docs/domain-and-api.md §6 over HTTP, answers with a deterministic greedy
// assignment and the level values that assignment really has, so the API's
// validator accepts it; and lets a test replace the answer to see a run
// fail: an infeasible model, an answer off the contract, a tampered pair,
// a solver that is gone.

import { createServer, type Server } from 'node:http'
import { ALLOCATION_CONTRACT, type SolveRequest, type SolveResponse } from '@school-allocation/school-core'

export interface FakeSolver {
  baseUrl: string
  /** Every request received, in order. */
  requests: SolveRequest[]
  /** Replaces the answer: given the request and the greedy answer, returns what to send (a promise delays it). null for the greedy answer. */
  answer: ((request: SolveRequest, computed: SolveResponse) => SolveResponse | Promise<SolveResponse>) | null
  close(): Promise<void>
}

export const FAKE_VERSIONS = { solver: 'fake', ortools: '0.0.0-fake' }

export async function startFakeSolver(): Promise<FakeSolver> {
  const fake: FakeSolver = { baseUrl: '', requests: [], answer: null, close: async () => {} }
  const server: Server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', ortools: FAKE_VERSIONS.ortools, contract: ALLOCATION_CONTRACT }))
      return
    }
    if (req.method !== 'POST' || req.url !== '/v1/solve') {
      res.writeHead(404).end()
      return
    }
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      void (async () => {
        const request = JSON.parse(Buffer.concat(chunks).toString()) as SolveRequest
        fake.requests.push(request)
        const computed = greedySolve(request)
        const answer = fake.answer === null ? computed : await fake.answer(request, computed)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(answer))
      })()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('the fake solver has no port')
  fake.baseUrl = `http://127.0.0.1:${address.port}`
  let closed = false
  fake.close = () => new Promise<void>((resolve, reject) => {
    if (closed) {
      resolve()
      return
    }
    closed = true
    server.closeAllConnections()
    server.close((err) => (err ? reject(err) : resolve()))
  })
  return fake
}

/** The options with a place by wish number (the cost per minute) and then the longer first, day by day, fixed pairs first, then the cheapest options toward each rule still open; a cancellable item below its minimum is cancelled and its takers lose it. */
export function greedySolve(request: SolveRequest): SolveResponse {
  const remaining = new Map(request.items.map((item) => [item.o, item.max]))
  const conflicts = new Set(request.conflicts.map(([a, b]) => `${Math.min(a, b)}:${Math.max(a, b)}`))
  const clash = (a: number, b: number) => conflicts.has(`${Math.min(a, b)}:${Math.max(a, b)}`)
  const assign = new Set<string>()
  const key = (s: number, o: number) => `${s}:${o}`
  for (const [s, o] of request.fixed) {
    assign.add(key(s, o))
    remaining.set(o, (remaining.get(o) ?? 0) - 1)
  }
  for (const student of [...request.students].sort((a, b) => a.s - b.s)) {
    const taken = request.fixed.filter(([s]) => s === student.s).map(([, o]) => o)
    const covered = new Map<number, number>()
    for (const o of taken) for (const c of student.options.find((op) => op.o === o)?.credit ?? []) covered.set(c.d, (covered.get(c.d) ?? 0) + c.min)
    for (const day of [...student.required].sort((a, b) => a.d - b.d)) {
      const minutes = (op: SolveRequest['students'][number]['options'][number]) => op.credit.reduce((sum, c) => sum + c.min, 0)
      for (const option of [...student.options].sort((a, b) => (a.cost / Math.max(1, minutes(a))) - (b.cost / Math.max(1, minutes(b))) || minutes(b) - minutes(a) || a.o - b.o)) {
        if ((covered.get(day.d) ?? 0) >= day.min) break
        if (taken.includes(option.o) || (remaining.get(option.o) ?? 0) <= 0 || !option.credit.some((c) => c.d === day.d && c.min > 0)) continue
        if (taken.some((t) => clash(t, option.o))) continue
        taken.push(option.o)
        remaining.set(option.o, (remaining.get(option.o) ?? 0) - 1)
        for (const c of option.credit) covered.set(c.d, (covered.get(c.d) ?? 0) + c.min)
        assign.add(key(student.s, option.o))
      }
    }
    for (const rule of student.rules) {
      let have = rule.amounts.filter((a) => taken.includes(a.o)).reduce((sum, a) => sum + a.n, 0)
      const cost = (o: number) => student.options.find((op) => op.o === o)?.cost ?? 0
      for (const amount of [...rule.amounts].sort((a, b) => cost(a.o) - cost(b.o) || a.o - b.o)) {
        if (have >= rule.need) break
        if (taken.includes(amount.o) || (remaining.get(amount.o) ?? 0) <= 0 || taken.some((t) => clash(t, amount.o))) continue
        taken.push(amount.o)
        remaining.set(amount.o, (remaining.get(amount.o) ?? 0) - 1)
        assign.add(key(student.s, amount.o))
        have += amount.n
      }
    }
  }
  const cancelled: number[] = []
  for (const item of request.items) {
    const takers = request.students.filter((st) => assign.has(key(st.s, item.o))).length
    if (item.cancellable && item.min > 0 && takers < item.min) {
      cancelled.push(item.o)
      for (const st of request.students) assign.delete(key(st.s, item.o))
    }
  }
  const pairs = [...assign].map((k) => k.split(':').map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return { status: 'OPTIMAL', levels: request.levels.map((name) => ({ name, value: evaluate(request, name, assign), proven: true })), assign: pairs, cancelled: cancelled.sort((a, b) => a - b), versions: FAKE_VERSIONS }
}

/** A level's value on an assignment, as school-core recomputes it. */
function evaluate(request: SolveRequest, name: string, assign: ReadonlySet<string>): number {
  const costOf = (s: number) => request.students.find((st) => st.s === s)?.options.filter((op) => assign.has(`${s}:${op.o}`)).reduce((sum, op) => sum + op.cost, 0) ?? 0
  const deficits = (student: SolveRequest['students'][number]) => student.required.map((day) => {
    const covered = student.options.filter((op) => assign.has(`${student.s}:${op.o}`)).reduce((sum, op) => sum + (op.credit.find((c) => c.d === day.d)?.min ?? 0), 0)
    return Math.max(0, day.min - covered)
  })
  if (name === 'students_with_deficit') return request.students.filter((st) => deficits(st).some((d) => d > 0)).length
  if (name === 'deficit_minutes') return request.students.reduce((sum, st) => sum + deficits(st).reduce((a, b) => a + b, 0), 0)
  const ruleMissing = (student: SolveRequest['students'][number]) => student.rules.map((rule) => ({ unit: rule.unit, missing: Math.max(0, rule.need - rule.amounts.filter((a) => assign.has(`${student.s}:${a.o}`)).reduce((sum, a) => sum + a.n, 0)) }))
  if (name === 'students_missing_rule') return request.students.filter((st) => ruleMissing(st).some((r) => r.missing > 0)).length
  if (name === 'rule_missing_items' || name === 'rule_missing_minutes') {
    const unit = name === 'rule_missing_items' ? 'items' : 'minutes'
    return request.students.reduce((sum, st) => sum + ruleMissing(st).filter((r) => r.unit === unit).reduce((a, r) => a + r.missing, 0), 0)
  }
  if (name === 'total_cost') return request.students.reduce((sum, st) => sum + costOf(st.s), 0)
  if (name === 'tiebreak') return request.students.reduce((sum, st) => sum + st.options.filter((op) => assign.has(`${st.s}:${op.o}`)).reduce((a, op) => a + op.tie, 0), 0)
  // A threshold is an average rank: Σ rank · minutes · 1000 > t · norm, exactly, as the compiler and the validator count it; a student with no minutes to cover (only a rule) has none.
  const threshold = Number(name.slice('over:'.length))
  return request.students.filter((st) => st.norm > 0).filter((st) => st.options.filter((op) => assign.has(`${st.s}:${op.o}`)).reduce((sum, op) => sum + op.weight, 0) * 1000 > threshold * st.norm).length
}
