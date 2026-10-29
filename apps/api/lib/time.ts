// Local dates in the school's time zone (docs/data-sources.md §1: Europe/Vienna,
// fixed). school-core reads no clock and knows no zone, so the API turns
// instants into the local dates a session touches here and hands them over.

import { LOCAL_DATE } from '@school-allocation/school-core'

export const SCHOOL_TIME_ZONE = 'Europe/Vienna'

const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** The local date (YYYY-MM-DD) an instant falls on in the school's zone. */
export function localDateOf(ms: number): string {
  // sv-SE formats as YYYY-MM-DD.
  return formatter.format(new Date(ms))
}

/** Every local date from `from` to `to` inclusive, both YYYY-MM-DD; empty when `to` lies before `from`. */
export function datesBetween(from: string, to: string): string[] {
  if (!LOCAL_DATE.test(from) || !LOCAL_DATE.test(to)) throw new RangeError('not local dates')
  const dates: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let day = Date.parse(`${from}T00:00:00Z`); day <= end && dates.length <= 400; day += 24 * 60 * 60 * 1000) {
    dates.push(new Date(day).toISOString().slice(0, 10))
  }
  return dates
}

/**
 * The local dates a span touches: from the date it starts on to the date
 * it ends on, where an end exactly at midnight still belongs to the day
 * before (a session until 24:00 does not touch the next day).
 */
export function datesOfSpan(startMs: number, endMs: number): string[] {
  if (!(endMs > startMs)) return [localDateOf(startMs)]
  return datesBetween(localDateOf(startMs), localDateOf(endMs - 1))
}

const timeFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** The local clock time (HH:MM) of an instant in the school's zone, for matching a session against the period grid. */
export function localTimeOf(ms: number): string {
  return timeFormatter.format(new Date(ms))
}

/** An ISO 8601 instant as epoch milliseconds, or undefined when it is not one. */
export function instantOf(iso: string): number | undefined {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : undefined
}
