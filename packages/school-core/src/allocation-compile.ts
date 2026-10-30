// The model compiler (docs/domain-and-api.md §5–§6, D-05, D-06, D-20,
// D-24): from a run's frozen input to the request the solver gets, for
// each of the two passes. Pre-assignments are resolved here: a student's
// fixed credit is taken off each day's requirement, items overlapping a
// fixed item are not options, and a student with nothing left to cover
// has no variables. Fallback options (fee-free items on a day still
// uncovered, at rank cap + 1) are ordinary options with a higher cost;
// the solver does not know the difference. Pure, and deterministic down
// to the order of every list, so the same input gives the same request.

import { creditedMinutesByDate, overlaps, type ItemRules, type Span } from './catalogue.ts'
import { offeredTo, timeGroupsOf, type OfferableItem } from './choices.ts'
import {
  ALLOCATION_CONTRACT,
  COST_SCALE,
  levelNames,
  tieWeight,
  type AllocationInput,
  type AllocationItem,
  type AllocationStudent,
  type DayMinutes,
  type Pass,
  type PassResult,
  type SolveRequest,
  type SolveStudent,
} from './allocation-model.ts'

export type OptionKind = 'wish' | 'fallback'

/** An item a student may be assigned, as the solver sees it and as the validator and the explanation read it back. */
export interface CompiledOption {
  itemId: string
  kind: OptionKind
  /** The 1-based wish number within the item's time group; cap + 1 for a fallback. */
  rank: number
  /** The item's credited minutes over the project days. */
  minutes: number
  cost: number
  /** `rank · minutes`, exact. */
  weight: number
  tie: number
  /** Date → the minutes the item credits that day. */
  credit: Map<string, number>
}

export interface PreparedStudent {
  student: AllocationStudent
  /** Date → the minutes still needed after the fixed items; days with nothing left are left out. */
  required: Map<string, number>
  requiredTotal: number
  fixedSpans: Pick<Span, 'startMs' | 'endMs'>[]
  options: CompiledOption[]
}

export interface CompiledPass {
  pass: Pass
  request: SolveRequest
  /** Index `s` → person id. */
  personIds: string[]
  /** Index `o` → item id. */
  itemIds: string[]
  /** The students of the pass in index order, each with exactly the options the request carries for them. */
  students: PreparedStudent[]
  /** Items the first pass cancelled, which the second never offers (an item cancelled stays cancelled). */
  dropped: string[]
}

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id, 'en')
const byText = (a: string, b: string) => a.localeCompare(b, 'en')

/** The items the solver gets variables for: approved items with places to rank, minus the ones cancelled before. */
export function solverItems(input: AllocationInput, cancelled: ReadonlySet<string>): AllocationItem[] {
  return input.items.filter((item) => item.rules.places > 0 && !cancelled.has(item.id)).sort(byId)
}

/** Whether the solver may decide not to run an item (D-08): it says so, it is nobody's class activity, and it has a minimum to fall below. */
export function mayBeCancelled(rules: Pick<ItemRules, 'cancellableBelowMin' | 'fixedClasses' | 'minParticipants'>): boolean {
  return rules.cancellableBelowMin && rules.fixedClasses.length === 0 && rules.minParticipants > 0
}

/** The minimum the solver holds an item to: none for a class activity, which its classes carry. */
export function solverMinimum(rules: Pick<ItemRules, 'fixedClasses' | 'minParticipants'>): number {
  return rules.fixedClasses.length > 0 ? 0 : rules.minParticipants
}

/**
 * A student's requirement per day and their options against `items`, the
 * whole catalogue's offer to them. Wish numbers are counted over the list
 * as the student saved it; an item `cancelled` since is then left out, so
 * a second wish stays the second wish when the first is gone.
 */
export function prepareStudent(input: AllocationInput, student: AllocationStudent, items: readonly AllocationItem[], cancelled: ReadonlySet<string> = new Set()): PreparedStudent {
  const all = new Map(input.items.map((item) => [item.id, item]))
  const fixed = student.fixedItemIds.map((id) => all.get(id)).filter((item): item is AllocationItem => item !== undefined)
  const fixedSpans = fixed.flatMap((item) => item.sessions.map((s) => ({ startMs: s.startMs, endMs: s.endMs })))
  const fixedCredit = creditedMinutesByDate(fixed.flatMap((item) => item.sessions))
  const minimum = input.dailyMinimum[String(student.grade)] ?? 0
  const required = new Map<string, number>()
  for (const date of input.projectDays) {
    const left = Math.max(0, minimum - (fixedCredit.get(date) ?? 0))
    if (left > 0) required.set(date, left)
  }
  const requiredTotal = [...required.values()].reduce((sum, minutes) => sum + minutes, 0)
  const fixedIds = new Set(student.fixedItemIds)
  const offerable: OfferableItem[] = items.filter((item) => !fixedIds.has(item.id)).map((item) => ({ id: item.id, sessions: item.sessions, rules: item.rules }))
  const offered = offeredTo({ className: student.className, grade: student.grade }, offerable, fixedSpans)
  const offeredById = new Map(items.map((item) => [item.id, item]))
  const cap = input.wishesPerGroup
  const options: CompiledOption[] = []
  const ranked = new Set<string>()
  for (const group of timeGroupsOf(offered)) {
    const ids = (student.ranking?.[group.key] ?? []).filter((id) => group.itemIds.includes(id))
    ids.forEach((id, index) => {
      ranked.add(id)
      options.push(option(input, student, offeredById.get(id) as AllocationItem, 'wish', index + 1, requiredTotal))
    })
  }
  for (const item of offered) {
    if (ranked.has(item.id)) continue
    const full = offeredById.get(item.id) as AllocationItem
    if (full.feeCents !== 0) continue
    const credit = creditedMinutesByDate(full.sessions)
    // A fallback is for a day the student still has to cover.
    if (![...credit.keys()].some((date) => required.has(date))) continue
    options.push(option(input, student, full, 'fallback', cap + 1, requiredTotal))
  }
  return { student, required, requiredTotal, fixedSpans, options: options.filter((o) => !cancelled.has(o.itemId)).sort((a, b) => byText(a.itemId, b.itemId)) }
}

function option(input: AllocationInput, student: AllocationStudent, item: AllocationItem, kind: OptionKind, rank: number, requiredTotal: number): CompiledOption {
  const credit = creditedMinutesByDate(item.sessions)
  const days = new Set(input.projectDays)
  const minutes = [...credit].filter(([date]) => days.has(date)).reduce((sum, [, m]) => sum + m, 0)
  return {
    itemId: item.id,
    kind,
    rank,
    minutes,
    cost: requiredTotal > 0 ? Math.round(rank * minutes * COST_SCALE / requiredTotal) : 0,
    weight: rank * minutes,
    tie: tieWeight(input.seed, student.personId, item.id),
    credit,
  }
}

/** Every student prepared against the catalogue's offer, the `cancelled` items left out of their options, in person-id order. */
export function prepareStudents(input: AllocationInput, cancelled: ReadonlySet<string> = new Set()): PreparedStudent[] {
  const items = solverItems(input, new Set())
  return [...input.students].sort((a, b) => byText(a.personId, b.personId)).map((student) => prepareStudent(input, student, items, cancelled))
}

/** The students of a pass: the first takes the first window's lists, the second everyone (D-20); nobody without a requirement left. */
export function inPass(prepared: PreparedStudent, pass: Pass): boolean {
  return prepared.requiredTotal > 0 && (pass === 2 || prepared.student.savedIn === 'first')
}

/**
 * The request of a pass. The second pass needs the first's result: its
 * assignments become `fixed` pairs, the only options their students keep,
 * and the items it cancelled are dropped (D-20; nothing a late list says
 * revives a course the first window could not fill).
 */
export function compilePass(input: AllocationInput, pass: Pass, runId: string, previous?: PassResult): CompiledPass {
  if (pass === 2 && previous === undefined) throw new RangeError('the second pass needs the first pass\'s result')
  const dropped = pass === 2 && previous ? [...previous.cancelled].sort(byText) : []
  const cancelled = new Set(dropped)
  const items = solverItems(input, cancelled)
  const itemIds = items.map((item) => item.id)
  const itemIndex = new Map(itemIds.map((id, o) => [id, o]))
  const dayIndex = new Map(input.projectDays.map((date, d) => [date, d]))
  const kept = new Map<string, Set<string>>()
  if (pass === 2 && previous) {
    for (const [personId, itemId] of previous.assign) {
      const set = kept.get(personId) ?? new Set()
      set.add(itemId)
      kept.set(personId, set)
    }
  }
  const students = prepareStudents(input, cancelled).filter((p) => inPass(p, pass)).map((p) => {
    if (pass === 2 && p.student.savedIn === 'first') {
      const mine = kept.get(p.student.personId) ?? new Set()
      return { ...p, options: p.options.filter((o) => mine.has(o.itemId)) }
    }
    return p
  })
  const personIds = students.map((p) => p.student.personId)
  const fixed: [number, number][] = []
  const requestStudents: SolveStudent[] = students.map((p, s) => {
    const options = p.options.map((o) => ({ o: itemIndex.get(o.itemId) as number, cost: o.cost, weight: o.weight, tie: o.tie, credit: dayMinutes(o.credit, dayIndex) })).sort((a, b) => a.o - b.o)
    if (pass === 2 && p.student.savedIn === 'first') {
      for (const o of options) fixed.push([s, o.o])
    }
    return { s, required: dayMinutes(p.required, dayIndex), norm: p.requiredTotal, options }
  })
  const conflicts: [number, number][] = []
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      if (itemsOverlap(items[a] as AllocationItem, items[b] as AllocationItem)) conflicts.push([a, b])
    }
  }
  const request: SolveRequest = {
    contract: ALLOCATION_CONTRACT,
    runId,
    seed: input.seed,
    limits: { deterministicTimePerLevel: input.limits.deterministicTimePerLevel },
    students: requestStudents,
    items: items.map((item, o) => ({ o, max: item.rules.places, min: solverMinimum(item.rules), cancellable: mayBeCancelled(item.rules) })),
    conflicts,
    fixed,
    levels: levelNames(input.wishesPerGroup),
  }
  return { pass, request, personIds, itemIds, students, dropped }
}

function dayMinutes(byDate: ReadonlyMap<string, number>, dayIndex: ReadonlyMap<string, number>): DayMinutes[] {
  return [...byDate].filter(([date, min]) => min > 0 && dayIndex.has(date)).map(([date, min]) => ({ d: dayIndex.get(date) as number, min })).sort((a, b) => a.d - b.d)
}

export function itemsOverlap(a: Pick<AllocationItem, 'sessions'>, b: Pick<AllocationItem, 'sessions'>): boolean {
  return a.sessions.some((x) => b.sessions.some((y) => overlaps(x, y)))
}

export const ALLOCATION_INPUT_PROBLEM_CODES = ['daily_minimum_missing', 'no_students', 'fixed_items_overlap'] as const
export type AllocationInputProblemCode = typeof ALLOCATION_INPUT_PROBLEM_CODES[number]

export interface AllocationInputProblem {
  code: AllocationInputProblemCode
  /** The grades without a daily minimum. */
  grades?: number[]
  /** The student placed into two class activities that overlap, and the two. */
  personId?: string
  itemIds?: string[]
}

/** A non-cancellable item fewer students can take than its minimum asks: the usual cause of an infeasible run (D-08). */
export interface AllocationWarning {
  code: 'minimum_out_of_reach'
  itemId: string
  possible: number
  minimum: number
}

export interface AllocationInputCheck {
  problems: AllocationInputProblem[]
  warnings: AllocationWarning[]
}

/** What stops a run before the solver, and what the organizer should know if it comes back infeasible. */
export function checkAllocationInput(input: AllocationInput): AllocationInputCheck {
  const problems: AllocationInputProblem[] = []
  if (input.students.length === 0) problems.push({ code: 'no_students' })
  const grades = [...new Set(input.students.map((s) => s.grade))].filter((grade) => !(input.dailyMinimum[String(grade)] !== undefined && input.dailyMinimum[String(grade)] as number > 0)).sort((a, b) => a - b)
  if (grades.length > 0) problems.push({ code: 'daily_minimum_missing', grades })
  // Two class activities that take the same student at the same time: the catalogue's mistake, not the model's to resolve.
  for (const student of [...input.students].sort((a, b) => byText(a.personId, b.personId))) {
    for (const [a, b] of fixedOverlaps(input, student)) problems.push({ code: 'fixed_items_overlap', personId: student.personId, itemIds: [a, b] })
  }
  const warnings: AllocationWarning[] = []
  if (problems.length === 0) {
    const prepared = prepareStudents(input)
    for (const item of solverItems(input, new Set())) {
      const minimum = solverMinimum(item.rules)
      if (mayBeCancelled(item.rules) || minimum === 0) continue
      const possible = prepared.filter((p) => p.requiredTotal > 0 && p.options.some((o) => o.itemId === item.id)).length
      if (possible < minimum) warnings.push({ code: 'minimum_out_of_reach', itemId: item.id, possible, minimum })
    }
  }
  return { problems, warnings }
}

/** The pairs of a student's fixed items whose sessions overlap, in id order. */
export function fixedOverlaps(input: AllocationInput, student: Pick<AllocationStudent, 'fixedItemIds'>): [string, string][] {
  const items = new Map(input.items.map((item) => [item.id, item]))
  const fixed = [...student.fixedItemIds].sort(byText).map((id) => items.get(id)).filter((item): item is AllocationItem => item !== undefined)
  const pairs: [string, string][] = []
  for (let a = 0; a < fixed.length; a++) {
    for (let b = a + 1; b < fixed.length; b++) {
      const itemA = fixed[a] as AllocationItem
      const itemB = fixed[b] as AllocationItem
      if (itemsOverlap(itemA, itemB)) pairs.push([itemA.id, itemB.id])
    }
  }
  return pairs
}
