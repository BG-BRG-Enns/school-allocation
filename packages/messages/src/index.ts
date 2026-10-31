// The catalogues by language. German is the only one so far; English and
// formal German follow as files beside de.ts, English checked complete
// against `Messages` and formal German as an override of German.

import { de, type Messages } from './de.ts'

export type { Messages }

/** A catalogue that overrides some of another's words and keeps the rest (the shape a variant of a language has). */
export type MessagesOverride<T = Messages> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : T[K] extends object ? MessagesOverride<T[K]> : T[K]
}

export const LOCALES = ['de'] as const
export type Locale = typeof LOCALES[number]

export function messagesFor(_locale: Locale): Messages {
  return de
}

/** The locale dates, times and numbers are formatted in: Austrian German for German. */
export function intlLocale(_locale: Locale): string {
  return 'de-AT'
}
