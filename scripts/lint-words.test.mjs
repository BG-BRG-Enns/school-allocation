import assert from 'node:assert/strict'
import { test } from 'node:test'
import { offending, SCOPE } from './lint-words.mjs'

test('every form of the word is found, with its line; other words are not', () => {
  assert.deepEqual(offending('Ein Termin ist nötig.\nEs braucht einen Termin.\nUnbrauchbar.\nGebraucht wird nichts.\nDie Brauerei.'), [
    { line: 2, text: 'Es braucht einen Termin.' },
    { line: 3, text: 'Unbrauchbar.' },
    { line: 4, text: 'Gebraucht wird nichts.' },
  ])
  assert.deepEqual(offending(''), [])
})

test('the scope names the German texts, never the English handbook', () => {
  assert.ok(SCOPE.includes('packages/messages/src/de.ts'))
  assert.ok(SCOPE.every((entry) => !entry.includes('/en')))
})
