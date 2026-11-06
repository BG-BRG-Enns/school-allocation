import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allClassConflicts, classConflicts } from '../src/class-conflicts.ts'
import { demandByDay, demandCells, itemShares, type ClassSize, type DemandDay, type OfferedItem } from '../src/demand.ts'
import { addedCells, describeCells, gateCells, gateRefused, gradesOpenTo, servedCells } from '../src/offer-gate.ts'
import { DEFAULT_PERIODS } from '../src/periods.ts'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const MONDAY = '2027-06-21'
const at = (time: string): number => (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * MINUTE
const framed = (from: number, to: number): DemandDay => ({ date: MONDAY, frame: { from, to }, cells: demandCells({ from, to }, DEFAULT_PERIODS, at, { startMs: 0, endMs: DAY }) })
const whole: DemandDay = { date: MONDAY, frame: null, cells: [{ period: null, startMs: 0, endMs: DAY }] }
const session = (from: string, to: string) => ({ startMs: at(from), endMs: at(to) })
const open = (places: number, sessions: OfferedItem['sessions'], rules: Partial<OfferedItem> = {}): OfferedItem => ({ fixedClasses: [], eligibleGrades: [], eligibleClasses: [], places, sessions, ...rules })
// The document's lower school of 100 students, and the 8th and 9th grade beside it.
const classes: ClassSize[] = [
  { className: '1A', grade: 5, students: 50 }, { className: '1B', grade: 5, students: 50 },
  { className: '4A', grade: 8, students: 30 }, { className: '5A', grade: 9, students: 30 },
]

test('an activity serves every cell it touches for every grade it is open to; the grades come from its rules', () => {
  const days = [framed(2, 6)]
  assert.deepEqual(gradesOpenTo(open(10, []), classes), [5, 8, 9])
  assert.deepEqual(gradesOpenTo(open(10, [], { eligibleGrades: [9, 12] }), classes), [9])
  assert.deepEqual(gradesOpenTo(open(10, [], { eligibleClasses: ['1B', '4A'] }), classes), [5, 8])
  assert.deepEqual(gradesOpenTo(open(10, [], { eligibleGrades: [5, 9], eligibleClasses: ['1A'] }), classes), [5], 'both lists hold: no ninth grader may choose it')
  const served = servedCells(open(10, [session('08:30', '10:15')], { eligibleGrades: [5] }), days, classes)
  assert.deepEqual(served, [{ date: MONDAY, period: 2, grade: 5 }, { date: MONDAY, period: 3, grade: 5 }])
  // Outside the frame: no cell at all.
  assert.deepEqual(servedCells(open(10, [session('13:15', '14:05')]), days, classes), [])
  // A day counted whole has one cell per grade.
  assert.deepEqual(servedCells(open(10, [session('13:15', '14:05')], { eligibleGrades: [8] }), [whole], classes).map((c) => c.period), [null])
})

test('an activity of its teachers alone (no places, no class) serves no cell, so the gate never refuses it; a class activity without extra places still names its cells', () => {
  const days = [framed(2, 6)]
  const duty = open(0, [session('08:30', '10:15')])
  assert.deepEqual(servedCells(duty, days, classes), [])
  assert.equal(gateRefused(gateCells(servedCells(duty, days, classes), demandByDay(days, classes, [open(500, [session('08:30', '10:15')])]), 50)), false)
  assert.deepEqual(servedCells(open(0, [session('08:30', '09:20')], { fixedClasses: ['5A'], eligibleGrades: [9] }), days, classes), [{ date: MONDAY, period: 2, grade: 9 }])
})

test('the document\'s examples: refused only when every served cell has reached its target; longer, or another grade, lets it through', () => {
  const days = [framed(2, 6)]
  // The finale for all in the 6th; the lower school's target reached in the 2nd and 3rd period, short in the 4th and 5th; the 8th and 9th short everywhere but the 6th.
  const finale = open(0, [session('12:20', '13:10')], { fixedClasses: ['1A', '1B', '4A', '5A'] })
  const lower = [open(140, [session('08:30', '09:20')], { eligibleGrades: [5] }), open(125, [session('09:25', '10:15')], { eligibleGrades: [5] }), open(90, [session('10:30', '11:20')], { eligibleGrades: [5] }), open(60, [session('11:25', '12:15')], { eligibleGrades: [5] })]
  const demand = demandByDay(days, classes, [finale, ...lower])
  const judge = (item: OfferedItem) => gateCells(servedCells(item, days, classes), demand, 20)
  const early = open(20, [session('08:30', '10:15')], { eligibleGrades: [5] })
  assert.equal(gateRefused(judge(early)), true, '2nd–3rd period for the lower school: every cell reached')
  assert.deepEqual(judge(early).map((c) => [c.period, c.needing, c.target, c.offered, c.reached]), [[2, 100, 120, 140, true], [3, 100, 120, 125, true]])
  assert.equal(gateRefused(judge(open(20, [session('08:30', '10:15')], { eligibleGrades: [5, 8, 9] }))), false, 'the 8th and 9th still lack places in the 2nd and 3rd')
  assert.equal(gateRefused(judge(open(20, [session('09:25', '12:15')], { eligibleGrades: [5] }))), false, 'brings places into the 4th and 5th')
  assert.equal(gateRefused(judge(open(20, [session('12:20', '13:10')]))), true, 'the 6th period: nobody is free, need 0 is reached')
  assert.equal(gateRefused(judge(open(20, [session('08:30', '12:15')], { eligibleGrades: [5] }))), false, 'a 2nd–3rd period course made longer is allowed')
  assert.equal(gateRefused(judge(open(20, [session('14:10', '15:00')]))), false, 'serving no cell, nothing is judged')
})

test('a resubmission is judged by the cells that get more places: new cells, or every cell when the places grew', () => {
  const days = [framed(2, 6)]
  const before = servedCells(open(20, [session('08:30', '10:15')], { eligibleGrades: [5] }), days, classes)
  const wider = servedCells(open(20, [session('08:30', '10:15')], { eligibleGrades: [5, 8] }), days, classes)
  assert.deepEqual(addedCells(before, wider, false), [{ date: MONDAY, period: 2, grade: 8 }, { date: MONDAY, period: 3, grade: 8 }])
  const longer = servedCells(open(20, [session('08:30', '11:20')], { eligibleGrades: [5] }), days, classes)
  assert.deepEqual(addedCells(before, longer, false).map((c) => c.period), [4])
  assert.deepEqual(addedCells(before, before, false), [], 'a correction without more places is judged by nothing')
  assert.equal(addedCells(before, before, true).length, before.length, 'more places: every cell again')
})

test('the cells are described as runs of periods per day and grade, a day counted whole without periods', () => {
  const days = [framed(2, 6)]
  const cells = servedCells(open(20, [session('08:30', '10:15'), session('11:25', '12:15')], { eligibleGrades: [5, 9] }), days, classes)
  assert.deepEqual(describeCells(cells, demandByDay(days, classes, [])), [
    { date: MONDAY, grade: 5, periods: [{ from: 2, to: 3 }, { from: 5, to: 5 }] },
    { date: MONDAY, grade: 9, periods: [{ from: 2, to: 3 }, { from: 5, to: 5 }] },
  ])
  assert.deepEqual(describeCells(servedCells(open(20, [session('08:30', '10:15')], { eligibleGrades: [8] }), [whole], classes), demandByDay([whole], classes, [])), [{ date: MONDAY, grade: 8, periods: null }])
})

test('the shares per item say where its places go, and what a cell offers without it', () => {
  const days = [framed(2, 3)]
  const course = open(20, [session('08:30', '10:15')], { eligibleGrades: [5, 8] })
  const shares = itemShares(days, classes, [course])
  // 20 places over 100 fifth graders and 30 eighth graders, per class 50, 50, 30: 7.7, 7.7, 4.6 → 8, 8, 4.
  assert.deepEqual(shares.map((s) => [s.period, s.grade, s.places]), [[2, 5, 16], [2, 8, 4], [3, 5, 16], [3, 8, 4]])
  assert.ok(shares.every((s) => s.item === course))
  assert.deepEqual(itemShares(days, classes, [open(0, [session('08:30', '10:15')])]), [], 'no places, no share')
})

test('two class activities naming one class with overlapping sessions conflict, with the span they share; apart in time, or other classes, they do not', () => {
  const hike = { id: 'hike', fixedClasses: ['5A'], sessions: [session('09:00', '11:00')] }
  const finale = { id: 'finale', fixedClasses: ['1A', '5A'], sessions: [session('10:30', '13:10')] }
  const later = { id: 'later', fixedClasses: ['5A'], sessions: [session('11:00', '12:00')] }
  const other = { id: 'other', fixedClasses: ['1B'], sessions: [session('09:00', '11:00')] }
  assert.deepEqual(classConflicts(hike, [finale, later, other]), [{ className: '5A', itemId: 'finale', startMs: at('10:30'), endMs: at('11:00') }])
  assert.deepEqual(classConflicts({ id: 'course', fixedClasses: [], sessions: [session('09:00', '11:00')] }, [finale]), [], 'no class, no conflict')
  assert.deepEqual(classConflicts(hike, [hike]), [], 'never with itself')
  assert.deepEqual(allClassConflicts([hike, finale, later, other]).map((c) => [c.className, c.itemId]), [['5A', 'finale'], ['5A', 'later']], 'each pair once: the hike with the finale, the finale with the later one')
  // A trip over two days conflicts on each of them.
  const trip = { id: 'trip', fixedClasses: ['1A'], sessions: [{ startMs: at('08:00'), endMs: DAY + at('13:00') }] }
  assert.equal(classConflicts(trip, [finale]).length, 1)
})
