// The words the journeys find the app's elements by: the message catalogue
// of E2E_LOCALE, German unless set. The harness sets the school's language
// to the same (e2e/harness/server.ts), so the app speaks it. A wording
// change in the catalogue is then no change to a spec. What a journey types
// into a form, the names of its test people and the stand-in's own sign-in
// page stay literal in the specs.

import { intlLocale, isLocale, LOCALES, messagesFor } from '../../packages/messages/src/index.ts'

const locale = process.env.E2E_LOCALE ?? 'de'
if (!isLocale(locale)) throw new Error(`E2E_LOCALE must be one of ${LOCALES.join(', ')}, not ${locale}`)

/** The school's language in the journeys. */
export const LOCALE = locale

export const t = messagesFor(LOCALE)

/** The browser's locale for the journeys, the one the app formats in. */
export const INTL_LOCALE = intlLocale(LOCALE)

// Dates as the pages write them (apps/web/src/lib/format.ts), in the
// journeys' locale. A spec names a school day or a wall-clock time of the
// school; formatting it in UTC keeps exactly that day and time.
const dayFormat = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
const dayTimeFormat = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** A school day (YYYY-MM-DD) as the pages write it: "Mo., 03.07.2034" in German, "Mon, 03/07/2034" in English. */
export function day(date: string): string {
  return dayFormat.format(new Date(`${date}T12:00:00Z`))
}

/** A wall-clock time of the school (YYYY-MM-DDTHH:MM) as the pages write it: "Mo., 06.03., 08:00". */
export function dayTime(local: string): string {
  return dayTimeFormat.format(new Date(`${local}:00Z`))
}

/** An amount in cents as the pages write a fee (apps/web/src/lib/format.ts formatFee): "15,00 €" in German, "€15.00" in English. */
export function fee(cents: number): string {
  return t.format.euros((cents / 100).toLocaleString(INTL_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
}

/** `text` as a part of a RegExp, its special characters escaped: for a pattern built around the catalogue's words. */
export function literally(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

/**
 * A catalogue sentence around a count the journey does not pin down, as a
 * pattern that takes any count there: the sentence for one, which may be
 * worded apart from the others, or the one for any other count.
 */
export function anyCount(sentence: (count: number) => string): RegExp {
  const marker = 987654321
  const other = sentence(marker).split(String(marker)).map(literally).join(String.raw`\d+`)
  return new RegExp(`(?:${literally(sentence(1))}|${other})`)
}

/** The same for a value in words (a time, a version, an item): each place of it takes `value`, a pattern, any text unless given. */
export function anyText(sentence: (text: string) => string, value = '.+'): RegExp {
  const marker = '\u0000'
  return new RegExp(sentence(marker).split(marker).map(literally).join(value))
}
