import { test } from 'node:test'
import assert from 'node:assert/strict'
import { intlLocale, LOCALES, messagesFor, type Messages, type MessagesOverride } from '../src/index.ts'

/** Every leaf of the catalogue with its dotted key. */
function leaves(node: unknown, path: string[] = []): [string, unknown][] {
  if (typeof node === 'object' && node !== null) return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]))
  return [[path.join('.'), node]]
}

test('every word of every catalogue is a non-empty string or a function of its values', () => {
  for (const locale of LOCALES) {
    const all = leaves(messagesFor(locale))
    assert.ok(all.length > 0)
    for (const [key, value] of all) {
      if (typeof value === 'function') continue
      assert.equal(typeof value, 'string', key)
      assert.ok((value as string).trim() !== '', key)
      assert.equal(value, (value as string).trim(), `${key} has surrounding blanks`)
    }
  }
})

test('a function of a count chooses its words by the language\'s plural rules, and values land where the words say', () => {
  const t = messagesFor('de')
  assert.equal(t.format.periods(2, 3), '2.–3. EH')
  assert.equal(t.format.periods(5, 5), '5. EH')
  assert.equal(t.format.period(1), '1. EH')
  assert.equal(t.format.euros('15,00'), '15,00 €')
  assert.equal(t.common.gradeOrdinal(9), '9. Schulstufe')
  assert.equal(t.labels.level.over(1.5), 'Schüler/innen mit Durchschnittswunsch über 1.5')
})

test('dates and numbers are formatted in Austrian German', () => {
  assert.equal(intlLocale('de'), 'de-AT')
})

test('a complete catalogue satisfies Messages, an override only names keys that exist', () => {
  // Compile-time: a missing or misspelled key fails the typecheck.
  const copy = messagesFor('de') satisfies Messages
  const override = { common: { save: 'Sichern' } } satisfies MessagesOverride
  // @ts-expect-error A key the catalogue does not have.
  const wrong: MessagesOverride = { common: { saveAll: 'Alles sichern' } }
  assert.ok(copy && override && wrong)
})
