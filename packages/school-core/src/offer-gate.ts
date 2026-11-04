// The gate on new offers (the school's wish 1): once a registration says
// so, a teacher's submission is refused when every cell its places would
// go to has reached its target already, so new activities land where
// places are missing. A cell is a period of a framed day, or a whole day,
// for one grade (demand.ts). An activity serves every cell a session of it
// touches, for every grade it is open to, on every day it touches; it is
// allowed as soon as one of them is short of the target, refused only when
// every one has reached it, and not judged at all when it serves none.
// Class activities are never gated: their extra places are a gift, not an
// offer (the service leaves them out). Pure.

import { demandByDay, placeTarget, type ClassSize, type DayDemand, type DemandDay, type OfferedItem } from './demand.ts'
import { overlaps } from './catalogue.ts'

/** One cell an activity serves: a period of a day (null for a day counted whole), for one grade. */
export interface ServedCell {
  date: string
  period: number | null
  grade: number
}

/** A served cell judged against the demand without the activity: what is needed, what the target is, what is offered, whether that reaches the target. */
export interface GateCell extends ServedCell {
  needing: number
  target: number
  offered: number
  reached: boolean
}

/** The shape of an activity the gate reads: what the demand reads, with its places. */
export type GateShape = OfferedItem

/** The grades an activity is open to: its eligible grades, else the grades of its eligible classes, else every grade of the classes. */
export function gradesOpenTo(item: Pick<OfferedItem, 'eligibleGrades' | 'eligibleClasses'>, classes: readonly ClassSize[]): number[] {
  const all = [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b)
  if (item.eligibleGrades.length > 0) return all.filter((grade) => item.eligibleGrades.includes(grade))
  if (item.eligibleClasses.length > 0) return all.filter((grade) => classes.some((c) => c.grade === grade && item.eligibleClasses.includes(c.className)))
  return all
}

/** The cells an activity serves: every cell a session of it touches, for every grade it is open to, in the days' order. */
export function servedCells(item: GateShape, days: readonly DemandDay[], classes: readonly ClassSize[]): ServedCell[] {
  const grades = gradesOpenTo(item, classes)
  return days.flatMap((day) => day.cells.filter((cell) => item.sessions.some((s) => overlaps(s, cell))).flatMap((cell) => grades.map((grade) => ({ date: day.date, period: cell.period, grade }))))
}

/** The served cells judged against `demand`, the demand computed without the activity itself, with the registration's headroom. */
export function gateCells(served: readonly ServedCell[], demand: readonly DayDemand[], percent: number): GateCell[] {
  return served.flatMap((cell) => {
    const found = demand.find((day) => day.date === cell.date)?.grades.find((g) => g.grade === cell.grade)?.cells.find((c) => c.period === cell.period)
    if (!found) return []
    const target = placeTarget(found.needing, percent)
    return [{ ...cell, needing: found.needing, target, offered: found.offered, reached: found.offered >= target }]
  })
}

/** Whether the gate refuses: the activity serves at least one cell, and every one has reached its target. */
export function gateRefused(cells: readonly GateCell[]): boolean {
  return cells.length > 0 && cells.every((cell) => cell.reached)
}

const cellKey = (cell: ServedCell) => `${cell.date}|${cell.period ?? 'day'}|${cell.grade}`

/**
 * The cells a resubmission is judged by (the owner's decision of
 * 2026-11-04): those that get more places than the activity's last
 * submission gave them. A cell the activity serves now and did not serve
 * then; and, when the places grew, every cell it serves. Nothing when
 * nothing was added: a correction never locks a teacher out.
 */
export function addedCells(previous: readonly ServedCell[], current: readonly ServedCell[], placesGrew: boolean): ServedCell[] {
  if (placesGrew) return [...current]
  const before = new Set(previous.map(cellKey))
  return current.filter((cell) => !before.has(cellKey(cell)))
}

/** A run of periods of one day and grade, for the words "5. Schulstufe, 4.–5. EH"; `periods` null for a day counted whole. */
export interface DescribedCells {
  date: string
  grade: number
  periods: { from: number, to: number }[] | null
}

/** The cells grouped by date and grade, each grade's periods as runs of neighbours in the day's order; a day counted whole has `periods` null. */
export function describeCells(cells: readonly ServedCell[], days: readonly Pick<DayDemand, 'date' | 'periods'>[]): DescribedCells[] {
  const out: DescribedCells[] = []
  for (const day of days) {
    const grades = [...new Set(cells.filter((c) => c.date === day.date).map((c) => c.grade))].sort((a, b) => a - b)
    for (const grade of grades) {
      const periods = day.periods.filter((p): p is number => p !== null && cells.some((c) => c.date === day.date && c.grade === grade && c.period === p))
      if (periods.length === 0) {
        out.push({ date: day.date, grade, periods: null })
        continue
      }
      const runs: { from: number, to: number }[] = []
      for (const p of periods) {
        const last = runs.at(-1)
        if (last && day.periods.indexOf(p) === day.periods.indexOf(last.to) + 1) last.to = p
        else runs.push({ from: p, to: p })
      }
      out.push({ date: day.date, grade, periods: runs })
    }
  }
  return out
}

/** The demand with and without a candidate: `before` leaves it out, `after` counts it in. */
export function demandAround(days: readonly DemandDay[], classes: readonly ClassSize[], others: readonly OfferedItem[], candidate: OfferedItem): { before: DayDemand[], after: DayDemand[] } {
  return { before: demandByDay(days, classes, others), after: demandByDay(days, classes, [...others, candidate]) }
}
