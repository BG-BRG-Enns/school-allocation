// The words the server writes itself: the workbooks' sheets, columns and
// cells, the values it fills into the notices, the names of the files it
// sends. They come from the message catalogue (packages/messages) the web
// app reads too, German for now; dates and numbers are formatted in
// `INTL_LOCALE`. The mail templates' texts are stored in the database.

import { intlLocale, messagesFor } from '@school-allocation/messages'

const locale = 'de'

export const t = messagesFor(locale)

export const INTL_LOCALE = intlLocale(locale)
