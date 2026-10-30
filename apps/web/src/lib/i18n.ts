// The words of the pages: the message catalogue (packages/messages) in the
// school's language, which the server names in a meta tag when it sends
// the page (apps/api/lib/web-index.ts), so a change of it applies at the
// next load. Pages and helpers read `t`; dates and numbers are formatted
// in `INTL_LOCALE`, the catalogue's locale for Intl. The dev server serves
// index.html as it is, whose tag says German. Outside a browser (the tests
// of the pure modules) there is no document, and the language is German.

import { intlLocale, isLocale, messagesFor, type Locale } from '@school-allocation/messages'

/** The language a page's tag names; German without a tag or for a code the catalogue does not have. */
export function localeOf(content: string | null | undefined): Locale {
  return isLocale(content) ? content : 'de'
}

// Typed as the browser's globals, which the tests of the pure modules do
// not have: they get German.
const browser = globalThis as {
  document?: { querySelector: (selector: string) => { getAttribute: (name: string) => string | null } | null }
}

export const LOCALE = localeOf(browser.document?.querySelector('meta[name="locale"]')?.getAttribute('content'))

export const t = messagesFor(LOCALE)

export const INTL_LOCALE = intlLocale(LOCALE)
