// The words the journeys find the app's elements by: the message catalogue
// of E2E_LOCALE, German unless set (the only language so far). A wording
// change in the catalogue is then no change to a spec. What a journey types
// into a form, the names of its test people and the stand-in's own sign-in
// page stay literal in the specs.

import { intlLocale, LOCALES, messagesFor, type Locale } from '../../packages/messages/src/index.ts'

const locale = process.env.E2E_LOCALE ?? 'de'
if (!(LOCALES as readonly string[]).includes(locale)) throw new Error(`E2E_LOCALE must be one of ${LOCALES.join(', ')}, not ${locale}`)

export const t = messagesFor(locale as Locale)

/** The browser's locale for the journeys, the one the app formats in. */
export const INTL_LOCALE = intlLocale(locale as Locale)

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
