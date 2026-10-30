import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSchoolYear, retentionEndsAt, schoolYearOf, yearsOf } from '../src/school-year.ts'

test('September starts the school year; August still belongs to the one before', () => {
  assert.equal(schoolYearOf(2026, 9), '2026/27')
  assert.equal(schoolYearOf(2027, 6), '2026/27')
  assert.equal(schoolYearOf(2027, 8), '2026/27')
  assert.equal(schoolYearOf(2027, 9), '2027/28')
  assert.equal(schoolYearOf(2099, 10), '2099/00')
  assert.throws(() => schoolYearOf(2026, 0), RangeError)
  assert.throws(() => schoolYearOf(2026, 13), RangeError)
  assert.throws(() => schoolYearOf(2026.5, 1), RangeError)
})

test('a school year is written as 2026/27, with the second year following the first', () => {
  assert.equal(isSchoolYear('2026/27'), true)
  assert.equal(isSchoolYear('2099/00'), true)
  assert.equal(isSchoolYear('2026/28'), false)
  assert.equal(isSchoolYear('2026/2027'), false)
  assert.equal(isSchoolYear('26/27'), false)
  assert.equal(isSchoolYear('1999/00'), false)
  assert.equal(isSchoolYear(2026), false)
  assert.equal(isSchoolYear(null), false)
})

test('the retention of a school year ends a year after it does: the first of September of the year after the second', () => {
  assert.deepEqual(yearsOf('2026/27'), [2026, 2027])
  assert.equal(retentionEndsAt('2026/27'), '2028-08-31T22:00:00.000Z')
  assert.equal(retentionEndsAt('2023/24'), '2025-08-31T22:00:00.000Z')
  assert.throws(() => yearsOf('2026'), RangeError)
})
