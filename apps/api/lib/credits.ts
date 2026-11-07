// What a session credits per project day (school-core creditsOf): its clock
// minutes inside the day's window, the attendance frame of the
// registration's day, else the grid's first period to its last
// (school-core dayWindow). The API turns the window's clock times into
// instants on each local date the session touches, in the school's zone,
// and hands them over. Nobody enters a credit; it is computed when a
// session's times are set, and again for the registrations not yet open
// when the grid or their frames change.

import { creditsOf, dayWindow, type Credit, type Frame, type Period } from '@school-allocation/school-core'
import { datesOfSpan, dayBounds, instantInSchoolZone, instantOf } from './time.ts'

/** The window of each date in `frames`' days as clock times, for a message that names where the minutes are counted. */
export function windowsOf(projectDays: readonly string[], frames: Readonly<Record<string, Frame>>, grid: readonly Period[]): Record<string, { starts: string, ends: string }> {
  return Object.fromEntries(projectDays.flatMap((date) => {
    const window = dayWindow(frames[date] ?? null, grid)
    return window === null ? [] : [[date, window] as const]
  }))
}

/** The credits of a session from `startsAt` to `endsAt` (ISO instants) against `grid` and the registration's `frames` by date; none for a span that is not one, which the rules refuse by itself. */
export function sessionCredits(grid: readonly Period[], frames: Readonly<Record<string, Frame>>, startsAt: string, endsAt: string): Credit[] {
  const startMs = instantOf(startsAt)
  const endMs = instantOf(endsAt)
  if (startMs === undefined || endMs === undefined || !(endMs > startMs)) return []
  const days = datesOfSpan(startMs, endMs).map((date) => {
    const window = dayWindow(frames[date] ?? null, grid)
    // Only a grid without periods, which its check refuses, has no window: the calendar day stands in.
    const span = window === null ? dayBounds(date) : { startMs: instantInSchoolZone(date, window.starts), endMs: instantInSchoolZone(date, window.ends) }
    return { date, ...span }
  })
  return creditsOf({ startMs, endMs }, days)
}
