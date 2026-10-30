// The words the server writes itself: the workbooks' sheets, columns and
// cells, the values it fills into the notices, the names of the files it
// sends. They come from the message catalogue (packages/messages) the web
// app reads too, German for now; dates and numbers are formatted in
// `INTL_LOCALE`. The mail templates' texts are stored in the database.
// The school's language is stored (school_setting); the page names it.

import { intlLocale, isLocale, messagesFor, type Locale } from '@school-allocation/messages'
import { readLocale } from './dao/settings.ts'
import type { Queryable } from './db.ts'

const locale = 'de'

export const t = messagesFor(locale)

export const INTL_LOCALE = intlLocale(locale)

/** The school's language: the setting, German without one or for a code the catalogue does not have. */
export async function schoolLocale(db: Queryable): Promise<Locale> {
  const stored = await readLocale(db)
  return isLocale(stored) ? stored : 'de'
}
