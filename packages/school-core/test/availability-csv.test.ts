import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAvailabilityCsv } from '../src/availability-csv.ts'

// Mon 3, Tue 4, Wed 5 July 2034.
const DAYS = ['2034-07-03', '2034-07-04', '2034-07-05']

test('the school\'s sheet is read as exported: the abbreviation, MO/DI/MI, Leitung ignored and named, the remark as the note', () => {
  const text = 'Name;MO;DI;MI;Leitung;Anmerkung\r\n'
    + 'ZwA;;N;;;\r\n'
    + 'PfB;F;;F;N;NUR RESERVE\r\n'
    + 'KnC;;;;;\r\n'
  const result = parseAvailabilityCsv(text, DAYS)
  assert.deepEqual(result.fileProblems, [])
  assert.deepEqual(result.problems, [])
  assert.deepEqual(result.ignoredColumns, ['Leitung'])
  assert.deepEqual(result.days, DAYS)
  assert.equal(result.hasNote, true)
  assert.deepEqual(result.rows, [
    { line: 2, shortName: 'ZwA', days: { '2034-07-03': 'available', '2034-07-04': 'unavailable', '2034-07-05': 'available' }, note: null },
    { line: 3, shortName: 'PfB', days: { '2034-07-03': 'if_needed', '2034-07-04': 'available', '2034-07-05': 'if_needed' }, note: 'NUR RESERVE' },
    { line: 4, shortName: 'KnC', days: { '2034-07-03': 'available', '2034-07-04': 'available', '2034-07-05': 'available' }, note: null },
  ])
})

test('days by date or by weekday in either language, a subset of the days, addresses as the key, spelled-out values', () => {
  const text = 'email,2034-07-05,Tuesday\n'
    + 'Anna.Zwexmhofer@schule.example.org,nicht verfügbar,only if necessary\n'
    + 'bernd.pfnoexlhofer@schule.example.org,verfügbar,ja\n'
  const result = parseAvailabilityCsv(text, DAYS)
  assert.deepEqual(result.fileProblems, [])
  assert.deepEqual(result.days, ['2034-07-05', '2034-07-04'])
  assert.equal(result.hasNote, false)
  assert.deepEqual(result.rows, [
    { line: 2, email: 'anna.zwexmhofer@schule.example.org', days: { '2034-07-05': 'unavailable', '2034-07-04': 'if_needed' } },
    { line: 3, email: 'bernd.pfnoexlhofer@schule.example.org', days: { '2034-07-05': 'available', '2034-07-04': 'available' } },
  ])
})

test('an unknown column, a weekday the registration has twice or not at all, no key column and no day column are refused as a file', () => {
  assert.deepEqual(parseAvailabilityCsv('Name;MO;Dienstg\nZwA;;\n', DAYS).fileProblems, [{ code: 'unknown_column', column: 'Dienstg' }])
  assert.deepEqual(parseAvailabilityCsv('Name;FR\nZwA;\n', DAYS).fileProblems, [{ code: 'unknown_column', column: 'FR' }, { code: 'missing_column', column: '2034-07-03' }])
  assert.deepEqual(parseAvailabilityCsv('Name;MO\nZwA;\n', ['2034-07-03', '2034-07-10']).fileProblems, [{ code: 'day_ambiguous', column: 'MO' }, { code: 'missing_column', column: '2034-07-03' }])
  assert.deepEqual(parseAvailabilityCsv('MO;DI\n;\n', DAYS).fileProblems, [{ code: 'missing_column', column: 'email' }])
  assert.deepEqual(parseAvailabilityCsv('Name;Leitung\nZwA;N\n', DAYS).fileProblems, [{ code: 'missing_column', column: '2034-07-03' }])
  assert.deepEqual(parseAvailabilityCsv('Longname;Forename\nZwexmhofer;Anna\n', DAYS).fileProblems, [{ code: 'no_header' }])
  assert.deepEqual(parseAvailabilityCsv('Name;MO\n', DAYS).fileProblems, [{ code: 'empty' }])
  assert.deepEqual(parseAvailabilityCsv('Name;MO\n;\n\n', DAYS).fileProblems, [{ code: 'empty' }])
  // A blank record, as a spreadsheet leaves it, is skipped with the line numbers kept.
  assert.deepEqual(parseAvailabilityCsv('Name;MO\n;\nZwA;N\n', DAYS).rows, [{ line: 3, shortName: 'ZwA', days: { '2034-07-03': 'unavailable' } }])
  // The weekday and its date: one would silently win over the other.
  assert.deepEqual(parseAvailabilityCsv('email;MO;2034-07-03\nanna.zwexmhofer@schule.example.org;N;\n', DAYS).fileProblems, [{ code: 'duplicate_column', column: '2034-07-03' }])
  // Headers and cells that are Object's own words are nothing the tables know.
  assert.deepEqual(parseAvailabilityCsv('email;constructor\nanna.zwexmhofer@schule.example.org;\n', DAYS).fileProblems, [{ code: 'unknown_column', column: 'constructor' }, { code: 'missing_column', column: '2034-07-03' }])
  assert.deepEqual(parseAvailabilityCsv('email;MO\nanna.zwexmhofer@schule.example.org;__proto__\n', DAYS).problems, [{ code: 'status_invalid', line: 2, key: '__proto__' }])
})

test('a row without a key, with a bad address, a value none of the three, or a note too long is reported with its line and left out', () => {
  const text = [
    'email;Name;MO;Anmerkung',
    ';;N;',
    'not-an-address;;N;',
    `anna.zwexmhofer@schule.example.org;ZwA;vielleicht;`,
    `bernd.pfnoexlhofer@schule.example.org;PfB;;${'x'.repeat(201)}`,
    `carla.knoxbrunner@schule.example.org;;n;`,
  ].join('\n')
  const result = parseAvailabilityCsv(text, DAYS)
  assert.deepEqual(result.fileProblems, [])
  assert.deepEqual(result.problems, [
    { code: 'key_missing', line: 2 },
    { code: 'email_invalid', line: 3, key: 'not-an-address' },
    { code: 'status_invalid', line: 4, key: 'vielleicht' },
    { code: 'note_too_long', line: 5 },
  ])
  assert.deepEqual(result.rows, [{ line: 6, email: 'carla.knoxbrunner@schule.example.org', days: { '2034-07-03': 'unavailable' }, note: null }])
})
