// Dates, times and money as the pages show them, in the school's locale and
// time zone. The server keeps instants; the browser of a school is in the
// same zone, and the zone is named here so a browser elsewhere shows the
// school's time too.

import { periodsOfSpan, type Period } from '@school-allocation/school-core'
import { INTL_LOCALE, t } from './i18n.ts'

export const SCHOOL_TIME_ZONE = 'Europe/Vienna'

const day = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
const dayTime = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const time = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit' })
const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** A local date (YYYY-MM-DD) as "Mo., 21.06.2027". */
export function formatDay(date: string): string {
  return day.format(new Date(`${date}T12:00:00Z`))
}

/** The school's date an instant falls on, as "Sa., 01.09.2035": for an end that is a whole day, such as the retention's. */
export function formatDateOf(iso: string): string {
  return day.format(new Date(iso))
}

/** A span as "Di., 22.06. 08:00 – 13:00", or with the end's day when it ends on another one. */
export function formatSpan(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  return localDate.format(start) === localDate.format(end) ? `${dayTime.format(start)} – ${time.format(end)}` : `${dayTime.format(start)} – ${dayTime.format(end)}`
}

/**
 * The periods of the school's grid a span covers, when it starts and ends
 * on the grid's lines on one day; null otherwise, and the clock times stand.
 */
export function periodsOnGrid(grid: readonly Period[], startsAt: string, endsAt: string): { from: number, to: number } | null {
  if (localDateOf(startsAt) !== localDateOf(endsAt)) return null
  return periodsOfSpan(grid, localTimeOf(startsAt), localTimeOf(endsAt)) ?? null
}

/** A span's periods on the school's grid as "2.–3. EH" (one period: "2. EH"); null off the grid (periodsOnGrid). */
export function periodLabel(grid: readonly Period[], startsAt: string, endsAt: string): string | null {
  const span = periodsOnGrid(grid, startsAt, endsAt)
  return span === null ? null : t.format.periods(span.from, span.to)
}

/** A span as the catalogue shows it: the day with its periods when the grid has them, the clock times otherwise. */
export function formatSpanOnGrid(grid: readonly Period[], startsAt: string, endsAt: string): string {
  const label = periodLabel(grid, startsAt, endsAt)
  return label === null ? formatSpan(startsAt, endsAt) : `${formatDay(localDateOf(startsAt))}, ${label} (${localTimeOf(startsAt)} – ${localTimeOf(endsAt)})`
}

/** An instant as "Mo., 01.03. 08:00" in the school's zone; "–" for none. */
export function formatWhenShort(iso: string | null): string {
  return iso === null ? '–' : dayTime.format(new Date(iso))
}

/** Cents as "15,00 €"; "–" for nothing. */
export function formatFee(cents: number): string {
  return cents === 0 ? '–' : t.format.euros((cents / 100).toLocaleString(INTL_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
}

/** The local date of an instant in the school's zone, YYYY-MM-DD. */
export function localDateOf(iso: string): string {
  return localDate.format(new Date(iso))
}

/** The local time of an instant in the school's zone, HH:MM. */
export function localTimeOf(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/**
 * The local dates a session touches, as the server counts them: from its
 * first day to its last, where an end exactly at midnight belongs to the
 * day before.
 */
export function touchedDates(date: string, endDate: string, end: string): string[] {
  const last = endDate || date
  if (!date || last < date) return date ? [date] : []
  return datesBetween(date, end === '00:00' && last > date ? previousDay(last) : last)
}

function previousDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}

/**
 * The instant at a wall-clock date and time in the school's zone, whatever
 * zone the browser is in: the offset is read from the zone for that moment,
 * twice around a change of summer time.
 */
export function instantInSchoolZone(date: string, time: string): string {
  const wall = Date.parse(`${date}T${time}:00Z`)
  let ms = wall - zoneOffsetMinutes(wall) * 60_000
  const again = wall - zoneOffsetMinutes(ms) * 60_000
  if (again !== ms) ms = again
  return new Date(ms).toISOString()
}

const zoneParts = new Intl.DateTimeFormat('en-US', { timeZone: SCHOOL_TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Minutes the school's zone is ahead of UTC at `ms`. */
function zoneOffsetMinutes(ms: number): number {
  const part = (type: string) => Number(zoneParts.formatToParts(new Date(ms)).find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
  return Math.round((asUtc - ms) / 60_000)
}

/** Every local date from `from` to `to` inclusive, both YYYY-MM-DD. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let ms = Date.parse(`${from}T00:00:00Z`); Number.isFinite(ms) && ms <= end && dates.length < 60; ms += 86_400_000) {
    dates.push(new Date(ms).toISOString().slice(0, 10))
  }
  return dates
}
