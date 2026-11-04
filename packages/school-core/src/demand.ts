// Places needed against places offered, per project day and grade (D-13):
// what the organizer watches while proposals come in, and what a teacher
// sees before proposing. A day is counted in cells: one per period of its
// attendance frame, when the organizer set one (everyone is at school from
// the 2nd to the 6th period, say), else the whole day. A class activity
// takes its classes out of every cell it touches, so a class back from a
// trip at eleven needs places again from the 5th period; an activity open
// to several classes counts its places for each of them in proportion to
// what they still need in the cell, since the offer is assumed to draw
// every eligible class alike. Pure arithmetic over the roster's class
// sizes and the catalogue; instants are epoch milliseconds the caller
// computed in the school's zone.

import { overlaps } from './catalogue.ts'
import type { Period } from './periods.ts'

export interface ClassSize {
  className: string
  grade: number
  students: number
}

/** An activity as the demand sees it: where it counts, for whom, how many places, when. */
export interface OfferedItem {
  fixedClasses: readonly string[]
  eligibleGrades: readonly number[]
  eligibleClasses: readonly string[]
  places: number
  /** Its sessions' spans. */
  sessions: readonly { startMs: number, endMs: number }[]
}

/** The attendance frame of a project day: everyone is at school from period `from` to period `to` of the grid. */
export interface Frame {
  from: number
  to: number
}

/** One cell of a day: a period of its frame, or the whole day (`period` null), with its span. */
export interface DemandCell {
  period: number | null
  startMs: number
  endMs: number
}

/** A project day as the demand counts it. */
export interface DemandDay {
  date: string
  frame: Frame | null
  cells: readonly DemandCell[]
}

export interface CellDemand {
  period: number | null
  /** Students of the grade in a class activity touching this cell. */
  fixed: number
  /** students − fixed: who needs a place in this cell. */
  needing: number
  /** Places offered to the grade in this cell, shares of shared items included; rounded to a whole place. */
  offered: number
}

export interface GradeDemand {
  grade: number
  /** Students of the grade in the roster. */
  students: number
  /** One per cell of the day, in the day's order. */
  cells: CellDemand[]
}

export interface DayDemand {
  date: string
  frame: Frame | null
  /** The cells' periods, in order: the frame's, or `[null]` for a day counted whole. */
  periods: (number | null)[]
  grades: GradeDemand[]
}

/** The grid's periods a frame spans, in order; a period the grid no longer has is left out. */
export function framePeriods(frame: Frame, grid: readonly Period[]): Period[] {
  return grid.filter((p) => p.period >= frame.from && p.period <= frame.to).sort((a, b) => a.period - b.period)
}

/**
 * The cells of a project day: with a frame one per period of it, spanned
 * by the period's clock times on that date (`toMs` turns a time of the day
 * into an instant), else one for the whole day. A frame none of whose
 * periods the grid has counts the day whole, so a changed grid loses no day.
 */
export function demandCells(frame: Frame | null, grid: readonly Period[], toMs: (time: string) => number, day: { startMs: number, endMs: number }): DemandCell[] {
  const periods = frame === null ? [] : framePeriods(frame, grid)
  if (periods.length === 0) return [{ period: null, startMs: day.startMs, endMs: day.endMs }]
  return periods.map((p) => ({ period: p.period, startMs: toMs(p.starts), endMs: toMs(p.ends) }))
}

export const FRAME_PROBLEM_CODES = ['frame_order', 'frame_period_unknown'] as const
export type FrameProblemCode = typeof FRAME_PROBLEM_CODES[number]

/** What is wrong with a frame against the grid: it ends before it starts, or names a period the grid does not have. */
export function checkFrame(frame: Frame, grid: readonly Period[]): FrameProblemCode | undefined {
  if (!Number.isInteger(frame.from) || !Number.isInteger(frame.to) || frame.to < frame.from) return 'frame_order'
  const periods = new Set(grid.map((p) => p.period))
  if (!periods.has(frame.from) || !periods.has(frame.to)) return 'frame_period_unknown'
  return undefined
}

/** Whether an activity touches a cell: a session of it shares an instant with the cell's span. */
function touches(item: OfferedItem, cell: DemandCell): boolean {
  return item.sessions.some((s) => overlaps(s, cell))
}

/**
 * The demand of every project day, cell by cell: per grade, the students,
 * the ones a class activity takes in the cell, the rest who need a place,
 * and the places the items offer them. Items are counted per class first (a
 * class activity takes its classes out; an item's places split over its
 * eligible classes by their remaining need), then summed per grade.
 */
export function demandByDay(days: readonly DemandDay[], classes: readonly ClassSize[], items: readonly OfferedItem[]): DayDemand[] {
  const grades = [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b)
  return days.map((day) => {
    const cells = day.cells.map((cell) => cellDemand(cell, classes, items.filter((item) => touches(item, cell))))
    return {
      date: day.date,
      frame: day.frame,
      periods: day.cells.map((cell) => cell.period),
      grades: grades.map((grade) => {
        const own = classes.filter((c) => c.grade === grade)
        const students = own.reduce((sum, c) => sum + c.students, 0)
        return {
          grade,
          students,
          cells: cells.map(({ period, needing, offered }) => {
            const stillNeeding = own.reduce((sum, c) => sum + (needing.get(c.className) ?? 0), 0)
            return { period, fixed: students - stillNeeding, needing: stillNeeding, offered: own.reduce((sum, c) => sum + (offered.get(c.className) ?? 0), 0) }
          }),
        }
      }),
    }
  })
}

/** Per class of one cell: who still needs a place, and the places offered them, over the items touching the cell. */
function cellDemand(cell: DemandCell, classes: readonly ClassSize[], inCell: readonly OfferedItem[]): { period: number | null, needing: Map<string, number>, offered: Map<string, number> } {
  const fixedClasses = new Set(inCell.flatMap((item) => item.fixedClasses))
  const needing = new Map(classes.map((c) => [c.className, fixedClasses.has(c.className) ? 0 : c.students]))
  const offered = new Map(classes.map((c) => [c.className, 0]))
  for (const item of inCell) {
    if (item.places <= 0) continue
    const eligible = classes.filter((c) => mayRank(c, item))
    const need = eligible.reduce((sum, c) => sum + (needing.get(c.className) ?? 0), 0)
    // Nobody left to place in any eligible class: the places go nowhere.
    if (need === 0) continue
    for (const [className, share] of splitWhole(item.places, eligible.map((c) => [c.className, (needing.get(c.className) ?? 0) / need]))) {
      offered.set(className, (offered.get(className) ?? 0) + share)
    }
  }
  return { period: cell.period, needing, offered }
}

/**
 * `total` whole places over the keys by their fractions (which sum to 1),
 * largest remainder first, so the shares add up to `total` exactly and no
 * item is counted for more places than it has.
 */
function splitWhole(total: number, fractions: readonly [string, number][]): [string, number][] {
  const floors = fractions.map(([key, fraction]) => ({ key, exact: total * fraction, share: Math.floor(total * fraction) }))
  let remainder = total - floors.reduce((sum, f) => sum + f.share, 0)
  for (const f of [...floors].sort((a, b) => (b.exact - b.share) - (a.exact - a.share) || a.key.localeCompare(b.key, 'en'))) {
    if (remainder <= 0) break
    f.share += 1
    remainder -= 1
  }
  return floors.map((f) => [f.key, f.share])
}

/** Whether students of the class may rank the item: not fixed into it, and within its grade and class rules. */
function mayRank(c: ClassSize, item: OfferedItem): boolean {
  if (item.fixedClasses.includes(c.className)) return false
  if (item.eligibleGrades.length > 0 && !item.eligibleGrades.includes(c.grade)) return false
  if (item.eligibleClasses.length > 0 && !item.eligibleClasses.includes(c.className)) return false
  return true
}

/** How many places more than the need a registration aims for, unless it says otherwise: a fifth. */
export const DEFAULT_PLACE_HEADROOM_PERCENT = 20

/**
 * The places a cell should offer a grade whose `needing` students need one:
 * the need and `percent` more, rounded up, so the wishes have room. A grade
 * offered fewer is short of the target, though not of places.
 */
export function placeTarget(needing: number, percent: number): number {
  return Math.ceil((needing * (100 + percent)) / 100)
}
