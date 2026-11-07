import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PERIODS, demandByDay, type ClassSize, type DayDemand, type GateCell } from '@school-allocation/school-core'
import { bringsText, cellsText, daysOf, offerOf, refusalText } from '../src/lib/offer-cells.ts'

const MONDAY = '2027-06-21'
const classes: ClassSize[] = [{ className: '1A', grade: 5, students: 50 }, { className: '1B', grade: 5, students: 50 }, { className: '5A', grade: 9, students: 30 }]
const framed: DayDemand = { date: MONDAY, frame: { from: 2, to: 6 }, periods: [2, 3, 4, 5, 6], grades: [] }
const item = (id: string, places: number, from: string, to: string, grades: number[] = []) => ({ id, ...offerOf({ places, fixedClasses: [], eligibleGrades: grades, eligibleClasses: [], sessions: [{ startsAt: `${MONDAY}T${from}:00+02:00`, endsAt: `${MONDAY}T${to}:00+02:00` }] }) })

test('the days of the demand get their cells from the grid, in the school\'s zone: a framed day its periods, an unframed one the grid\'s day', () => {
  const [day] = daysOf([framed], DEFAULT_PERIODS)
  assert.deepEqual(day?.cells.map((c) => c.period), [2, 3, 4, 5, 6])
  assert.equal(new Date(day?.cells[0]?.startMs ?? 0).toISOString(), '2027-06-21T06:30:00.000Z', '08:30 in summer time')
  const [whole] = daysOf([{ ...framed, frame: null, periods: [null] }], DEFAULT_PERIODS)
  assert.deepEqual(whole?.cells.map((c) => [c.period, new Date(c.startMs).toISOString(), new Date(c.endMs).toISOString()]), [[null, '2027-06-21T05:35:00.000Z', '2027-06-21T14:50:00.000Z']], '07:35 – 16:50, the first period to the last')
})

test('cells are said per day: the grades with their runs of periods, a day counted whole without them', () => {
  const described = [{ date: MONDAY, grade: 5, periods: [{ from: 2, to: 3 }, { from: 5, to: 5 }] }, { date: MONDAY, grade: 9, periods: null }]
  assert.equal(cellsText(described), 'Mo., 21.06.2027: 5. Schulstufe, 2.–3. EH + 5. EH; 9. Schulstufe')
  assert.equal(cellsText(described, true), 'Mo., 21.06.2027: 5. Schulstufe, 2. und 3. EH + 5. EH; 9. Schulstufe')
})

test('what an activity brings: the cells short of the target once its own share is taken off; nothing to say outside every frame', () => {
  const days = daysOf([framed], DEFAULT_PERIODS)
  // Two courses in the 2nd period for the lower school: 130 places where 100 students need 120; the 20-place one lifted the cell over the target.
  const big = item('big', 110, '08:30', '09:20', [5])
  const small = item('small', 20, '08:30', '09:20', [5])
  const demand = demandByDay(days, classes, [big, small])
  const shares = [{ itemId: 'small', date: MONDAY, period: 2, grade: 5, places: 20 }, { itemId: 'big', date: MONDAY, period: 2, grade: 5, places: 110 }]
  assert.equal(bringsText(small, demand, days, classes, shares, 20), 'hilft bei: Mo., 21.06.2027: 5. Schulstufe, 2. EH', 'without it the cell offers 110 of 120')
  // A third course there, its ten places in the cell, brings places only where the target is reached; one the split gives no places anywhere has nothing to say.
  const third = item('third', 10, '08:30', '09:20', [5])
  assert.equal(bringsText(third, demand, days, classes, [...shares, { itemId: 'third', date: MONDAY, period: 2, grade: 5, places: 10 }], 20), 'genug Plätze')
  assert.equal(bringsText(third, demand, days, classes, shares, 20), null, 'no share: no cell it brings places to')
  assert.equal(bringsText(item('late', 10, '13:15', '14:05'), demand, days, classes, shares, 20), null)
})

test('the refusal says, per day, the periods every grade of the activity has reached its target in, spoken; a day counted whole without them', () => {
  const cells: GateCell[] = [
    { date: MONDAY, period: 2, grade: 5, needing: 100, target: 120, offered: 140, reached: true },
    { date: MONDAY, period: 3, grade: 5, needing: 100, target: 120, offered: 125, reached: true },
    { date: MONDAY, period: 2, grade: 9, needing: 30, target: 36, offered: 40, reached: true },
    { date: MONDAY, period: 3, grade: 9, needing: 30, target: 36, offered: 40, reached: true },
  ]
  assert.deepEqual(refusalText(cells, [framed]), ['Am Mo., 21.06.2027 gibt es in der 2. und 3. EH für alle Schulstufen dieser Aktivität schon genug Plätze.'])
  assert.deepEqual(refusalText([{ date: MONDAY, period: null, grade: 5, needing: 100, target: 120, offered: 140, reached: true }], [{ date: MONDAY, periods: [null] }]), ['Am Mo., 21.06.2027 gibt es für alle Schulstufen dieser Aktivität schon genug Plätze.'])
})
