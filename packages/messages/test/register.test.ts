import { test } from 'node:test'
import assert from 'node:assert/strict'
import { de } from '../src/de.ts'
import { deFormal } from '../src/de-formal.ts'
import { en } from '../src/en.ts'

// The address of each language (docs/glossary.md, Rules): de says du to
// everyone; de-formal overrides exactly the words that address staff, with
// Sie, and keeps du for students; words that students and staff both read
// address nobody in de-formal. A function's words are checked in its source.

/** Every leaf with its dotted key; a function as its source. */
function leaves(node: unknown, path: string[] = []): [string, string][] {
  if (typeof node === 'function') return [[path.join('.'), String(node)]]
  if (typeof node === 'object' && node !== null) return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]))
  return [[path.join('.'), String(node)]]
}

/** du, its pronouns, and the imperatives in du the catalogue uses; a word is bounded by letters, umlauts included. */
const DU = new RegExp(String.raw`(?<!\p{L})(?:du|Du|dich|dir|dein|deine|deinem|deinen|deiner|deines|Dein|Deine|Lade|lade|Trage|trage|Sieh|sieh|Gib|gib|Behebe|Lies|lies|Logge|logge|Sichere|Ändere|prüfe|berechne|klick|versuch|warte|wende|erinnere|teile|nimm|speichere|Suche die|Übersetze|setze)(?!\p{L})`, 'u')
const SIE = /(?<!\p{L})(?:Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)(?!\p{L})/u

/** What only students read: they are du in both German variants. */
const STUDENTS = ['result.', 'campaign.student.', 'notices.', 'mailTemplates.sample.', 'wishes.', ...['choice_invitation', 'choice_reminder', 'grace_invitation', 'grace_reminder', 'missed_deadline', 'result_published', 'swap_confirmed', 'assignment_changed'].map((kind) => `mail.${kind}.`)]
/** The words of the wishes page that only an organizer entering for a student reads. */
const ON_BEHALF = ['wishes.titleOnBehalf', 'wishes.onBehalf', 'wishes.exemptions.']
/** Names, not address: the languages as the select lists them ("Deutsch (du)"). */
const NAMES = ['labels.locale.']
/** What students and staff both read: no address at all in de-formal. */
const SHARED = ['errors.', 'signIn.', 'start.', 'account.', 'shell.', 'labels.refreshError.']

const under = (key: string, prefixes: readonly string[]) => prefixes.some((prefix) => prefix.endsWith('.') ? key.startsWith(prefix) : key === prefix)
const forStudents = (key: string) => (under(key, STUDENTS) && !under(key, ON_BEHALF)) || under(key, NAMES)

const german = new Map(leaves(de))
const formal = new Map(leaves(deFormal))

// Each test lists every key that breaks its rule, not only the first.

test('formal German overrides exactly the words that address staff, and only keys German has', () => {
  const wrong = [
    ...[...formal.keys()].filter((key) => !german.has(key)).map((key) => `${key} is not a key of de`),
    ...[...formal.keys()].filter((key) => german.has(key) && !DU.test(german.get(key) ?? '')).map((key) => `${key} addresses nobody in de, so de-formal has nothing to change`),
    ...[...formal.keys()].filter(forStudents).map((key) => `${key} is for students, who stay du`),
    ...[...german].filter(([key, text]) => DU.test(text) && !forStudents(key) && !formal.has(key)).map(([key]) => `${key} says du to staff in de and needs a word in de-formal`),
  ]
  assert.deepEqual(wrong, [])
})

test('formal German says no du, and the words everyone reads address nobody', () => {
  const wrong = [
    ...[...formal].filter(([, text]) => DU.test(text)).map(([key]) => `${key} still says du`),
    ...[...formal].filter(([key, text]) => under(key, SHARED) && SIE.test(text)).map(([key]) => `${key} is read by students too and addresses nobody`),
  ]
  assert.deepEqual(wrong, [])
})

test('English has no German letters left', () => {
  assert.deepEqual(leaves(en).filter(([, text]) => /[äöüÄÖÜß]/.test(text)).map(([key]) => `${key} is still German`), [])
})
