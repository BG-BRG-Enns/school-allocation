// Changes after publication (docs/domain-and-api.md §3 rule 7, §8; mvp-plan
// S5a): a student's move in the swap window, a class teacher's placement of
// a student short of minutes, an organizer's change by hand. The rules are
// the same for all three and checked here against the run's frozen input
// and its current rows; who may ask for what, the window and the lock are
// the API's. Data only: the German sentences are the pages'.

import { creditedMinutesByDate, isEligible, overlaps } from './catalogue.ts'
import type { AllocationInput, AllocationItem, AllocationStudent, Assignment, AssignmentSource } from './allocation-model.ts'

/**
 * Why a move is refused: the target is not one the student may enter (not
 * approved, cancelled, withdrawn, outside their grade or class, a class
 * activity of theirs or overlapping one); they are in it already; it is
 * full; an item left is not theirs; a class activity would be left; an
 * item left would drop under its minimum; the target overlaps an item they
 * keep; a project day would end up with more minutes missing than before.
 */
export const MOVE_PROBLEM_CODES = ['not_offered', 'already_placed', 'item_full', 'not_placed', 'leaves_fixed', 'below_minimum', 'overlap', 'coverage_lost'] as const
export type MoveProblemCode = typeof MOVE_PROBLEM_CODES[number]

export interface MoveProblem {
  code: MoveProblemCode
  itemId?: string
}

export interface Move {
  personId: string
  /** The item entered; null for a removal. */
  toItemId: string | null
  /** The items left; for a swap, what leavesForSwap names. */
  leaves: readonly string[]
}

export interface MoveOptions {
  /** Items nobody enters now: cancelled by the run, withdrawn since. */
  unavailable?: ReadonlySet<string>
  /** The organizer's override of a full item and of an item's minimum, on their responsibility; never of the other rules. */
  force?: boolean
}

export interface MoveOffer {
  itemId: string
  free: number
  /** What a swap into it would leave. */
  leaves: string[]
  /** Empty when the move would go through as the rows stand. */
  problems: MoveProblem[]
}

const byText = (a: string, b: string) => a.localeCompare(b, 'en')

function itemsOverlap(a: AllocationItem | undefined, b: AllocationItem | undefined): boolean {
  return a !== undefined && b !== undefined && a.sessions.some((s) => b.sessions.some((t) => overlaps(s, t)))
}

/** The free places of an item: its places less the students in it other than by class (D-24: a class activity's places are its spare seats). */
export function freePlaces(input: AllocationInput, assignments: readonly Assignment[], itemId: string): number {
  const item = input.items.find((i) => i.id === itemId)
  if (!item) return 0
  return item.rules.places - assignments.filter((a) => a.itemId === itemId && a.source !== 'fixed').length
}

/** The items a move into `toItemId` would have to leave: every item the student is in, other than by class, that overlaps it (rule 7: a move is within the time group). */
export function leavesForSwap(input: AllocationInput, assignments: readonly Assignment[], personId: string, toItemId: string): string[] {
  const target = input.items.find((i) => i.id === toItemId)
  const items = new Map(input.items.map((i) => [i.id, i]))
  return assignments
    .filter((a) => a.personId === personId && a.source !== 'fixed' && a.itemId !== toItemId && itemsOverlap(target, items.get(a.itemId)))
    .map((a) => a.itemId)
    .sort(byText)
}

/** Date → the minutes missing, over the student's items. */
function deficits(input: AllocationInput, student: AllocationStudent, itemIds: readonly string[]): Map<string, number> {
  const minimum = input.dailyMinimum[String(student.grade)] ?? 0
  const credited = creditedMinutesByDate(itemIds.flatMap((id) => input.items.find((i) => i.id === id)?.sessions ?? []))
  return new Map(input.projectDays.map((date) => [date, Math.max(0, minimum - (credited.get(date) ?? 0))]))
}

/** Whether the student may enter the item at all: approved and not cancelled, eligible for them, no class activity of theirs and overlapping none. */
function offered(input: AllocationInput, student: AllocationStudent, item: AllocationItem | undefined, unavailable: ReadonlySet<string>): item is AllocationItem {
  if (item === undefined || unavailable.has(item.id) || !isEligible(student, item.rules)) return false
  const items = new Map(input.items.map((i) => [i.id, i]))
  return !student.fixedItemIds.some((id) => itemsOverlap(item, items.get(id)))
}

/** Every problem of a move against the rows as they stand; empty means it may be written. */
export function checkMove(input: AllocationInput, assignments: readonly Assignment[], move: Move, options: MoveOptions = {}): MoveProblem[] {
  const unavailable = options.unavailable ?? new Set<string>()
  const force = options.force ?? false
  const student = input.students.find((s) => s.personId === move.personId)
  if (!student) return [{ code: 'not_offered' }]
  const items = new Map(input.items.map((i) => [i.id, i]))
  const mine = assignments.filter((a) => a.personId === move.personId)
  const problems: MoveProblem[] = []
  for (const itemId of move.leaves) {
    const row = mine.find((a) => a.itemId === itemId)
    if (!row) {
      problems.push({ code: 'not_placed', itemId })
      continue
    }
    if (row.source === 'fixed') {
      problems.push({ code: 'leaves_fixed', itemId })
      continue
    }
    const item = items.get(itemId)
    // A class activity's minimum is nobody's to protect (its class is in it); the organizer may override the others'.
    if (!force && item !== undefined && item.rules.fixedClasses.length === 0 && item.rules.minParticipants > 0
      && assignments.filter((a) => a.itemId === itemId && a.personId !== move.personId).length < item.rules.minParticipants) {
      problems.push({ code: 'below_minimum', itemId })
    }
  }
  const kept = mine.filter((a) => !move.leaves.includes(a.itemId))
  if (move.toItemId !== null) {
    const target = items.get(move.toItemId)
    if (!offered(input, student, target, unavailable)) {
      problems.push({ code: 'not_offered', itemId: move.toItemId })
    } else if (mine.some((a) => a.itemId === move.toItemId)) {
      problems.push({ code: 'already_placed', itemId: move.toItemId })
    } else {
      if (!force && freePlaces(input, assignments, move.toItemId) <= 0) problems.push({ code: 'item_full', itemId: move.toItemId })
      if (kept.some((a) => itemsOverlap(target, items.get(a.itemId)))) problems.push({ code: 'overlap', itemId: move.toItemId })
      const before = deficits(input, student, mine.map((a) => a.itemId))
      const after = deficits(input, student, [...kept.map((a) => a.itemId), move.toItemId])
      if (input.projectDays.some((date) => (after.get(date) ?? 0) > (before.get(date) ?? 0))) problems.push({ code: 'coverage_lost', itemId: move.toItemId })
    }
  }
  return problems
}

/** The rows after a move checkMove accepted: the left ones gone, the target added with its source. */
export function applyMove(assignments: readonly Assignment[], move: Move, source: Extract<AssignmentSource, 'swap' | 'manual'>): Assignment[] {
  const kept = assignments.filter((a) => a.personId !== move.personId || !move.leaves.includes(a.itemId))
  return move.toItemId === null ? kept : [...kept, { personId: move.personId, itemId: move.toItemId, source, pass: null, rank: null }]
}

/**
 * What a student could move into (D-13: the free places per item are what
 * the swap window shows): every item they may enter, with its free places,
 * what the move would leave (`swap`) or nothing (`place`: into a gap), and
 * the problems the move has as the rows stand. In id order.
 */
export function moveOffers(input: AllocationInput, assignments: readonly Assignment[], personId: string, mode: 'swap' | 'place', unavailable: ReadonlySet<string> = new Set()): MoveOffer[] {
  const student = input.students.find((s) => s.personId === personId)
  if (!student) return []
  const mine = new Set(assignments.filter((a) => a.personId === personId).map((a) => a.itemId))
  return [...input.items].sort((a, b) => byText(a.id, b.id))
    .filter((item) => !mine.has(item.id) && offered(input, student, item, unavailable))
    .map((item) => {
      const leaves = mode === 'swap' ? leavesForSwap(input, assignments, personId, item.id) : []
      return { itemId: item.id, free: freePlaces(input, assignments, item.id), leaves, problems: checkMove(input, assignments, { personId, toItemId: item.id, leaves }, { unavailable }) }
    })
}
