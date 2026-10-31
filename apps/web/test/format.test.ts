import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PERIODS } from '@school-allocation/school-core'
import { formatFee, formatSpanOnGrid, instantInSchoolZone, localDateOf, localTimeOf, periodLabel, periodsOnGrid, touchedDates } from '../src/lib/format.ts'

test('a session on the grid is labelled by its periods; off the grid, or over two days, the clock times stand', () => {
  const at = (date: string, time: string) => instantInSchoolZone(date, time)
  assert.equal(periodLabel(DEFAULT_PERIODS, at('2027-06-21', '08:30'), at('2027-06-21', '10:15')), '2.–3. EH')
  assert.equal(periodLabel(DEFAULT_PERIODS, at('2027-06-21', '11:25'), at('2027-06-21', '12:15')), '5. EH')
  assert.equal(periodLabel(DEFAULT_PERIODS, at('2027-06-21', '07:30'), at('2027-06-21', '13:10')), null)
  assert.equal(periodLabel(DEFAULT_PERIODS, at('2027-06-22', '08:30'), at('2027-06-23', '10:15')), null)
  // The numbers behind the label, which the activity's form reads back.
  assert.deepEqual(periodsOnGrid(DEFAULT_PERIODS, at('2027-06-21', '08:30'), at('2027-06-21', '10:15')), { from: 2, to: 3 })
  assert.equal(periodsOnGrid(DEFAULT_PERIODS, at('2027-06-21', '07:30'), at('2027-06-21', '13:10')), null)
  assert.equal(formatSpanOnGrid(DEFAULT_PERIODS, at('2027-06-21', '08:30'), at('2027-06-21', '10:15')), 'Mo., 21.06.2027, 2.–3. EH (08:30 – 10:15)')
  assert.match(formatSpanOnGrid(DEFAULT_PERIODS, at('2027-06-21', '07:30'), at('2027-06-21', '13:10')), /^Mo\., 21\.06\., 07:30 – 13:10$/)
})

test('a wall-clock time of the school is the same instant in every browser, in summer and in winter', () => {
  assert.equal(instantInSchoolZone('2027-06-22', '08:00'), '2027-06-22T06:00:00.000Z')
  assert.equal(instantInSchoolZone('2027-01-22', '08:00'), '2027-01-22T07:00:00.000Z')
  // The night of the change to summer time: 03:30 exists, 02:30 does not and is read on the far side.
  assert.equal(instantInSchoolZone('2027-03-28', '03:30'), '2027-03-28T01:30:00.000Z')
  // Back and forth through the formatters the form reads with.
  const iso = instantInSchoolZone('2027-06-21', '13:00')
  assert.equal(localDateOf(iso), '2027-06-21')
  assert.equal(localTimeOf(iso), '13:00')
})

test('a session touches its days up to its end; an end at midnight belongs to the day before', () => {
  assert.deepEqual(touchedDates('2027-06-22', '2027-06-23', '13:00'), ['2027-06-22', '2027-06-23'])
  assert.deepEqual(touchedDates('2027-06-22', '2027-06-23', '00:00'), ['2027-06-22'])
  assert.deepEqual(touchedDates('2027-06-22', '2027-06-22', '00:00'), ['2027-06-22'])
  assert.deepEqual(touchedDates('2027-06-22', '', '13:00'), ['2027-06-22'])
  assert.deepEqual(touchedDates('2027-06-22', '2027-06-21', '13:00'), ['2027-06-22'])
  assert.deepEqual(touchedDates('', '', '13:00'), [])
})

test('a fee reads as euros with two decimals, nothing as a dash', () => {
  assert.equal(formatFee(1500), '15,00 €')
  assert.equal(formatFee(0), '–')
})
