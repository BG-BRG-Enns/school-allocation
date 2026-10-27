// Dates, times and money as the pages show them, in the school's locale and
// time zone. The server keeps instants; the browser of a school is in the
// same zone, and the zone is named here so a browser elsewhere shows the
// school's time too.

export const SCHOOL_TIME_ZONE = 'Europe/Vienna'

const day = new Intl.DateTimeFormat('de-AT', { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
const dayTime = new Intl.DateTimeFormat('de-AT', { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const time = new Intl.DateTimeFormat('de-AT', { timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit' })
const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** A local date (YYYY-MM-DD) as "Mo., 21.06.2027". */
export function formatDay(date: string): string {
  return day.format(new Date(`${date}T12:00:00Z`))
}

/** A span as "Di., 22.06. 08:00 – 13:00", or with the end's day when it ends on another one. */
export function formatSpan(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  return localDate.format(start) === localDate.format(end) ? `${dayTime.format(start)} – ${time.format(end)}` : `${dayTime.format(start)} – ${dayTime.format(end)}`
}

/** Cents as "15,00 €"; "–" for nothing. */
export function formatFee(cents: number): string {
  return cents === 0 ? '–' : `${(cents / 100).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

/** The local date of an instant in the school's zone, YYYY-MM-DD. */
export function localDateOf(iso: string): string {
  return localDate.format(new Date(iso))
}

/** The local time of an instant in the school's zone, HH:MM. */
export function localTimeOf(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
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
