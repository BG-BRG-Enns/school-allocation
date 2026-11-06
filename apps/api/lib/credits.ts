// What a session credits per project day, derived from the school's
// period grid (school-core creditsOf): the API turns the grid's clock
// times into instants on each local date the session touches, in the
// school's zone, and hands them over. Nobody enters a credit; it is
// computed when a session's times are set, and again for the
// registrations not yet open when the grid changes.

import { creditsOf, type Credit, type Period } from '@school-allocation/school-core'
import { datesOfSpan, dayBounds, instantInSchoolZone, instantOf } from './time.ts'

/** The credits of a session from `startsAt` to `endsAt` (ISO instants) against `grid`; none for a span that is not one, which the rules refuse by itself. */
export function sessionCredits(grid: readonly Period[], startsAt: string, endsAt: string): Credit[] {
  const startMs = instantOf(startsAt)
  const endMs = instantOf(endsAt)
  if (startMs === undefined || endMs === undefined || !(endMs > startMs)) return []
  const days = datesOfSpan(startMs, endMs).map((date) => ({
    date,
    ...dayBounds(date),
    periods: grid.map((period) => ({ startMs: instantInSchoolZone(date, period.starts), endMs: instantInSchoolZone(date, period.ends) })),
  }))
  return creditsOf({ startMs, endMs }, days)
}
