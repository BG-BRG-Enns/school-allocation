import { test } from 'node:test'
import assert from 'node:assert/strict'
import { de } from '../src/de.ts'
import { htmlLang, intlLocale, isLocale, LOCALES, messagesFor, withOverride, type Messages, type MessagesOverride } from '../src/index.ts'

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
  assert.equal(t.labels.level.over(1.5), 'Schüler*innen mit durchschnittlichem Wunsch über 1.5')
})

test('every catalogue has the German one\'s keys, and a function where German has one', () => {
  const shape = (locale: typeof LOCALES[number]) => leaves(messagesFor(locale)).map(([key, value]) => `${key}:${typeof value}`)
  for (const locale of LOCALES) assert.deepEqual(shape(locale), shape('de'), locale)
})

test('the three languages: German says du, formal German Sie to staff, English; dates and numbers in Austrian German or British English', () => {
  assert.deepEqual(LOCALES, ['de', 'de-formal', 'en'])
  for (const locale of LOCALES) assert.ok(isLocale(locale), locale)
  for (const other of ['fr', 'DE', 'de-AT', 'en-GB', '', null, undefined, 1]) assert.equal(isLocale(other), false, String(other))
  assert.equal(messagesFor('de'), de)
  assert.deepEqual([intlLocale('de'), intlLocale('de-formal'), intlLocale('en')], ['de-AT', 'de-AT', 'en-GB'])
  assert.deepEqual([htmlLang('de'), htmlLang('de-formal'), htmlLang('en')], ['de', 'de', 'en'], 'the address is not a language')
})

test('an override replaces the words it names at any depth, a function whole, and keeps the rest', () => {
  const formal = withOverride(de, {
    common: { save: 'Sichern', field: { name: 'Nachname' }, gradeOrdinal: (grade: number) => `Schulstufe ${grade}` },
    errors: { unauthenticated: 'Bitte loggen Sie sich ein.' },
  })
  assert.equal(formal.common.save, 'Sichern')
  assert.equal(formal.common.field.name, 'Nachname')
  assert.equal(formal.common.field.className, de.common.field.className, 'a sibling in the same group stays')
  assert.equal(formal.common.cancel, de.common.cancel)
  assert.equal(formal.common.gradeOrdinal(9), 'Schulstufe 9')
  assert.equal(formal.common.minutes(240), de.common.minutes(240), 'a function the override does not name stays')
  assert.equal(formal.errors.unauthenticated, 'Bitte loggen Sie sich ein.')
  assert.equal(formal.format, de.format, 'a group the override does not touch is the same group')
  assert.notEqual(de.common.save, 'Sichern', 'the base is not changed')
  assert.equal(de.common.field.name, 'Name')
  assert.deepEqual(withOverride(de, {}), de)
})

test('a complete catalogue satisfies Messages, an override only names keys that exist', () => {
  // Compile-time: a missing or misspelled key fails the typecheck.
  const copy = messagesFor('de') satisfies Messages
  const override = { common: { save: 'Sichern' } } satisfies MessagesOverride
  // @ts-expect-error A key the catalogue does not have.
  const wrong: MessagesOverride = { common: { saveAll: 'Alles sichern' } }
  assert.ok(copy && override && wrong)
})
