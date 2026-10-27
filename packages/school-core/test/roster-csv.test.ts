import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRoster } from '../src/roster.ts'
import { CSV_LIMITS, parseCsv, parseRosterCsv, ROSTER_CSV_TEMPLATE } from '../src/roster-csv.ts'

test('the template parses into one student and one teacher, and the batch passes', () => {
  const result = parseRosterCsv(ROSTER_CSV_TEMPLATE)
  assert.deepEqual(result.fileProblems, [])
  assert.deepEqual(result.problems, [])
  assert.deepEqual(result.entries, [
    { kind: 'student', displayName: 'Sara Schülerin', mail: 'sara.schuelerin@schule.example.org', className: '5A', grade: 9, classTeacherMail: 'anna.lehrerin@schule.example.org' },
    { kind: 'teacher', displayName: 'Anna Lehrerin', mail: 'anna.lehrerin@schule.example.org' },
  ])
  assert.deepEqual(checkRoster(result.entries), [])
})

test('comma or semicolon, quotes, doubled quotes, CRLF, a byte-order mark and a trailing blank line are all read', () => {
  const text = '﻿kind,email,given_name,family_name,class,grade\r\n'
    + 'Schüler,"tim@schule.example.org","Tim","Schüler, jun.","5 A",9\r\n'
    + 'Lehrkraft,bernd@schule.example.org,Bernd,"O""Lehrer",,\r\n'
    + '\r\n'
  const result = parseRosterCsv(text)
  assert.deepEqual(result.fileProblems, [])
  assert.deepEqual(result.problems, [])
  assert.deepEqual(result.entries, [
    { kind: 'student', displayName: 'Tim Schüler, jun.', mail: 'tim@schule.example.org', className: '5 A', grade: 9 },
    { kind: 'teacher', displayName: 'Bernd O"Lehrer', mail: 'bernd@schule.example.org' },
  ])
  assert.deepEqual(parseCsv('a;b\n"x;y";z').records, [['a', 'b'], ['x;y', 'z']])
  assert.deepEqual(parseCsv('a,b\n"x\ny",z\n').records, [['a', 'b'], ['x\ny', 'z']])
})

test('a file without the right header, with the wrong field count or a broken quote is refused as a file', () => {
  assert.deepEqual(parseRosterCsv('').fileProblems, [{ code: 'no_header' }])
  assert.deepEqual(parseRosterCsv('name;phone\nA;1').fileProblems, [{ code: 'no_header' }])
  assert.deepEqual(parseRosterCsv('email;given_name;family_name;class;kind\na@b.cd;A;B;5A;student').fileProblems, [{ code: 'missing_column', column: 'grade' }])
  assert.deepEqual(parseRosterCsv('given_name;family_name;class;grade;kind\nA;B;5A;9;student').fileProblems, [{ code: 'missing_column', column: 'email' }])
  assert.deepEqual(parseRosterCsv('email;given_name;family_name;class;grade;kind\n').fileProblems, [{ code: 'empty' }])
  // Blank lines, or lines of separators alone, hold nobody.
  assert.deepEqual(parseRosterCsv('email;given_name;family_name;class;grade;kind\n\n\n').fileProblems, [{ code: 'empty' }])
  assert.deepEqual(parseRosterCsv('email;given_name;family_name;class;grade;kind\r\n;;;;;\r\n').fileProblems, [{ code: 'empty' }])
  assert.deepEqual(parseRosterCsv('email;given_name;family_name;class;grade;kind\na@b.cd;A;B;5A;9').fileProblems, [{ code: 'field_count', line: 2 }])
  assert.deepEqual(parseRosterCsv('email;given_name;family_name;class;grade;kind\n"a@b.cd;A;B;5A;9;student').fileProblems, [{ code: 'malformed_quote', line: 2 }])
  assert.deepEqual(parseRosterCsv('email;given_name;family_name;class;grade;kind\n"a@b.cd"x;A;B;5A;9;student').fileProblems, [{ code: 'malformed_quote', line: 2 }])
  const long = 'x'.repeat(CSV_LIMITS.field + 1)
  assert.deepEqual(parseRosterCsv(`email;given_name;family_name;class;grade;kind\na@b.cd;${long};B;5A;9;student`).fileProblems, [{ code: 'field_too_long', line: 2 }])
  const rows = Array.from({ length: CSV_LIMITS.rows + 1 }, (_, i) => `p${i}@b.cd;A;B;5A;9;student`).join('\n')
  assert.deepEqual(parseRosterCsv(`email;given_name;family_name;class;grade;kind\n${rows}`).fileProblems, [{ code: 'too_many_rows' }])
})

test('a row with an unknown kind or a grade that is not a number is reported with its line; the rest is still read', () => {
  const text = 'email;given_name;family_name;class;grade;kind\n'
    + 'a@b.cd;A;B;5A;9;student\n'
    + 'c@d.ef;C;D;5A;neun;student\n'
    + 'e@f.gh;E;F;;;parent\n'
  const result = parseRosterCsv(text)
  assert.deepEqual(result.fileProblems, [])
  assert.deepEqual(result.problems, [{ code: 'invalid_grade', line: 3 }, { code: 'invalid_kind', line: 4 }])
  assert.deepEqual(result.entries.map((e) => e.mail), ['a@b.cd', 'c@d.ef'])
  // The row with the bad grade has none, which the batch check reports for a student.
  assert.deepEqual(checkRoster(result.entries), [{ code: 'student_without_class', key: 'c@d.ef' }])
})
