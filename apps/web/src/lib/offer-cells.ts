// The cells of the demand as the pages reason about them (school-core
// offer-gate.ts): where an activity's places go, said in words ("5.
// Schulstufe, 4.–5. EH"), and the cells as spans, built from the demand's
// days and the school's grid the way the server builds them, so a page can
// tell which cells an activity touches without asking.

import type { ItemShare } from '@school-allocation/api-contracts'
import { demandCells, describeCells, gateCells, gateRefused, servedCells, type ClassSize, type DayDemand, type DemandDay, type DescribedCells, type GateCell, type OfferedItem, type Period, type ServedCell } from '@school-allocation/school-core'
import { formatDay, instantInSchoolZone, nextDay } from './format.ts'
import { t } from './i18n.ts'

/** The demand's days with their cells as spans, from the grid: what the server counted by. */
export function daysOf(demand: readonly DayDemand[], grid: readonly Period[]): DemandDay[] {
  return demand.map((day) => {
    const startMs = Date.parse(instantInSchoolZone(day.date, '00:00'))
    const endMs = Date.parse(instantInSchoolZone(nextDay(day.date), '00:00'))
    return { date: day.date, frame: day.frame, cells: demandCells(day.frame, grid, (time) => Date.parse(instantInSchoolZone(day.date, time)), { startMs, endMs }) }
  })
}

/** An activity as the demand sees it, from the item a page holds. */
export function offerOf(item: { places: number, fixedClasses: readonly string[], eligibleGrades: readonly number[], eligibleClasses: readonly string[], sessions: readonly { startsAt: string, endsAt: string }[] }): OfferedItem {
  return { places: item.places, fixedClasses: item.fixedClasses, eligibleGrades: item.eligibleGrades, eligibleClasses: item.eligibleClasses, sessions: item.sessions.map((s) => ({ startMs: Date.parse(s.startsAt), endMs: Date.parse(s.endsAt) })) }
}

/** Described cells in words: per day, the grades with their periods, "Mo., 21.06.: 5. Schulstufe, 4.–5. EH; 9. Schulstufe" and days joined with " · ". */
export function cellsText(described: readonly DescribedCells[], spoken = false): string {
  const days = [...new Set(described.map((d) => d.date))]
  return days.map((date) => {
    const grades = described.filter((d) => d.date === date).map((d) => {
      const grade = t.common.gradeOrdinal(d.grade)
      return d.periods === null ? grade : `${grade}, ${d.periods.map((run) => (spoken ? t.format.periodsSpoken(run.from, run.to) : t.format.periods(run.from, run.to))).join(' + ')}`
    })
    return `${formatDay(date)}: ${grades.join('; ')}`
  }).join(' · ')
}

/**
 * What an activity brings, as the organizer's table says it: the cells
 * short of the target once the activity's own share is taken off what the
 * demand offers there; null when it serves no cell. A cell the split gives
 * none of its places (a grade whose share rounds to nothing, a class
 * activity's own classes) is not one it brings places to.
 */
export function bringsText(item: OfferedItem & { id: string }, demand: readonly DayDemand[], days: readonly DemandDay[], classes: readonly ClassSize[], shares: readonly ItemShare[], percent: number): string | null {
  const shareOf = (cell: { date: string, period: number | null, grade: number }) => shares.find((s) => s.itemId === item.id && s.date === cell.date && s.period === cell.period && s.grade === cell.grade)?.places ?? 0
  const served = servedCells(item, days, classes).filter((cell) => shareOf(cell) > 0)
  if (served.length === 0) return null
  const without: DayDemand[] = demand.map((day) => ({
    ...day,
    grades: day.grades.map((g) => ({
      ...g,
      cells: g.cells.map((cell) => {
        const share = shares.find((s) => s.itemId === item.id && s.date === day.date && s.period === cell.period && s.grade === g.grade)?.places ?? 0
        return { ...cell, offered: Math.max(0, cell.offered - share) }
      }),
    })),
  }))
  const judged = gateCells(served, without, percent)
  const under = judged.filter((cell) => !cell.reached)
  return under.length === 0 ? t.campaign.items.bringsNothing : t.campaign.items.brings(cellsText(describeCells(under, demand)))
}

/**
 * The served cells an activity brings places to: those where the demand
 * with it offers more than the demand without it. A cell a session touches
 * but whose grade cannot rank the activity (its class is in a class
 * activity overlapping it) is served by the gate's count and gets nothing.
 */
export function cellsAddedBy(served: readonly GateCell[], before: readonly DayDemand[], after: readonly DayDemand[]): GateCell[] {
  const offeredIn = (demand: readonly DayDemand[], cell: GateCell) => demand.find((d) => d.date === cell.date)?.grades.find((g) => g.grade === cell.grade)?.cells.find((c) => c.period === cell.period)?.offered ?? 0
  return served.filter((cell) => offeredIn(after, cell) > offeredIn(before, cell))
}

/** The refusal's sentences, one per day, from the cells the gate judged: the document's "Am Mo., 21.06. hat jede Schulstufe … in der 2. und 3. EH ihr Ziel erreicht." */
export function refusalText(cells: readonly GateCell[], demand: readonly Pick<DayDemand, 'date' | 'periods'>[]): string[] {
  const dates = [...new Set(cells.map((c) => c.date))]
  return dates.map((date) => {
    const described = describeCells(cells.filter((c) => c.date === date), demand)
    const runs = [...new Map(described.flatMap((d) => (d.periods ?? []).map((run) => [`${run.from}-${run.to}`, run] as const))).values()]
    return t.item.gate.refused(formatDay(date), runs.length === 0 ? null : runs.map((run) => t.format.periodsSpoken(run.from, run.to)).join(', '))
  })
}

export { gateRefused }
export type { ServedCell }
