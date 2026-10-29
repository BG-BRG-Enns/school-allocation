import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datesBetween, datesOfSpan, instantOf, localDateOf } from '../lib/time.ts'

test('an instant falls on its local date in Vienna, across the UTC midnight and the summer time change', () => {
  assert.equal(localDateOf(Date.UTC(2027, 5, 21, 22, 30)), '2027-06-22') // 00:30 CEST
  assert.equal(localDateOf(Date.UTC(2027, 5, 21, 21, 59)), '2027-06-21') // 23:59 CEST
  assert.equal(localDateOf(Date.UTC(2027, 0, 31, 23, 30)), '2027-02-01') // 00:30 CET
})

test('a span touches every local date from its start to its end; an end at midnight belongs to the day before', () => {
  const tue8 = Date.UTC(2027, 5, 22, 6) // Tuesday 08:00 CEST
  const wed13 = Date.UTC(2027, 5, 23, 11)
  assert.deepEqual(datesOfSpan(tue8, wed13), ['2027-06-22', '2027-06-23'])
  assert.deepEqual(datesOfSpan(tue8, Date.UTC(2027, 5, 22, 22)), ['2027-06-22']) // until 24:00 CEST
  assert.deepEqual(datesOfSpan(tue8, Date.UTC(2027, 5, 22, 22, 0, 0, 1)), ['2027-06-22', '2027-06-23'])
  assert.deepEqual(datesOfSpan(tue8, tue8), ['2027-06-22'])
  assert.deepEqual(datesBetween('2027-06-30', '2027-07-02'), ['2027-06-30', '2027-07-01', '2027-07-02'])
  assert.deepEqual(datesBetween('2027-07-02', '2027-06-30'), [])
  assert.throws(() => datesBetween('2027-6-30', '2027-07-02'), RangeError)
})

test('an instant is parsed from ISO 8601 and nothing else', () => {
  assert.equal(instantOf('2027-06-22T08:00:00+02:00'), Date.UTC(2027, 5, 22, 6))
  assert.equal(instantOf('not a time'), undefined)
})
