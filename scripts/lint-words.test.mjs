import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { offending, scan, SCOPE } from './lint-words.mjs'

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

test('the scan walks the scope\'s files and directories and names each hit by file and line; the repository itself is clean', () => {
  const root = mkdtempSync(join(tmpdir(), 'lint-words-'))
  mkdirSync(join(root, 'pages', 'deep'), { recursive: true })
  writeFileSync(join(root, 'de.ts'), 'a: Mindestens ein Termin ist nötig\nb: Es braucht einen Termin\n')
  writeFileSync(join(root, 'pages', 'deep', 'seite.md'), '# Titel\n\nGebraucht wird nichts.\n')
  writeFileSync(join(root, 'pages', 'notes.txt'), 'brauchen, but not a file the scan reads\n')
  assert.deepEqual(scan(root, ['de.ts', 'pages']), [
    { file: 'de.ts', line: 2, text: 'b: Es braucht einen Termin' },
    { file: join('pages', 'deep', 'seite.md'), line: 3, text: 'Gebraucht wird nichts.' },
  ])
  assert.deepEqual(scan(new URL('..', import.meta.url).pathname), [])
})
