import { test } from 'node:test'
import assert from 'node:assert/strict'
import { messagesFor } from '@school-allocation/messages'
import { INTL_LOCALE, localeOf, t } from '../src/lib/i18n.ts'

test('the language is the meta tag\'s, German without one or for a code the catalogue does not have', () => {
  assert.equal(localeOf('de'), 'de')
  assert.equal(localeOf('de-formal'), 'de-formal')
  assert.equal(localeOf('en'), 'en')
  assert.equal(localeOf('fr'), 'de')
  assert.equal(localeOf(''), 'de')
  assert.equal(localeOf(null), 'de')
  assert.equal(localeOf(undefined), 'de')
  // Outside a browser there is no tag: the tests of the pure modules read German.
  assert.equal(t, messagesFor('de'))
  assert.equal(INTL_LOCALE, 'de-AT')
})
