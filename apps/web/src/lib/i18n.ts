// The words of the pages: the message catalogue (packages/messages), German
// for now. Pages and helpers read `t`; dates and numbers are formatted in
// `INTL_LOCALE`, the catalogue's locale for Intl.

import { intlLocale, messagesFor } from '@school-allocation/messages'

const locale = 'de'

export const t = messagesFor(locale)

export const INTL_LOCALE = intlLocale(locale)
