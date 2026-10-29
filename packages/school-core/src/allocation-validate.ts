// The independent validation (docs/domain-and-api.md §5): before a run is
// stored as reviewable, its result is checked against the rules the solver
// was asked to keep, and every level value is recomputed from the
// assignment. The solver's word is not taken for anything: a result the
// validator refuses is never published (SECURITY.md). Pure; it recompiles
// the input, so it needs nothing the API knows.

import { COST_SCALE, type AllocationInput, type AllocationResult, type Assignment, type LevelValue, type Pass, type PassResult } from './allocation-model.ts'
import { compilePass, fixedOverlaps, itemsOverlap, mayBeCancelled, solverMinimum, type CompiledPass, type PreparedStudent } from './allocation-compile.ts'
import { overlaps } from './catalogue.ts'

export const ALLOCATION_PROBLEM_CODES = [
  'pass_not_solved',
  'levels_unexpected',
  'level_mismatch',
  'not_in_pass',
  'unknown_item',
  'assigned_twice',
  'not_an_option',
  'paid_fallback',
  'cancelled_not_cancellable',
  'assigned_to_cancelled',
  'capacity_exceeded',
  'below_minimum',
  'overlap',
  'overlaps_fixed',
  'first_pass_changed',
  'pre_assignment_missing',
  'pre_assignment_changed',
  'assignment_mismatch',
] as const
export type AllocationProblemCode = typeof ALLOCATION_PROBLEM_CODES[number]

export interface AllocationProblem {
  code: AllocationProblemCode
  pass?: Pass
  personId?: string
  itemId?: string
  level?: string
  reported?: number
  recomputed?: number
}

const byText = (a: string, b: string) => a.localeCompare(b, 'en')
const pairKey = (personId: string, itemId: string) => `${personId}\u0000${itemId}`

/** The items either pass cancelled, once each, in id order. */
export function cancelledOf(result: AllocationResult): string[] {
  return [...new Set(result.passes.flatMap((p) => p.cancelled))].sort(byText)
}

/**
 * The level values a pass's assignment actually has, by the same counting
 * the solver was asked for: over the students of the pass, with the
 * options the request carried for them.
 */
export function recomputeLevels(compiled: CompiledPass, pairs: readonly [string, string][]): LevelValue[] {
  const assigned = new Map<string, Set<string>>()
  for (const [personId, itemId] of pairs) {
    const set = assigned.get(personId) ?? new Set()
    set.add(itemId)
    assigned.set(personId, set)
  }
  let withDeficit = 0
  let deficitMinutes = 0
  let totalCost = 0
  let tiebreak = 0
  /** Per student: the exact minutes-weighted rank sum and the minutes it is measured against. */
  const weights: [number, number][] = []
  for (const p of compiled.students) {
    const mine = assigned.get(p.student.personId) ?? new Set()
    const options = p.options.filter((o) => mine.has(o.itemId))
    let deficit = 0
    for (const [date, required] of p.required) {
      const covered = options.reduce((sum, o) => sum + (o.credit.get(date) ?? 0), 0)
      deficit += Math.max(0, required - covered)
    }
    if (deficit > 0) withDeficit += 1
    deficitMinutes += deficit
    const cost = options.reduce((sum, o) => sum + o.cost, 0)
    weights.push([options.reduce((sum, o) => sum + o.weight, 0), p.requiredTotal])
    totalCost += cost
    tiebreak += options.reduce((sum, o) => sum + o.tie, 0)
  }
  return compiled.request.levels.map((name) => {
    let value: number
    if (name === 'students_with_deficit') value = withDeficit
    else if (name === 'deficit_minutes') value = deficitMinutes
    else if (name === 'total_cost') value = totalCost
    else if (name === 'tiebreak') value = tiebreak
    else {
      // `over:3000` is an average rank over 3: Σ rank · minutes > 3 · norm, in whole numbers.
      const threshold = Number(name.slice('over:'.length))
      value = weights.filter(([weight, norm]) => weight * COST_SCALE > threshold * norm).length
    }
    return { name, value, proven: true }
  })
}

function validatePass(input: AllocationInput, compiled: CompiledPass, result: PassResult, previous: PassResult | undefined, problems: AllocationProblem[]): void {
  const pass = compiled.pass
  if (result.status !== 'OPTIMAL' && result.status !== 'FEASIBLE') {
    problems.push({ code: 'pass_not_solved', pass })
    return
  }
  if (result.levels.map((l) => l.name).join(',') !== compiled.request.levels.join(',')) problems.push({ code: 'levels_unexpected', pass })
  const students = new Map(compiled.students.map((p) => [p.student.personId, p]))
  const items = new Map(input.items.map((item) => [item.id, item]))
  const solverItems = new Set(compiled.itemIds)
  const cancelled = new Set(result.cancelled)
  for (const itemId of result.cancelled) {
    const item = items.get(itemId)
    if (!item || !solverItems.has(itemId)) {
      problems.push({ code: 'unknown_item', pass, itemId })
      continue
    }
    if (!mayBeCancelled(item.rules)) problems.push({ code: 'cancelled_not_cancellable', pass, itemId })
  }
  const seen = new Set<string>()
  const perItem = new Map<string, number>()
  const perStudent = new Map<string, string[]>()
  for (const [personId, itemId] of result.assign) {
    const student = students.get(personId)
    if (!student) {
      problems.push({ code: 'not_in_pass', pass, personId })
      continue
    }
    if (!solverItems.has(itemId)) {
      problems.push({ code: 'unknown_item', pass, personId, itemId })
      continue
    }
    const key = pairKey(personId, itemId)
    if (seen.has(key)) {
      problems.push({ code: 'assigned_twice', pass, personId, itemId })
      continue
    }
    seen.add(key)
    const option = student.options.find((o) => o.itemId === itemId)
    if (!option) {
      problems.push({ code: 'not_an_option', pass, personId, itemId })
      continue
    }
    if (option.kind === 'fallback' && (items.get(itemId)?.feeCents ?? 0) !== 0) problems.push({ code: 'paid_fallback', pass, personId, itemId })
    if (cancelled.has(itemId)) problems.push({ code: 'assigned_to_cancelled', pass, personId, itemId })
    perItem.set(itemId, (perItem.get(itemId) ?? 0) + 1)
    const list = perStudent.get(personId) ?? []
    list.push(itemId)
    perStudent.set(personId, list)
  }
  for (const itemId of compiled.itemIds) {
    const item = items.get(itemId)
    if (!item) continue
    const count = perItem.get(itemId) ?? 0
    if (count > item.rules.places) problems.push({ code: 'capacity_exceeded', pass, itemId, reported: count, recomputed: item.rules.places })
    const minimum = solverMinimum(item.rules)
    if (!cancelled.has(itemId) && count < minimum) problems.push({ code: 'below_minimum', pass, itemId, reported: count, recomputed: minimum })
  }
  for (const [personId, itemIds] of perStudent) {
    const student = students.get(personId) as PreparedStudent
    const mine = itemIds.map((id) => items.get(id)).filter((item) => item !== undefined)
    for (let a = 0; a < mine.length; a++) {
      const itemA = mine[a]
      if (!itemA) continue
      for (let b = a + 1; b < mine.length; b++) {
        const itemB = mine[b]
        if (itemB && itemsOverlap(itemA, itemB)) problems.push({ code: 'overlap', pass, personId, itemId: itemB.id })
      }
      if (itemA.sessions.some((s) => student.fixedSpans.some((f) => overlaps(s, f)))) problems.push({ code: 'overlaps_fixed', pass, personId, itemId: itemA.id })
    }
  }
  if (pass === 2 && previous) {
    const before = new Map<string, Set<string>>()
    for (const [personId, itemId] of previous.assign) {
      const set = before.get(personId) ?? new Set()
      set.add(itemId)
      before.set(personId, set)
    }
    for (const p of compiled.students) {
      if (p.student.savedIn !== 'first') continue
      const was = [...(before.get(p.student.personId) ?? [])].sort(byText)
      const is = (perStudent.get(p.student.personId) ?? []).slice().sort(byText)
      if (was.join(',') !== is.join(',')) problems.push({ code: 'first_pass_changed', pass, personId: p.student.personId })
    }
  }
  const reported = new Map(result.levels.map((l) => [l.name, l.value]))
  for (const level of recomputeLevels(compiled, result.assign)) {
    const value = reported.get(level.name)
    if (value !== level.value) problems.push({ code: 'level_mismatch', pass, level: level.name, reported: value, recomputed: level.value })
  }
}

/**
 * The assignment rows of a result: the pre-assignments as `fixed`, then
 * each pass's pairs with the wish number the compiled option had. Only
 * meaningful for a result validateAllocation accepted; an unknown pair is
 * left out rather than invented.
 */
export function assembleAssignments(input: AllocationInput, result: AllocationResult): Assignment[] {
  const rows: Assignment[] = []
  for (const student of [...input.students].sort((a, b) => byText(a.personId, b.personId))) {
    for (const itemId of [...student.fixedItemIds].sort(byText)) rows.push({ personId: student.personId, itemId, source: 'fixed', pass: null, rank: null })
  }
  const first = compilePass(input, 1, 'validate')
  const second = compilePass(input, 2, 'validate', result.passes[0])
  const firstStudents = new Set(first.students.map((p) => p.student.personId))
  for (const [compiled, pairs] of [[first, result.passes[0].assign], [second, result.passes[1].assign]] as const) {
    const students = new Map(compiled.students.map((p) => [p.student.personId, p]))
    for (const [personId, itemId] of [...pairs].sort((a, b) => byText(a[0], b[0]) || byText(a[1], b[1]))) {
      // A first-pass student's pairs come back in the second pass as fixed; they are the first pass's rows.
      if (compiled.pass === 2 && firstStudents.has(personId)) continue
      const option = students.get(personId)?.options.find((o) => o.itemId === itemId)
      if (!option) continue
      rows.push({ personId, itemId, source: option.kind, pass: compiled.pass, rank: option.kind === 'wish' ? option.rank : null })
    }
  }
  return rows
}

/**
 * Every problem of a result; empty means the run may be stored as
 * reviewable. With `assignments`, the rows the API stored (or is about to)
 * are checked to be exactly the result's: every pre-assignment present and
 * unchanged, nothing else added.
 */
export function validateAllocation(input: AllocationInput, result: AllocationResult, assignments?: readonly Assignment[]): AllocationProblem[] {
  const problems: AllocationProblem[] = []
  // The pre-assignments themselves: two class activities at the same time are no result anyone may publish.
  for (const student of input.students) {
    for (const [, b] of fixedOverlaps(input, student)) problems.push({ code: 'overlaps_fixed', personId: student.personId, itemId: b })
  }
  const first = compilePass(input, 1, 'validate')
  validatePass(input, first, result.passes[0], undefined, problems)
  if (result.passes[0].status === 'OPTIMAL' || result.passes[0].status === 'FEASIBLE') {
    const second = compilePass(input, 2, 'validate', result.passes[0])
    validatePass(input, second, result.passes[1], result.passes[0], problems)
  }
  if (assignments !== undefined && problems.length === 0) {
    const expected = assembleAssignments(input, result)
    // Row for row, counted: a row twice is as wrong as a row too many.
    const key = (a: Assignment) => `${a.personId}\u0000${a.itemId}\u0000${a.source}\u0000${a.pass ?? ''}\u0000${a.rank ?? ''}`
    const count = (rows: readonly Assignment[]) => {
      const counts = new Map<string, number>()
      for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1)
      return counts
    }
    const stored = count(assignments)
    const wanted = count(expected)
    for (const row of expected) {
      if ((stored.get(key(row)) ?? 0) < 1) problems.push({ code: row.source === 'fixed' ? 'pre_assignment_missing' : 'assignment_mismatch', personId: row.personId, itemId: row.itemId })
    }
    const reported = new Set<string>()
    for (const row of assignments) {
      const k = key(row)
      if ((stored.get(k) ?? 0) > (wanted.get(k) ?? 0) && !reported.has(k)) {
        reported.add(k)
        problems.push({ code: row.source === 'fixed' ? 'pre_assignment_changed' : 'assignment_mismatch', personId: row.personId, itemId: row.itemId })
      }
    }
  }
  return problems
}

/** The cost threshold a level name carries, for the review's wording; undefined for the other levels. */
export function thresholdOf(level: string): number | undefined {
  return level.startsWith('over:') ? Number(level.slice('over:'.length)) / COST_SCALE : undefined
}
