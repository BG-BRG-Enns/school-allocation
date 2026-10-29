import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPeriods, DEFAULT_PERIODS, minutesOf, periodsOfSpan, spanOfPeriods, type Period } from '../src/periods.ts'

test('the default grid is a valid grid: ten periods from 07:35 with the long break after the third', () => {
  assert.deepEqual(checkPeriods(DEFAULT_PERIODS), [])
  assert.deepEqual(DEFAULT_PERIODS.map((p) => p.period), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.deepEqual(DEFAULT_PERIODS[3], { period: 4, starts: '10:30', ends: '11:20' })
  assert.deepEqual(DEFAULT_PERIODS[5], { period: 6, starts: '12:20', ends: '13:10' })
})

test('a grid is numbered without gaps, its times are clock times, and periods neither reverse nor overlap', () => {
  const two: Period[] = [{ period: 1, starts: '07:35', ends: '08:25' }, { period: 2, starts: '08:30', ends: '09:20' }]
  assert.deepEqual(checkPeriods([]), ['no_periods'])
  assert.deepEqual(checkPeriods([two[0] as Period, { ...two[1] as Period, period: 3 }]), ['period_numbering'])
  assert.deepEqual(checkPeriods([{ period: 1, starts: '7:35', ends: '08:25' }]), ['period_time_invalid'])
  assert.deepEqual(checkPeriods([{ period: 1, starts: '07:35', ends: '25:00' }]), ['period_time_invalid'])
  assert.deepEqual(checkPeriods([{ period: 1, starts: '08:25', ends: '07:35' }]), ['period_ends_before_start'])
  assert.deepEqual(checkPeriods([{ period: 1, starts: '08:25', ends: '08:25' }]), ['period_ends_before_start'])
  assert.deepEqual(checkPeriods([two[0] as Period, { period: 2, starts: '08:20', ends: '09:10' }]), ['periods_overlap'])
  // Touching is fine: a grid without breaks.
  assert.deepEqual(checkPeriods([{ period: 1, starts: '08:00', ends: '08:50' }, { period: 2, starts: '08:50', ends: '09:40' }]), [])
})

test('a span of periods is read off the grid and written back as a label', () => {
  assert.deepEqual(spanOfPeriods(DEFAULT_PERIODS, 2, 2), { starts: '08:30', ends: '10:15' })
  assert.deepEqual(spanOfPeriods(DEFAULT_PERIODS, 2, 4), { starts: '08:30', ends: '12:15' })
  assert.equal(spanOfPeriods(DEFAULT_PERIODS, 9, 3), undefined, 'the grid ends at the 10th period')
  assert.equal(spanOfPeriods(DEFAULT_PERIODS, 0, 1), undefined)
  assert.equal(spanOfPeriods(DEFAULT_PERIODS, 2, 0), undefined)
  assert.deepEqual(periodsOfSpan(DEFAULT_PERIODS, '08:30', '10:15'), { from: 2, to: 3 })
  assert.deepEqual(periodsOfSpan(DEFAULT_PERIODS, '11:25', '12:15'), { from: 5, to: 5 })
  assert.equal(periodsOfSpan(DEFAULT_PERIODS, '07:30', '13:10'), undefined, 'a trip leaving before the first period is off the grid')
  assert.equal(periodsOfSpan(DEFAULT_PERIODS, '10:30', '09:20'), undefined, 'an end before the start is no span')
  assert.equal(minutesOf('10:30'), 630)
  assert.ok(Number.isNaN(minutesOf('10.30')))
})
