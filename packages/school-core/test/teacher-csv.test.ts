import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTeacherCsv, TEACHER_CSV_TEMPLATE } from '../src/teacher-csv.ts'

test('the template reads into two teachers, one with a class', () => {
  const result = parseTeacherCsv(TEACHER_CSV_TEMPLATE)
  assert.deepEqual(result.fileProblems, [])
  assert.deepEqual(result.problems, [])
  assert.deepEqual(result.ignoredColumns, [])
  assert.deepEqual(result.columns, ['short_name', 'class'])
  assert.deepEqual(result.rows, [
    { line: 2, email: 'anna.zwexmhofer@schule.example.org', shortName: 'ZwA' },
    { line: 3, email: 'bernd.pfnoexlhofer@schule.example.org', shortName: 'PfB', className: '5A' },
  ])
})

test('a school\'s staff list is read as exported: its own header names, the other columns ignored and named', () => {
  const text = 'Name,Longname,Forename,Address Email,Subjects,Kv Von\r\n'
    + 'ZwA,Zwexmhofer,Anna,Anna.Zwexmhofer@Schule.example.org,"M, PH",\r\n'
    + 'PfB,Pfnöxlhofer,Bernd,bernd.pfnoexlhofer@schule.example.org,D,5A\r\n'
    + 'PfB,Pfnöxlhofer,Bernd,bernd.pfnoexlhofer@schule.example.org,D,6A\r\n'
  const result = parseTeacherCsv(text)
  assert.deepEqual(result.fileProblems, [])
  assert.deepEqual(result.problems, [])
  assert.deepEqual(result.ignoredColumns, ['Longname', 'Forename', 'Subjects'])
  assert.deepEqual(result.rows.map((r) => [r.email, r.shortName, r.className]), [
    ['anna.zwexmhofer@schule.example.org', 'ZwA', undefined],
    ['bernd.pfnoexlhofer@schule.example.org', 'PfB', '5A'],
    ['bernd.pfnoexlhofer@schule.example.org', 'PfB', '6A'],
  ])
})

test('only the address is required; a file without it, without a header or with a broken row is refused as a file', () => {
  assert.deepEqual(parseTeacherCsv('email\nanna.zwexmhofer@schule.example.org\n').rows, [{ line: 2, email: 'anna.zwexmhofer@schule.example.org' }])
  assert.deepEqual(parseTeacherCsv('short_name;class\nZwA;5A\n').fileProblems, [{ code: 'missing_column', column: 'email' }])
  assert.deepEqual(parseTeacherCsv('Longname;Forename\nZwexmhofer;Anna\n').fileProblems, [{ code: 'no_header' }])
  assert.deepEqual(parseTeacherCsv('').fileProblems, [{ code: 'no_header' }])
  assert.deepEqual(parseTeacherCsv('email;short_name\n').fileProblems, [{ code: 'empty' }])
  // A header that is one of Object's own words is no column the import knows.
  assert.deepEqual(parseTeacherCsv('constructor;toString\nx;y\n').fileProblems, [{ code: 'no_header' }])
  assert.deepEqual(parseTeacherCsv('email;short_name\na@schule.example.org;ZwA;extra\n').fileProblems, [{ code: 'field_count', line: 2 }])
})

test('a row with a bad address, an abbreviation too long, two abbreviations for one person, one for two, or a class name the roster could not have is reported with its line and left out; the rest is read', () => {
  const text = [
    'email;short_name;class',
    'not-an-address;ZwA;',
    'anna.zwexmhofer@schule.example.org;Zwexmhofer;',
    'bernd.pfnoexlhofer@schule.example.org;PfB;5A',
    'bernd.pfnoexlhofer@schule.example.org;PfX;6A',
    'carla.knoxbrunner@schule.example.org;pfb;',
    'tim.gnoexwieser@schule.example.org;GnT;5A/B/C/D/E/F/G/H/I/J',
    'sara.pfnaexthuber@schule.example.org;;5A',
  ].join('\n')
  const result = parseTeacherCsv(text)
  assert.deepEqual(result.fileProblems, [])
  assert.deepEqual(result.problems, [
    { code: 'email_invalid', line: 2, key: 'not-an-address' },
    { code: 'short_name_too_long', line: 3, key: 'Zwexmhofer' },
    { code: 'short_name_inconsistent', line: 5, key: 'bernd.pfnoexlhofer@schule.example.org' },
    { code: 'short_name_taken', line: 6, key: 'pfb' },
    { code: 'class_invalid', line: 7, key: '5A/B/C/D/E/F/G/H/I/J' },
  ])
  assert.deepEqual(result.rows, [
    { line: 4, email: 'bernd.pfnoexlhofer@schule.example.org', shortName: 'PfB', className: '5A' },
    { line: 8, email: 'sara.pfnaexthuber@schule.example.org', className: '5A' },
  ])
})
