import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { checkAllocationInput, compilePass, prepareStudent, prepareStudents, solverItems } from '../src/allocation-compile.ts'
import { explainStudent, summarizeAllocation } from '../src/allocation-explain.ts'
import { fnv1a32, levelNames, tieWeight, type AllocationInput, type AllocationItem, type AllocationResult, type AllocationStudent, type PassResult } from '../src/allocation-model.ts'
import { assembleAssignments, cancelledOf, recomputeLevels, validateAllocation } from '../src/allocation-validate.ts'
import type { ItemRules, SessionInput } from '../src/catalogue.ts'

// The week of the decision record (docs/open-decisions.md D-24): Monday
// 2027-06-21 to Wednesday, Vienna time (UTC+2 in June). Classes 5A and 5B
// are in Vienna from Tuesday 08:00 to Wednesday 13:00 and choose Monday
// only; 6A chooses every day.
const DAYS = ['2027-06-21', '2027-06-22', '2027-06-23']
const at = (day: number, hour: number) => Date.UTC(2027, 5, 21 + day, hour - 2)
const session = (day: number, from: number, to: number, minutes: number, extra: { day: number, minutes: number }[] = []): SessionInput => ({
  startMs: at(day, from),
  endMs: at(extra.at(-1)?.day ?? day, to),
  dates: [DAYS[day] as string, ...extra.map((e) => DAYS[e.day] as string)],
  credits: [{ date: DAYS[day] as string, minutes }, ...extra.map((e) => ({ date: DAYS[e.day] as string, minutes: e.minutes }))],
})
const open: ItemRules = { fixedClasses: [], eligibleGrades: [], eligibleClasses: [], places: 20, minParticipants: 0, cancellableBelowMin: true }
const item = (id: string, sessions: SessionInput[], rules: Partial<ItemRules> = {}, feeCents = 0): AllocationItem => ({ id, feeCents, rules: { ...open, ...rules }, sessions })

const morning = (id: string, fee = 0, rules: Partial<ItemRules> = {}) => item(id, [session(0, 8, 11, 180)], rules, fee)
const afternoon = (id: string, rules: Partial<ItemRules> = {}) => item(id, [session(0, 11, 13, 120)], rules)
const ITEMS: AllocationItem[] = [
  item('trip', [session(1, 8, 13, 360, [{ day: 2, minutes: 300 }])], { fixedClasses: ['5A', '5B'], places: 2, cancellableBelowMin: false }, 2000),
  item('mondayclass', [session(0, 8, 13, 300)], { fixedClasses: ['5B'], places: 0, cancellableBelowMin: false }),
  morning('minigolf'),
  morning('dance'),
  morning('climbing', 1500),
  afternoon('tabletennis'),
  afternoon('chess', { places: 1 }),
  item('museum', [session(1, 8, 13, 300)]),
  item('hike', [session(2, 8, 13, 300)]),
  item('pottery', [session(2, 8, 13, 300)], { places: 2, minParticipants: 2 }),
]

const student = (personId: string, className: string, grade: number, fixedItemIds: string[], ranking: AllocationStudent['ranking'], savedIn: AllocationStudent['savedIn']): AllocationStudent => ({ personId, className, grade, fixedItemIds, ranking, savedIn })
const key = (...ids: string[]) => ids.map((id) => {
  const found = ITEMS.find((i) => i.id === id) as AllocationItem
  return found.sessions.map((s) => `${s.startMs}-${s.endMs}`).join('+')
}).join('|')
const MON_AM = key('dance')
const MON_PM = key('chess')
const TUE = key('museum')
const WED = key('hike')

const INPUT: AllocationInput = {
  projectDays: DAYS,
  dailyMinimum: { 9: 300, 10: 300 },
  wishesPerGroup: 3,
  seed: 4711,
  limits: { deterministicTimePerLevel: 5 },
  students: [
    student('sara', '5A', 9, ['trip'], { [MON_AM]: ['dance', 'minigolf'], [MON_PM]: ['tabletennis'] }, 'first'),
    student('max', '5A', 9, ['trip'], { [MON_AM]: ['climbing'] }, 'first'),
    student('ben', '5B', 9, ['trip', 'mondayclass'], null, null),
    student('lena', '6A', 10, [], { [MON_AM]: ['minigolf', 'dance'], [MON_PM]: ['chess', 'tabletennis'], [TUE]: ['museum'], [WED]: ['hike', 'pottery'] }, 'first'),
    student('tom', '6A', 10, [], { [MON_AM]: ['dance'], [MON_PM]: ['chess'], [TUE]: ['museum'], [WED]: ['pottery', 'hike'] }, 'late'),
    student('ida', '6A', 10, [], null, null),
  ],
  items: ITEMS,
}

const PASS_1: PassResult = {
  status: 'OPTIMAL',
  levels: [],
  assign: [['sara', 'dance'], ['sara', 'tabletennis'], ['max', 'climbing'], ['max', 'tabletennis'], ['lena', 'minigolf'], ['lena', 'chess'], ['lena', 'museum'], ['lena', 'hike']],
  cancelled: ['pottery'],
}
const PASS_2: PassResult = {
  status: 'FEASIBLE',
  levels: [],
  assign: [...PASS_1.assign, ['tom', 'dance'], ['tom', 'tabletennis'], ['tom', 'museum'], ['tom', 'hike'], ['ida', 'minigolf'], ['ida', 'tabletennis'], ['ida', 'museum'], ['ida', 'hike']],
  cancelled: [],
}
/** The passes with the level values the assignment really has, as a correct solver reports them. */
function solved(): AllocationResult {
  const first = { ...PASS_1, levels: recomputeLevels(compilePass(INPUT, 1, 'r'), PASS_1.assign) }
  const second = { ...PASS_2, levels: recomputeLevels(compilePass(INPUT, 2, 'r', first), PASS_2.assign).map((l) => ({ ...l, proven: false })) }
  return { passes: [first, second] }
}
const codes = (result: AllocationResult, assignments?: ReturnType<typeof assembleAssignments>) => validateAllocation(INPUT, result, assignments).map((p) => `${p.code}${p.personId ? `:${p.personId}` : ''}${p.itemId ? `:${p.itemId}` : ''}`)

test('the hash and the lot are plain functions of their input; the levels follow the cap', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5)
  assert.equal(fnv1a32('a'), 0xe40c292c)
  assert.equal(tieWeight(1, 'p', 'i'), tieWeight(1, 'p', 'i'))
  assert.notEqual(tieWeight(1, 'p', 'i'), tieWeight(2, 'p', 'i'))
  assert.ok(tieWeight(4711, 'sara', 'dance') < 1000)
  assert.deepEqual(levelNames(3), ['students_with_deficit', 'deficit_minutes', 'over:3000', 'over:2000', 'total_cost', 'tiebreak'])
  assert.deepEqual(levelNames(1), ['students_with_deficit', 'deficit_minutes', 'total_cost', 'tiebreak'])
})

test('a student is prepared against their fixed items: the requirement left per day, the wishes with their numbers, fee-free fallbacks at cap + 1', () => {
  const items = solverItems(INPUT, new Set())
  assert.deepEqual(items.map((i) => i.id), ['chess', 'climbing', 'dance', 'hike', 'minigolf', 'museum', 'pottery', 'tabletennis', 'trip'], 'places to rank, in id order; the class activity without extra places is nobody\'s variable')

  const sara = prepareStudent(INPUT, INPUT.students[0] as AllocationStudent, items)
  assert.deepEqual([...sara.required], [['2027-06-21', 300]], 'Tuesday and Wednesday are covered by the trip')
  assert.deepEqual(sara.options.map((o) => [o.itemId, o.kind, o.rank, o.cost]), [
    ['chess', 'fallback', 4, 1600],
    ['dance', 'wish', 1, 600],
    ['minigolf', 'wish', 2, 1200],
    ['tabletennis', 'wish', 1, 400],
  ], 'climbing has a fee and is no fallback; Tuesday\'s and Wednesday\'s items overlap the trip')

  const ben = prepareStudent(INPUT, INPUT.students[2] as AllocationStudent, items)
  assert.equal(ben.requiredTotal, 0, 'every day taken by class activities')
  assert.deepEqual(ben.options, [])

  const ida = prepareStudent(INPUT, INPUT.students[5] as AllocationStudent, items)
  assert.deepEqual(ida.options.map((o) => `${o.itemId}:${o.kind}`), ['chess:fallback', 'dance:fallback', 'hike:fallback', 'minigolf:fallback', 'museum:fallback', 'pottery:fallback', 'tabletennis:fallback'], 'a non-submitter has fallbacks only')
  assert.equal(ida.options.find((o) => o.itemId === 'museum')?.cost, Math.round(4 * 300 * 1000 / 900))
})

test('the first pass takes the first window\'s students; the request is deterministic and matches its golden file', () => {
  const compiled = compilePass(INPUT, 1, 'run-1')
  assert.deepEqual(compiled.personIds, ['lena', 'max', 'sara'], 'no late list, no non-submitter, nobody fully fixed')
  assert.deepEqual(compiled.request.fixed, [])
  assert.deepEqual(compiled.request.levels, levelNames(3))
  const items = new Map(compiled.request.items.map((i) => [compiled.itemIds[i.o], i]))
  assert.deepEqual(items.get('trip'), { o: 8, max: 2, min: 0, cancellable: false }, 'a class activity\'s extra places; its minimum is its classes\' business')
  assert.deepEqual(items.get('pottery'), { o: 6, max: 2, min: 2, cancellable: true })
  assert.deepEqual(items.get('chess'), { o: 0, max: 1, min: 0, cancellable: false }, 'nothing to fall below: it runs, takers or none')
  const name = (o: number) => compiled.itemIds[o] as string
  assert.deepEqual(compiled.request.conflicts.map(([a, b]) => `${name(a)}/${name(b)}`), [
    'chess/tabletennis', 'climbing/dance', 'climbing/minigolf', 'dance/minigolf', 'hike/pottery', 'hike/trip', 'museum/trip', 'pottery/trip',
  ])
  const sara = compiled.request.students[2]
  assert.deepEqual(sara?.required, [{ d: 0, min: 300 }])
  assert.deepEqual(sara?.options.map((o) => [name(o.o), o.cost, o.credit]), [['chess', 1600, [{ d: 0, min: 120 }]], ['dance', 600, [{ d: 0, min: 180 }]], ['minigolf', 1200, [{ d: 0, min: 180 }]], ['tabletennis', 400, [{ d: 0, min: 120 }]]])

  const json = JSON.stringify(compiled.request, null, 2) + '\n'
  assert.equal(JSON.stringify(compilePass(INPUT, 1, 'run-1').request, null, 2) + '\n', json, 'the same input compiles to the same bytes')
  const golden = new URL('./fixtures/allocation-vienna-pass1.json', import.meta.url)
  if (process.env.UPDATE_FIXTURES) writeFileSync(golden, json)
  assert.equal(json, readFileSync(golden, 'utf8'), 'the request changed; regenerate deliberately with UPDATE_FIXTURES=1')
})

test('the second pass keeps the first pass fixed, drops what it cancelled, and places the late lists and the non-submitters', () => {
  const compiled = compilePass(INPUT, 2, 'run-1', PASS_1)
  assert.deepEqual(compiled.personIds, ['ida', 'lena', 'max', 'sara', 'tom'])
  assert.deepEqual(compiled.dropped, ['pottery'])
  assert.ok(!compiled.itemIds.includes('pottery'))
  const name = (o: number) => compiled.itemIds[o] as string
  const who = (s: number) => compiled.personIds[s] as string
  assert.deepEqual(compiled.request.fixed.map(([s, o]) => `${who(s)}:${name(o)}`).sort(), PASS_1.assign.map(([p, i]) => `${p}:${i}`).sort())
  const sara = compiled.students.find((p) => p.student.personId === 'sara')
  assert.deepEqual(sara?.options.map((o) => o.itemId), ['dance', 'tabletennis'], 'a first-pass student keeps what the first pass gave them, nothing else')
  const tom = compiled.students.find((p) => p.student.personId === 'tom')
  assert.deepEqual(tom?.options.map((o) => `${o.itemId}:${o.kind}:${o.rank}`), ['chess:wish:1', 'dance:wish:1', 'hike:wish:2', 'minigolf:fallback:4', 'museum:wish:1', 'tabletennis:fallback:4'], 'his first Wednesday wish is gone; the hike stays his second')
  assert.throws(() => compilePass(INPUT, 2, 'run-1'), RangeError)
})

test('a correct result passes, its levels recomputed to the values the solver must have reported', () => {
  const result = solved()
  assert.deepEqual(validateAllocation(INPUT, result), [])
  const first = Object.fromEntries(result.passes[0].levels.map((l) => [l.name, l.value]))
  // sara 600 + 400; max 600 + a fallback at 4 · 120 · 1000 / 300 = 1600; lena 200 + 133 + 333 + 333 over a 900-minute week.
  assert.deepEqual(first, { 'students_with_deficit': 0, 'deficit_minutes': 0, 'over:3000': 0, 'over:2000': 1, 'total_cost': 1000 + 2200 + 999, 'tiebreak': first.tiebreak })
  const second = Object.fromEntries(result.passes[1].levels.map((l) => [l.name, l.value]))
  assert.equal(second.students_with_deficit, 0)
  assert.equal(second['over:3000'], 1, 'ida: four fallbacks at rank 4 over a 900-minute week')
  assert.deepEqual(cancelledOf(result), ['pottery'])
  assert.deepEqual(validateAllocation(INPUT, result, assembleAssignments(INPUT, result)), [])
})

test('every tampering is caught: capacity, overlap, an item outside the options, a paid item as fallback, a changed first pass, a dropped pre-assignment, a wrong level, a cancelled item that may not be, a failed pass', () => {
  const tamper = (change: (r: AllocationResult) => void): AllocationResult => {
    const r = solved()
    r.passes = [{ ...r.passes[0], assign: [...r.passes[0].assign], cancelled: [...r.passes[0].cancelled] }, { ...r.passes[1], assign: [...r.passes[1].assign], cancelled: [...r.passes[1].cancelled] }]
    change(r)
    return r
  }
  assert.ok(codes(tamper((r) => r.passes[1].assign.push(['tom', 'chess']))).includes('capacity_exceeded:chess'), 'chess has one place and lena holds it')
  assert.ok(codes(tamper((r) => r.passes[0].assign.push(['sara', 'minigolf']))).includes('overlap:sara:minigolf'))
  assert.ok(codes(tamper((r) => r.passes[0].assign.push(['sara', 'climbing']))).includes('not_an_option:sara:climbing'), 'a paid item she did not rank')
  assert.ok(codes(tamper((r) => r.passes[0].assign.push(['sara', 'museum']))).includes('not_an_option:sara:museum'), 'overlaps her trip')
  assert.ok(codes(tamper((r) => r.passes[0].assign.push(['tom', 'dance']))).includes('not_in_pass:tom'))
  assert.ok(codes(tamper((r) => r.passes[1].assign.splice(0, 1))).includes('first_pass_changed:sara'))
  assert.ok(codes(tamper((r) => r.passes[0].assign.push(['max', 'chess']))).includes('overlap:max:chess'), 'two afternoon items')
  assert.ok(codes(tamper((r) => (r.passes[0].levels[0] as { value: number }).value = 1)).includes('level_mismatch'))
  assert.ok(codes(tamper((r) => r.passes[0].cancelled.push('trip'))).includes('cancelled_not_cancellable:trip'))
  assert.ok(codes(tamper((r) => r.passes[0].cancelled.push('dance'))).includes('cancelled_not_cancellable:dance'), 'no minimum, nothing to fall below')
  assert.ok(codes(tamper((r) => r.passes[0].cancelled.push('tabletennis'))).includes('assigned_to_cancelled:sara:tabletennis'))
  assert.ok(codes(tamper((r) => (r.passes[0].cancelled = []))).includes('below_minimum:pottery'), 'nobody in it, two needed')
  assert.ok(codes(tamper((r) => r.passes[0].assign.push(['sara', 'dance']))).includes('assigned_twice:sara:dance'))
  assert.ok(codes(tamper((r) => r.passes[1].cancelled.push('nope'))).includes('unknown_item:nope'))
  assert.deepEqual(codes(tamper((r) => (r.passes[0].status = 'INFEASIBLE'))), ['pass_not_solved'], 'nothing else is judged on a pass that was not solved')
  assert.ok(codes(tamper((r) => (r.passes[1].levels = r.passes[1].levels.slice(1)))).includes('levels_unexpected'))

  const result = solved()
  const rows = assembleAssignments(INPUT, result)
  assert.ok(codes(result, rows.filter((row) => !(row.personId === 'ben' && row.itemId === 'mondayclass'))).includes('pre_assignment_missing:ben:mondayclass'))
  assert.ok(codes(result, [...rows, { personId: 'lena', itemId: 'trip', source: 'fixed', pass: null, rank: null }]).includes('pre_assignment_changed:lena:trip'))
  assert.ok(codes(result, rows.map((row) => (row.personId === 'max' && row.itemId === 'tabletennis' ? { ...row, source: 'wish', rank: 1 } : row))).includes('assignment_mismatch:max:tabletennis'))
})

test('the rows of a result carry the pre-assignments, the pass and the wish number; the explanation and the summary read them back', () => {
  const result = solved()
  const rows = assembleAssignments(INPUT, result)
  assert.deepEqual(rows.filter((r) => r.source === 'fixed').map((r) => `${r.personId}:${r.itemId}`), ['ben:mondayclass', 'ben:trip', 'max:trip', 'sara:trip'])
  assert.deepEqual(rows.filter((r) => r.personId === 'max' && r.source !== 'fixed'), [
    { personId: 'max', itemId: 'climbing', source: 'wish', pass: 1, rank: 1 },
    { personId: 'max', itemId: 'tabletennis', source: 'fallback', pass: 1, rank: null },
  ])
  assert.deepEqual(rows.filter((r) => r.personId === 'tom').map((r) => `${r.itemId}:${r.source}:${r.pass}:${r.rank}`), ['dance:wish:2:1', 'hike:wish:2:2', 'museum:wish:2:1', 'tabletennis:fallback:2:null'])

  const max = explainStudent(INPUT, rows, 'max')
  assert.deepEqual(max?.days, [
    { date: '2027-06-21', required: 300, covered: 300, deficit: 0 },
    { date: '2027-06-22', required: 300, covered: 360, deficit: 0 },
    { date: '2027-06-23', required: 300, covered: 300, deficit: 0 },
  ])
  assert.equal(max?.averageRank, (1 * 180 + 4 * 120) / 300)
  assert.equal(max?.window, 'first')
  assert.equal(explainStudent(INPUT, rows, 'ben')?.averageRank, null)
  assert.equal(explainStudent(INPUT, rows, 'nobody'), undefined)

  const summary = summarizeAllocation(INPUT, rows, cancelledOf(result))
  assert.deepEqual(summary.students, { total: 6, choosing: 5, covered: 5, withDeficit: 0, withFallback: 3, late: 1, nonSubmitters: 1 })
  assert.deepEqual(summary.ranks, { 1: 9, 2: 1, 3: 0, fallback: 6, fixed: 4 })
  assert.deepEqual(summary.classes, [
    { className: '5A', students: 2, withDeficit: 0, withFallback: 1 },
    { className: '5B', students: 1, withDeficit: 0, withFallback: 0 },
    { className: '6A', students: 3, withDeficit: 0, withFallback: 2 },
  ])
  assert.deepEqual(summary.items.find((i) => i.itemId === 'pottery'), { itemId: 'pottery', fixed: 0, assigned: 0, places: 2, minimum: 2, cancelled: true })
  assert.deepEqual(summary.items.find((i) => i.itemId === 'trip'), { itemId: 'trip', fixed: 3, assigned: 0, places: 2, minimum: 0, cancelled: false })
  assert.deepEqual(summary.deficits, [])
  assert.equal(summary.fallbacks.length, 6)
})

test('a day no option can cover is a deficit, counted and reported, never hidden', () => {
  // With a fee on the museum, ida has nothing fee-free on Tuesday.
  const input: AllocationInput = { ...INPUT, items: INPUT.items.map((i) => (i.id === 'museum' ? { ...i, feeCents: 500 } : i)) }
  const first = compilePass(input, 1, 'r')
  const pass1: PassResult = { ...PASS_1, assign: PASS_1.assign, levels: recomputeLevels(first, PASS_1.assign) }
  const assign: [string, string][] = [...PASS_1.assign, ['tom', 'dance'], ['tom', 'tabletennis'], ['tom', 'museum'], ['tom', 'hike'], ['ida', 'minigolf'], ['ida', 'tabletennis'], ['ida', 'hike']]
  const second = compilePass(input, 2, 'r', pass1)
  const levels = Object.fromEntries(recomputeLevels(second, assign).map((l) => [l.name, l.value]))
  assert.equal(levels.students_with_deficit, 1)
  assert.equal(levels.deficit_minutes, 300)
  const result: AllocationResult = { passes: [pass1, { status: 'OPTIMAL', levels: recomputeLevels(second, assign), assign, cancelled: [] }] }
  assert.deepEqual(validateAllocation(input, result), [])
  const summary = summarizeAllocation(input, assembleAssignments(input, result), cancelledOf(result))
  assert.deepEqual(summary.deficits, [{ personId: 'ida', date: '2027-06-22', minutes: 300 }])
  assert.equal(summary.students.withDeficit, 1)
  assert.equal(summary.students.covered, 4)
})

test('the input is checked before any solving: a grade without a minimum, no students, a minimum out of reach', () => {
  assert.deepEqual(checkAllocationInput(INPUT), { problems: [], warnings: [] })
  assert.deepEqual(checkAllocationInput({ ...INPUT, dailyMinimum: { 9: 300 } }).problems, [{ code: 'daily_minimum_missing', grades: [10] }])
  assert.deepEqual(checkAllocationInput({ ...INPUT, dailyMinimum: { 9: 300, 10: 0 } }).problems, [{ code: 'daily_minimum_missing', grades: [10] }])
  assert.deepEqual(checkAllocationInput({ ...INPUT, students: [] }).problems, [{ code: 'no_students' }])
  // Two class activities taking 5B at the same time on Tuesday: the catalogue's mistake, refused before the solver and by the validator.
  const clash = { ...INPUT, items: [...INPUT.items, item('tuesdayclass', [session(1, 8, 13, 300)], { fixedClasses: ['5B'], places: 0, cancellableBelowMin: false })], students: INPUT.students.map((s) => (s.personId === 'ben' ? { ...s, fixedItemIds: [...s.fixedItemIds, 'tuesdayclass'] } : s)) }
  assert.deepEqual(checkAllocationInput(clash).problems, [{ code: 'fixed_items_overlap', personId: 'ben', itemIds: ['trip', 'tuesdayclass'] }])
  assert.ok(validateAllocation(clash, solved()).some((p) => p.code === 'overlaps_fixed' && p.personId === 'ben' && p.itemId === 'tuesdayclass'))
  const strict = { ...INPUT, items: INPUT.items.map((i) => (i.id === 'climbing' ? { ...i, rules: { ...i.rules, minParticipants: 5, cancellableBelowMin: false } } : i)) }
  assert.deepEqual(checkAllocationInput(strict).warnings, [{ code: 'minimum_out_of_reach', itemId: 'climbing', possible: 1, minimum: 5 }], 'only max ranked it, and a paid item is nobody\'s fallback')
  assert.equal(prepareStudents(INPUT).length, 6)
})
