// The school's lesson periods (D-25): the grid a teacher thinks in when
// placing a session ("from the 2nd period, two periods long"). Times are
// wall-clock strings, HH:MM, of the school's zone; the API turns them into
// instants on a project day. Pure: no clock, no zone.

/** One period of the grid: its number, counted from 1, and its clock span. */
export interface Period {
  period: number
  /** HH:MM */
  starts: string
  /** HH:MM */
  ends: string
}

export const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** The grid most Austrian schools run on: 50-minute periods from 7:35, 5-minute breaks, the long break after the third period. */
export const DEFAULT_PERIODS: readonly Period[] = [
  { period: 1, starts: '07:35', ends: '08:25' },
  { period: 2, starts: '08:30', ends: '09:20' },
  { period: 3, starts: '09:25', ends: '10:15' },
  { period: 4, starts: '10:30', ends: '11:20' },
  { period: 5, starts: '11:25', ends: '12:15' },
  { period: 6, starts: '12:20', ends: '13:10' },
  { period: 7, starts: '13:15', ends: '14:05' },
  { period: 8, starts: '14:10', ends: '15:00' },
  { period: 9, starts: '15:05', ends: '15:55' },
  { period: 10, starts: '16:00', ends: '16:50' },
]

export const PERIOD_PROBLEM_CODES = ['no_periods', 'period_numbering', 'period_time_invalid', 'period_ends_before_start', 'periods_overlap'] as const
export type PeriodProblemCode = typeof PERIOD_PROBLEM_CODES[number]

/** Minutes since midnight of a clock time; NaN for anything that is not one. */
export function minutesOf(time: string): number {
  if (!CLOCK_TIME.test(time)) return Number.NaN
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * The problems of a grid as entered: at least one period, numbered 1, 2, 3
 * … without a gap, each with a clock span, each ending after it starts and
 * starting no earlier than the one before ends.
 */
export function checkPeriods(periods: readonly Period[]): PeriodProblemCode[] {
  const problems = new Set<PeriodProblemCode>()
  if (periods.length === 0) problems.add('no_periods')
  periods.forEach((period, index) => {
    if (period.period !== index + 1) problems.add('period_numbering')
    const starts = minutesOf(period.starts)
    const ends = minutesOf(period.ends)
    if (Number.isNaN(starts) || Number.isNaN(ends)) {
      problems.add('period_time_invalid')
      return
    }
    if (ends <= starts) problems.add('period_ends_before_start')
    const previous = periods[index - 1]
    if (previous && CLOCK_TIME.test(previous.ends) && starts < minutesOf(previous.ends)) problems.add('periods_overlap')
  })
  return [...problems]
}

/** The clock span of `count` periods from period `from`, or undefined when the grid has no such periods. */
export function spanOfPeriods(grid: readonly Period[], from: number, count: number): { starts: string, ends: string } | undefined {
  if (!Number.isInteger(from) || !Number.isInteger(count) || count < 1) return undefined
  const first = grid.find((p) => p.period === from)
  const last = grid.find((p) => p.period === from + count - 1)
  return first && last ? { starts: first.starts, ends: last.ends } : undefined
}

/**
 * The first and the last period a clock span covers exactly; undefined when
 * the span does not start and end on the grid's lines (a trip at 07:30, a
 * return at 18:00). Numbers only: the words a page shows for them,
 * "2.–3. EH", are the message catalogue's.
 */
export function periodsOfSpan(grid: readonly Period[], starts: string, ends: string): { from: number, to: number } | undefined {
  const first = grid.find((p) => p.starts === starts)
  const last = grid.find((p) => p.ends === ends)
  if (!first || !last || last.period < first.period) return undefined
  return { from: first.period, to: last.period }
}
