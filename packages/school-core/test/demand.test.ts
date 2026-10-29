import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demandByDay, type ClassSize, type OfferedItem } from '../src/demand.ts'

const DAYS = ['2027-06-21', '2027-06-22']
const classes: ClassSize[] = [
  { className: '1A', grade: 5, students: 20 },
  { className: '1B', grade: 5, students: 20 },
  { className: '2A', grade: 6, students: 30 },
]
const open = (places: number, dates: string[], rules: Partial<OfferedItem> = {}): OfferedItem => ({ fixedClasses: [], eligibleGrades: [], eligibleClasses: [], places, dates, ...rules })

test('without items every student needs a place and nothing is offered', () => {
  assert.deepEqual(demandByDay(DAYS, classes, []), [
    { date: '2027-06-21', grades: [{ grade: 5, students: 40, fixed: 0, needing: 40, offered: 0 }, { grade: 6, students: 30, fixed: 0, needing: 30, offered: 0 }] },
    { date: '2027-06-22', grades: [{ grade: 5, students: 40, fixed: 0, needing: 40, offered: 0 }, { grade: 6, students: 30, fixed: 0, needing: 30, offered: 0 }] },
  ])
})

test('a class activity takes its class out of the day; its extra places count like any item', () => {
  const trip = open(10, ['2027-06-21'], { fixedClasses: ['1A'] })
  const [monday, tuesday] = demandByDay(DAYS, classes, [trip])
  assert.deepEqual(monday?.grades[0], { grade: 5, students: 40, fixed: 20, needing: 20, offered: 4 }, '10 places split 20:30 between 1B and 2A, 1A is in it already')
  assert.deepEqual(monday?.grades[1], { grade: 6, students: 30, fixed: 0, needing: 30, offered: 6 })
  assert.equal(tuesday?.grades[0]?.fixed, 0, 'the trip is Monday only')
})

test('places of an item open to several grades split by what each still needs, and go to the only grade left when the others are covered', () => {
  const course = open(18, ['2027-06-21'], { eligibleGrades: [5, 6] })
  const [day] = demandByDay(DAYS, classes, [course])
  // 18 places over 40 fifth graders and 30 sixth graders: 10.3 and 7.7, rounded.
  assert.deepEqual(day?.grades.map((g) => g.offered), [10, 8])
  const [covered] = demandByDay(DAYS, classes, [course, open(0, ['2027-06-21'], { fixedClasses: ['1A', '1B'] })])
  assert.deepEqual(covered?.grades.map((g) => [g.needing, g.offered]), [[0, 0], [30, 18]], 'the fifth grade is away, the sixth gets every place')
})

test('eligibility by class narrows the split, an item nobody can rank offers nothing, and a day without items is reported too', () => {
  const only1B = open(12, ['2027-06-22'], { eligibleClasses: ['1B'] })
  const [, tuesday] = demandByDay(DAYS, classes, [only1B])
  assert.deepEqual(tuesday?.grades[0]?.offered, 12)
  assert.deepEqual(tuesday?.grades[1]?.offered, 0)
  const noPlaces = open(0, ['2027-06-22'])
  assert.deepEqual(demandByDay(['2027-06-22'], classes, [noPlaces])[0]?.grades.map((g) => g.offered), [0, 0])
  assert.deepEqual(demandByDay(['2027-06-23'], classes, [only1B])[0]?.grades.map((g) => g.offered), [0, 0])
})
