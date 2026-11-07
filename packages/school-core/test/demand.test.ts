import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkFrame, dayWindow, DEFAULT_PLACE_HEADROOM_PERCENT, demandByDay, demandCells, framePeriods, placeTarget, type ClassSize, type DemandCell, type DemandDay, type OfferedItem } from '../src/demand.ts'
import { DEFAULT_PERIODS } from '../src/periods.ts'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const MONDAY = '2027-06-21'
const TUESDAY = '2027-06-22'
/** Monday starts at instant 0, Tuesday a day later; a clock time of a day as an instant. */
const at = (date: string, time: string): number => (date === MONDAY ? 0 : DAY) + (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * MINUTE
const whole = (date: string): DemandDay => ({ date, frame: null, cells: [{ period: null, startMs: at(date, '00:00'), endMs: at(date, '00:00') + DAY }] })
const framed = (date: string, from: number, to: number): DemandDay => ({ date, frame: { from, to }, cells: demandCells({ from, to }, DEFAULT_PERIODS, (time) => at(date, time), { startMs: at(date, '00:00'), endMs: at(date, '00:00') + DAY }) })
const DAYS = [whole(MONDAY), whole(TUESDAY)]
const classes: ClassSize[] = [
  { className: '1A', grade: 5, students: 20 },
  { className: '1B', grade: 5, students: 20 },
  { className: '2A', grade: 6, students: 30 },
]
/** A session over clock times of a day. */
const session = (date: string, from: string, to: string) => ({ startMs: at(date, from), endMs: at(date, to) })
const open = (places: number, sessions: OfferedItem['sessions'], rules: Partial<OfferedItem> = {}): OfferedItem => ({ fixedClasses: [], eligibleGrades: [], eligibleClasses: [], places, sessions, ...rules })
const onDay = (date: string) => [session(date, '08:30', '12:15')]
/** The one cell of a day counted whole, per grade. */
const cellsOf = (day: ReturnType<typeof demandByDay>[number] | undefined) => day?.grades.map((g) => g.cells[0])

test('without items every student needs a place and nothing is offered', () => {
  assert.deepEqual(demandByDay(DAYS, classes, []), [
    { date: MONDAY, frame: null, periods: [null], grades: [{ grade: 5, students: 40, cells: [{ period: null, fixed: 0, needing: 40, offered: 0 }] }, { grade: 6, students: 30, cells: [{ period: null, fixed: 0, needing: 30, offered: 0 }] }] },
    { date: TUESDAY, frame: null, periods: [null], grades: [{ grade: 5, students: 40, cells: [{ period: null, fixed: 0, needing: 40, offered: 0 }] }, { grade: 6, students: 30, cells: [{ period: null, fixed: 0, needing: 30, offered: 0 }] }] },
  ])
})

test('a class activity takes its class out of the day; its extra places count like any item', () => {
  const trip = open(10, onDay(MONDAY), { fixedClasses: ['1A'] })
  const [monday, tuesday] = demandByDay(DAYS, classes, [trip])
  assert.deepEqual(cellsOf(monday)?.[0], { period: null, fixed: 20, needing: 20, offered: 4 }, '10 places split 20:30 between 1B and 2A, 1A is in it already')
  assert.deepEqual(cellsOf(monday)?.[1], { period: null, fixed: 0, needing: 30, offered: 6 })
  assert.equal(cellsOf(tuesday)?.[0]?.fixed, 0, 'the trip is Monday only')
})

test('places of an item open to several grades split by what each still needs, and go to the only grade left when the others are covered', () => {
  const course = open(18, onDay(MONDAY), { eligibleGrades: [5, 6] })
  const [day] = demandByDay(DAYS, classes, [course])
  // 18 places over 40 fifth graders and 30 sixth graders: 10.3 and 7.7, rounded.
  assert.deepEqual(cellsOf(day)?.map((c) => c?.offered), [10, 8])
  const [covered] = demandByDay(DAYS, classes, [course, open(0, onDay(MONDAY), { fixedClasses: ['1A', '1B'] })])
  assert.deepEqual(cellsOf(covered)?.map((c) => [c?.needing, c?.offered]), [[0, 0], [30, 18]], 'the fifth grade is away, the sixth gets every place')
})

test('the shares of an item add up to its places exactly, whatever the rounding would do', () => {
  // One place over two grades: rounding each half would make two.
  const [day] = demandByDay([whole(MONDAY)], classes, [open(1, onDay(MONDAY))])
  assert.equal(cellsOf(day)?.reduce((sum, c) => sum + (c?.offered ?? 0), 0), 1)
  // Seven places over three classes of 20, 20 and 30: 2, 2, 3 by the largest remainder.
  const [seven] = demandByDay([whole(MONDAY)], classes, [open(7, onDay(MONDAY))])
  assert.deepEqual(cellsOf(seven)?.map((c) => c?.offered), [4, 3])
})

test('eligibility by class narrows the split, an item nobody can rank offers nothing, and a day without items is reported too', () => {
  const only1B = open(12, onDay(TUESDAY), { eligibleClasses: ['1B'] })
  const [, tuesday] = demandByDay(DAYS, classes, [only1B])
  assert.deepEqual(cellsOf(tuesday)?.[0]?.offered, 12)
  assert.deepEqual(cellsOf(tuesday)?.[1]?.offered, 0)
  const noPlaces = open(0, onDay(TUESDAY))
  assert.deepEqual(cellsOf(demandByDay([whole(TUESDAY)], classes, [noPlaces])[0])?.map((c) => c?.offered), [0, 0])
  assert.deepEqual(cellsOf(demandByDay([whole(MONDAY)], classes, [only1B])[0])?.map((c) => c?.offered), [0, 0])
})

test('a framed day is counted per period: an activity counts in every period it touches, a part of one included', () => {
  // The document's table: 100 students, frame 2–6, the finale for all in the 6th; courses of 140, 125, 90, 60 places over the periods.
  const lower: ClassSize[] = [{ className: '1A', grade: 5, students: 50 }, { className: '1B', grade: 5, students: 50 }]
  const finale = open(0, [session(MONDAY, '12:20', '13:10')], { fixedClasses: ['1A', '1B'] })
  const items = [
    finale,
    open(140, [session(MONDAY, '08:30', '09:20')]),
    open(125, [session(MONDAY, '09:25', '10:15')]),
    open(90, [session(MONDAY, '10:30', '11:20')]),
    // Ends at 11:00: touches the 4th period (10:30–11:20) too, so it counts there.
    open(60, [session(MONDAY, '10:30', '12:15')]),
  ]
  const [day] = demandByDay([framed(MONDAY, 2, 6)], lower, items)
  assert.deepEqual(day?.periods, [2, 3, 4, 5, 6])
  assert.deepEqual(day?.frame, { from: 2, to: 6 })
  assert.deepEqual(day?.grades[0]?.cells.map((c) => [c.needing, c.offered]), [[100, 140], [100, 125], [100, 150], [100, 60], [0, 0]])
  // A trip until 11:00 takes its class out of the 2nd to the 4th period and gives it back from the 5th.
  const trip = open(0, [session(MONDAY, '08:00', '11:00')], { fixedClasses: ['1A'] })
  const [withTrip] = demandByDay([framed(MONDAY, 2, 6)], lower, [trip])
  assert.deepEqual(withTrip?.grades[0]?.cells.map((c) => [c.fixed, c.needing]), [[50, 50], [50, 50], [50, 50], [0, 100], [0, 100]])
})

test('an activity overlapping a class\'s class activity offers that class nothing, in any cell: its students never rank it', () => {
  // 1A is on a trip in the 2nd period; a course over the 2nd to the 5th period overlaps it, so 1A is never offered it, back from the trip or not.
  const trip = open(0, [session(MONDAY, '08:30', '09:20')], { fixedClasses: ['1A'] })
  const course = open(20, [session(MONDAY, '08:30', '12:15')], { eligibleGrades: [5] })
  const [day] = demandByDay([framed(MONDAY, 2, 5)], classes, [trip, course])
  assert.deepEqual(day?.grades[0]?.cells.map((c) => [c.fixed, c.needing, c.offered]), [[20, 20, 20], [0, 40, 20], [0, 40, 20], [0, 40, 20]], 'every place goes to 1B, in every period')
  // A course after the trip is for both classes again.
  const later = open(20, [session(MONDAY, '10:30', '12:15')], { eligibleGrades: [5] })
  const [afterwards] = demandByDay([framed(MONDAY, 2, 5)], classes, [trip, later])
  assert.deepEqual(afterwards?.grades[0]?.cells.map((c) => c.offered), [0, 0, 20, 20])
})

test('a multi-grade item splits per cell by the need left there; a session over midnight touches both days\' cells', () => {
  const course = open(20, [session(MONDAY, '08:30', '10:15')], { eligibleGrades: [5, 6] })
  const away = open(0, [session(MONDAY, '08:30', '09:20')], { fixedClasses: ['1A', '1B'] })
  const [day] = demandByDay([framed(MONDAY, 2, 3)], classes, [course, away])
  // The fifth grade is away in the 2nd period and the course overlaps that, so its students never rank it: every place is the sixth grade's, in both periods.
  assert.deepEqual(day?.grades.map((g) => g.cells.map((c) => c.offered)), [[0, 0], [20, 20]])
  // A course after the fifth grade is back splits in the 3rd period per class: 5.7 + 5.7 + 8.6, rounded by the largest remainders to 6 + 6 + 8.
  const [later] = demandByDay([framed(MONDAY, 2, 3)], classes, [open(20, [session(MONDAY, '09:25', '10:15')], { eligibleGrades: [5, 6] }), away])
  assert.deepEqual(later?.grades.map((g) => g.cells.map((c) => c.offered)), [[0, 12], [0, 8]], 'nothing in the 2nd period, which the course does not touch')
  const overnight = open(10, [{ startMs: at(MONDAY, '20:00'), endMs: at(TUESDAY, '09:00') }])
  const [monday, tuesday] = demandByDay([framed(MONDAY, 2, 6), framed(TUESDAY, 2, 6)], classes, [overnight])
  assert.deepEqual(monday?.grades[0]?.cells.map((c) => c.offered), [0, 0, 0, 0, 0], 'Monday evening is outside the frame')
  assert.deepEqual(tuesday?.grades[0]?.cells.map((c) => c.offered), [6, 0, 0, 0, 0], 'Tuesday\'s 2nd period is touched until nine')
})

test('the cells of a day follow the grid; without a frame, or with one the grid lost, the day counts its window whole; a frame is checked against the grid', () => {
  const toMs = (time: string) => at(MONDAY, time)
  const day = { startMs: 0, endMs: DAY }
  // The window of a day without a frame: the grid's first period to its last, 07:35 to 16:50, not the calendar day.
  assert.deepEqual(demandCells(null, DEFAULT_PERIODS, toMs, day), [{ period: null, startMs: at(MONDAY, '07:35'), endMs: at(MONDAY, '16:50') }])
  assert.deepEqual(demandCells({ from: 2, to: 3 }, DEFAULT_PERIODS, toMs, day) satisfies DemandCell[], [{ period: 2, startMs: at(MONDAY, '08:30'), endMs: at(MONDAY, '09:20') }, { period: 3, startMs: at(MONDAY, '09:25'), endMs: at(MONDAY, '10:15') }])
  assert.deepEqual(demandCells({ from: 12, to: 14 }, DEFAULT_PERIODS, toMs, day), [{ period: null, startMs: at(MONDAY, '07:35'), endMs: at(MONDAY, '16:50') }])
  // Only a grid without periods, which its own check refuses, leaves the calendar day.
  assert.deepEqual(demandCells(null, [], toMs, day), [{ period: null, startMs: 0, endMs: DAY }])
  assert.deepEqual(framePeriods({ from: 9, to: 12 }, DEFAULT_PERIODS).map((p) => p.period), [9, 10])
  // The window: the frame's first period to its last, else the grid's day.
  assert.deepEqual(dayWindow({ from: 2, to: 5 }, DEFAULT_PERIODS), { starts: '08:30', ends: '12:15' })
  assert.deepEqual(dayWindow(null, DEFAULT_PERIODS), { starts: '07:35', ends: '16:50' })
  assert.deepEqual(dayWindow({ from: 12, to: 14 }, DEFAULT_PERIODS), { starts: '07:35', ends: '16:50' })
  assert.equal(dayWindow(null, []), null)
  assert.equal(checkFrame({ from: 2, to: 6 }, DEFAULT_PERIODS), undefined)
  assert.equal(checkFrame({ from: 6, to: 2 }, DEFAULT_PERIODS), 'frame_order')
  assert.equal(checkFrame({ from: 2, to: 11 }, DEFAULT_PERIODS), 'frame_period_unknown')
  assert.equal(checkFrame({ from: 1.5, to: 3 }, DEFAULT_PERIODS), 'frame_order')
})

test('the target is the need and the headroom on top, rounded up to a whole place', () => {
  assert.equal(DEFAULT_PLACE_HEADROOM_PERCENT, 20)
  assert.equal(placeTarget(100, 20), 120)
  assert.equal(placeTarget(41, 20), 50, '49.2 places are 50')
  assert.equal(placeTarget(0, 20), 0)
  assert.equal(placeTarget(37, 0), 37)
})

test('students out of a class activity need places like a class without it; whoever is placed directly needs none where their activity is; each student counts once', () => {
  const away = (...ids: string[]) => ids.map((personId) => ({ className: '1A', personId }))
  const placedOf = (className: string, beside: boolean, ...ids: string[]) => ids.map((personId) => ({ className, personId, beside }))
  // 1A (20) is on a trip on Monday; three of them do not go. 1B needs its 20 places as ever.
  const trip = open(0, onDay(MONDAY), { fixedClasses: ['1A'], away: away('a', 'b', 'c') })
  const grade5 = (items: OfferedItem[]) => cellsOf(demandByDay(DAYS, classes, items)[0])?.[0]
  assert.deepEqual(grade5([trip]), { period: null, fixed: 17, needing: 23, offered: 0 })
  // A course for the 5th grade in the trip's hours is for 1B and for the three of 1A.
  assert.deepEqual(grade5([trip, open(10, onDay(MONDAY), { eligibleGrades: [5] })]), { period: null, fixed: 17, needing: 23, offered: 10 })
  // Two of the three are placed directly into a workshop: one of 1A is left, and 1B's 20.
  const workshop = open(3, onDay(MONDAY), { eligibleGrades: [5], placed: placedOf('1A', false, 'a', 'b') })
  assert.deepEqual(grade5([trip, workshop]), { period: null, fixed: 19, needing: 21, offered: 3 })
  // Placed in the morning and in the afternoon of a day counted whole, a student is still one student.
  const afternoon = open(0, [session(MONDAY, '13:15', '15:00')], { placed: placedOf('1A', false, 'a') })
  assert.deepEqual(grade5([trip, workshop, afternoon]), { period: null, fixed: 19, needing: 21, offered: 3 })
  assert.deepEqual(grade5([open(0, onDay(MONDAY), { placed: placedOf('1B', false, 'x') }), open(0, [session(MONDAY, '13:15', '15:00')], { placed: placedOf('1B', false, 'x') })]), { period: null, fixed: 1, needing: 39, offered: 0 })
  // Placed beside the trip, a student of 1A is counted with their class: nothing changes. Of a class without a class activity, they need no place.
  assert.deepEqual(grade5([open(0, onDay(MONDAY), { fixedClasses: ['1A'] }), open(0, onDay(MONDAY), { placed: [...placedOf('1A', true, 'a'), ...placedOf('1B', true, 'w', 'x', 'y', 'z')] })]), { period: null, fixed: 24, needing: 16, offered: 0 })
  // Away from two class activities of one day, a student needs one place, not two; never more than the class.
  const morningTrip = open(0, [session(MONDAY, '08:30', '10:15')], { fixedClasses: ['1A'], away: away('a') })
  const afternoonTrip = open(0, [session(MONDAY, '13:15', '15:00')], { fixedClasses: ['1A'], away: away('a', 'b') })
  assert.deepEqual(grade5([morningTrip, afternoonTrip]), { period: null, fixed: 18, needing: 22, offered: 0 })
})

test('an activity that overlaps a class activity is for those of the class who are out of it, in every period it touches, also after the class is back', () => {
  // Monday framed from the 2nd to the 5th period. 1A is away in the 2nd and 3rd; a course for 1A alone runs from the 2nd to the 5th.
  const day = [framed(MONDAY, 2, 5)]
  const course = open(10, [session(MONDAY, '08:30', '12:15')], { eligibleClasses: ['1A'] })
  const offered = (items: OfferedItem[]) => demandByDay(day, classes, items)[0]?.grades[0]?.cells.map((cell) => cell.offered)
  // Everyone on the trip: the course starts during it, so nobody of 1A ranks it, in the afternoon either.
  assert.deepEqual(offered([open(0, [session(MONDAY, '08:30', '10:15')], { fixedClasses: ['1A'] }), course]), [0, 0, 0, 0])
  // One of 1A does not go: the course is theirs, in all four periods.
  const trip = open(0, [session(MONDAY, '08:30', '10:15')], { fixedClasses: ['1A'], away: [{ className: '1A', personId: 'a' }] })
  assert.deepEqual(offered([trip, course]), [10, 10, 10, 10])
  // Placed into something else in the 4th period, the course overlaps their placement: they never rank it, in any period.
  const rehearsal = open(0, [session(MONDAY, '10:30', '11:20')], { placed: [{ className: '1A', personId: 'a', beside: false }] })
  assert.deepEqual(offered([trip, course, rehearsal]), [0, 0, 0, 0])
  // The same without a class activity: of 1B's twenty, the one placed in the 2nd period is not whom a course over the 2nd and 3rd is for.
  const early = open(0, [session(MONDAY, '08:30', '09:20')], { placed: [{ className: '1B', personId: 'x', beside: false }] })
  const long = open(30, [session(MONDAY, '08:30', '10:15')], { eligibleClasses: ['1B'] })
  const cells = demandByDay(day, classes, [early, long])[0]?.grades[0]?.cells.map((cell) => [cell.needing, cell.offered])
  assert.deepEqual(cells, [[39, 30], [40, 30], [40, 0], [40, 0]], 'he needs a place again in the 3rd period, and the course is not it; its places are the other nineteen\'s')
})
