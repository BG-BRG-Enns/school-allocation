// The words the server writes itself: the workbooks' sheets, columns and
// cells, the values it fills into the notices, the names of the files it
// sends. They come from the message catalogue (packages/messages) the web
// app reads too, in the school's language (school_setting), which is read
// at the time of the request, or inside the transaction that queues the
// notices, so a change applies to the next one. Dates and numbers are
// formatted in the language's Intl locale.

import { intlLocale, isLocale, messagesFor, type Locale, type Messages } from '@school-allocation/messages'
import { readLocale } from './dao/settings.ts'
import type { Queryable } from './db.ts'

/** The words of one language: its code, its catalogue, and the locale Intl formats in. */
export interface Words {
  locale: Locale
  t: Messages
  intl: string
}

export function wordsIn(locale: Locale): Words {
  return { locale, t: messagesFor(locale), intl: intlLocale(locale) }
}

/** The school's language: the setting, German without one or for a code the catalogue does not have. */
export async function schoolLocale(db: Queryable): Promise<Locale> {
  const stored = await readLocale(db)
  return isLocale(stored) ? stored : 'de'
}

/** The words of the school's language, as it is set now. */
export async function schoolWords(db: Queryable): Promise<Words> {
  return wordsIn(await schoolLocale(db))
}
