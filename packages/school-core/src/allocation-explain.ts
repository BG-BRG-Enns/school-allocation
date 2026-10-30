// What a result means to one student and to the organizer (docs/domain-and-api.md
// §5, "Explanation per student"; the review screen of docs/mvp-plan.md S4):
// the items with their wish numbers, the minutes per day against the
// requirement, the deficits, and the numbers of a run. Computed from the
// stored assignment rows, so a published run reads the same years later.
// Data only: the German sentences are the pages'.

import { creditedMinutesByDate } from './catalogue.ts'
import type { AllocationInput, AllocationItem, Assignment, AssignmentSource, SubmissionWindow } from './allocation-model.ts'

export interface ExplainedItem {
  itemId: string
  source: AssignmentSource
  rank: number | null
  /** Date → the minutes the item credits that day. */
  minutesByDate: Record<string, number>
}

export interface ExplainedDay {
  date: string
  /** The grade's daily minimum. */
  required: number
  /** Fixed and assigned credit together. */
  covered: number
  deficit: number
}

export interface StudentExplanation {
  personId: string
  window: SubmissionWindow | null
  items: ExplainedItem[]
  days: ExplainedDay[]
  /** The minutes-weighted average wish number over the chosen items (a fallback counts as cap + 1); null without any. */
  averageRank: number | null
}

const byText = (a: string, b: string) => a.localeCompare(b, 'en')

function creditOf(item: AllocationItem | undefined, projectDays: readonly string[]): Record<string, number> {
  const minutes = item ? creditedMinutesByDate(item.sessions) : new Map<string, number>()
  const result: Record<string, number> = {}
  for (const date of projectDays) {
    const m = minutes.get(date) ?? 0
    if (m > 0) result[date] = m
  }
  return result
}

/** One student's result; undefined when the input does not know them. */
export function explainStudent(input: AllocationInput, assignments: readonly Assignment[], personId: string): StudentExplanation | undefined {
  const student = input.students.find((s) => s.personId === personId)
  if (!student) return undefined
  const items = new Map(input.items.map((item) => [item.id, item]))
  const mine = assignments.filter((a) => a.personId === personId).sort((a, b) => byText(a.itemId, b.itemId))
  const explained: ExplainedItem[] = mine.map((a) => ({ itemId: a.itemId, source: a.source, rank: a.rank, minutesByDate: creditOf(items.get(a.itemId), input.projectDays) }))
  const minimum = input.dailyMinimum[String(student.grade)] ?? 0
  const days: ExplainedDay[] = input.projectDays.map((date) => {
    const covered = explained.reduce((sum, e) => sum + (e.minutesByDate[date] ?? 0), 0)
    return { date, required: minimum, covered, deficit: Math.max(0, minimum - covered) }
  })
  // The run's own placements: a move or a change after publication says nothing about how well the wishes were met.
  const chosen = explained.filter((e) => e.source === 'wish' || e.source === 'fallback')
  const weight = (e: ExplainedItem) => Object.values(e.minutesByDate).reduce((sum, m) => sum + m, 0)
  const total = chosen.reduce((sum, e) => sum + weight(e), 0)
  const averageRank = total === 0 ? null : chosen.reduce((sum, e) => sum + (e.rank ?? input.wishesPerGroup + 1) * weight(e), 0) / total
  return { personId, window: student.savedIn, items: explained, days, averageRank }
}

export interface ClassSummary {
  className: string
  students: number
  withDeficit: number
  withFallback: number
}

export interface ItemSummary {
  itemId: string
  /** Students placed by class. */
  fixed: number
  /** Students assigned to the places. */
  assigned: number
  places: number
  minimum: number
  cancelled: boolean
}

export interface AllocationSummary {
  students: {
    total: number
    /** Students with a requirement left after their fixed items. */
    choosing: number
    /** Of them, with every day covered. */
    covered: number
    withDeficit: number
    withFallback: number
    late: number
    nonSubmitters: number
  }
  /** Assignment rows by wish number ('1' … cap), 'fallback' and 'fixed'; after publication also 'swap' and 'manual'. */
  ranks: Record<string, number>
  classes: ClassSummary[]
  items: ItemSummary[]
  deficits: { personId: string, date: string, minutes: number }[]
  fallbacks: { personId: string, itemId: string }[]
}

/** The numbers of a run, from its stored rows. */
export function summarizeAllocation(input: AllocationInput, assignments: readonly Assignment[], cancelled: readonly string[]): AllocationSummary {
  const ranks: Record<string, number> = { fixed: 0, fallback: 0, swap: 0, manual: 0 }
  for (let r = 1; r <= input.wishesPerGroup; r++) ranks[String(r)] = 0
  const deficits: AllocationSummary['deficits'] = []
  const fallbacks: AllocationSummary['fallbacks'] = []
  const classes = new Map<string, ClassSummary>()
  const students = { total: input.students.length, choosing: 0, covered: 0, withDeficit: 0, withFallback: 0, late: 0, nonSubmitters: 0 }
  for (const student of [...input.students].sort((a, b) => byText(a.className, b.className) || byText(a.personId, b.personId))) {
    const explanation = explainStudent(input, assignments, student.personId) as StudentExplanation
    const summary = classes.get(student.className) ?? { className: student.className, students: 0, withDeficit: 0, withFallback: 0 }
    summary.students += 1
    classes.set(student.className, summary)
    const fixedMinutes = creditedMinutesByDate(student.fixedItemIds.flatMap((id) => input.items.find((item) => item.id === id)?.sessions ?? []))
    const minimum = input.dailyMinimum[String(student.grade)] ?? 0
    const choosing = input.projectDays.some((date) => minimum - (fixedMinutes.get(date) ?? 0) > 0)
    if (choosing) students.choosing += 1
    if (student.savedIn === 'late') students.late += 1
    // A student with nothing left to choose owes no list.
    if (student.savedIn === null && choosing) students.nonSubmitters += 1
    for (const e of explanation.items) {
      const key = e.source === 'wish' ? String(e.rank) : e.source
      ranks[key] = (ranks[key] ?? 0) + 1
      if (e.source === 'fallback') fallbacks.push({ personId: student.personId, itemId: e.itemId })
    }
    const missing = explanation.days.filter((d) => d.deficit > 0)
    for (const d of missing) deficits.push({ personId: student.personId, date: d.date, minutes: d.deficit })
    if (missing.length > 0) {
      students.withDeficit += 1
      summary.withDeficit += 1
    } else if (choosing) {
      students.covered += 1
    }
    if (explanation.items.some((e) => e.source === 'fallback')) {
      students.withFallback += 1
      summary.withFallback += 1
    }
  }
  const cancelledSet = new Set(cancelled)
  const items: ItemSummary[] = [...input.items].sort((a, b) => byText(a.id, b.id)).map((item) => ({
    itemId: item.id,
    fixed: assignments.filter((a) => a.itemId === item.id && a.source === 'fixed').length,
    assigned: assignments.filter((a) => a.itemId === item.id && a.source !== 'fixed').length,
    places: item.rules.places,
    minimum: item.rules.fixedClasses.length > 0 ? 0 : item.rules.minParticipants,
    cancelled: cancelledSet.has(item.id),
  }))
  return { students, ranks, classes: [...classes.values()], items, deficits, fallbacks }
}
