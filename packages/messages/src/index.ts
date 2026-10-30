// The catalogues by language: German (de.ts) is the source; formal German
// (de-formal.ts) overrides the words that address staff and keeps the
// rest; English (en.ts) is checked complete against `Messages`. A school
// speaks one of them, set by its administration; the server names it in
// the page it sends and writes the workbooks and notices in it.

import { de, type Messages } from './de.ts'
import { deFormal } from './de-formal.ts'
import { en } from './en.ts'

export type { Messages }

/** A catalogue that overrides some of another's words and keeps the rest (the shape a variant of a language has). */
export type MessagesOverride<T = Messages> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : T[K] extends object ? MessagesOverride<T[K]> : T[K]
}

export const LOCALES = ['de', 'de-formal', 'en'] as const
export type Locale = typeof LOCALES[number]

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * `base` with the words of `override` in its place, at any depth; what the
 * override does not name stays. A function of a count or a name is one
 * word: it is replaced whole, never merged. Neither argument is changed.
 */
export function withOverride<T extends object>(base: T, override: MessagesOverride<T>): T {
  const result = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    const inner = result[key]
    result[key] = isGroup(value) && isGroup(inner) ? withOverride(inner, value) : value
  }
  return result as T
}

/** A group of words, as opposed to one word: a plain object, not a string or a function. */
function isGroup(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const CATALOGUES: Readonly<Record<Locale, Messages>> = {
  'de': de,
  'de-formal': withOverride(de, deFormal),
  'en': en,
}

export function messagesFor(locale: Locale): Messages {
  return CATALOGUES[locale]
}

/** The locale dates, times and numbers are formatted in: Austrian German for both German variants, British English for English. */
export function intlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-GB' : 'de-AT'
}

/** The language as `<html lang>` names it, for screen readers and hyphenation: the address is not a language. */
export function htmlLang(locale: Locale): string {
  return locale === 'en' ? 'en' : 'de'
}
