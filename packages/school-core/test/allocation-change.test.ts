import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyMove, checkMove, freePlaces, leavesForSwap, moveOffers } from '../src/allocation-change.ts'
import type { AllocationInput, AllocationItem, Assignment, AllocationStudent } from '../src/allocation-model.ts'
import type { ItemRules, SessionInput } from '../src/catalogue.ts'

// Monday 2027-06-21 and Tuesday, Vienna time (UTC+2). 5A is in Vienna on
// Tuesday; Monday has a morning group (climbing, dance, reading) and an
// afternoon group (chess, pottery); darts is Tuesday. Daily minimum 300.
const DAYS = ['2027-06-21', '2027-06-22']
const at = (day: number, hour: number, minute = 0) => Date.UTC(2027, 5, 21 + day, hour - 2, minute)
const session = (day: number, from: number, to: number, minutes: number): SessionInput => ({ startMs: at(day, from), endMs: at(day, to), dates: [DAYS[day] as string], credits: [{ date: DAYS[day] as string, minutes }] })
const open: ItemRules = { fixedClasses: [], eligibleGrades: [], eligibleClasses: [], places: 10, minParticipants: 0, cancellableBelowMin: true }
const item = (id: string, sessions: SessionInput[], rules: Partial<ItemRules> = {}, feeCents = 0, categoryIds: string[] = []): AllocationItem => ({ id, feeCents, rules: { ...open, ...rules }, sessions, categoryIds })
const ITEMS: AllocationItem[] = [
  item('vienna', [session(1, 8, 18, 420)], { fixedClasses: ['5A'], places: 1, cancellableBelowMin: false }),
  item('climbing', [session(0, 8, 11, 180)], { places: 1 }, 1500),
  item('dance', [session(0, 8, 11, 180)], { minParticipants: 2 }),
  item('reading', [session(0, 8, 10, 120)]),
  item('chess', [session(0, 11, 13, 120)], { places: 1, minParticipants: 1 }),
  item('crafts', [session(0, 11, 13, 120)]),
  item('pottery', [session(0, 11, 13, 120)], { eligibleGrades: [10] }),
  item('darts', [session(1, 8, 11, 180)]),
]
const student = (personId: string, className: string, grade: number, fixedItemIds: string[]): AllocationStudent => ({ personId, className, grade, fixedItemIds, ranking: null, savedIn: 'first' })
const INPUT: AllocationInput = {
  projectDays: DAYS,
  dailyMinimum: { 9: 300, 10: 300 },
  wishesPerGroup: 3,
  rules: [],
  seed: 1,
  limits: { deterministicTimePerLevel: 5 },
  students: [student('sara', '5A', 9, ['vienna']), student('tim', '5A', 9, ['vienna']), student('max', '5A', 9, ['vienna']), student('lena', '6A', 10, [])],
  items: ITEMS,
}
const row = (personId: string, itemId: string, source: Assignment['source'] = 'wish'): Assignment => ({ personId, itemId, source, pass: source === 'fixed' ? null : 1, rank: source === 'wish' ? 1 : null })
// Sara: dance + chess (a full Monday); Tim and Max: dance alone (120 missing); Lena: climbing and darts, her Monday afternoon missing.
const ROWS: Assignment[] = [row('sara', 'vienna', 'fixed'), row('tim', 'vienna', 'fixed'), row('max', 'vienna', 'fixed'), row('sara', 'dance'), row('sara', 'chess'), row('tim', 'dance'), row('max', 'dance'), row('lena', 'climbing'), row('lena', 'darts')]
const codes = (problems: { code: string }[]) => problems.map((p) => p.code)

test('free places count the students in an item other than by class; a swap leaves the overlapping items the student is not in by class', () => {
  assert.equal(freePlaces(INPUT, ROWS, 'dance'), 7)
  assert.equal(freePlaces(INPUT, ROWS, 'climbing'), 0)
  assert.equal(freePlaces(INPUT, [...ROWS, row('tim', 'climbing', 'manual')], 'climbing'), 0, 'a forced second student is no negative place')
  assert.equal(freePlaces(INPUT, ROWS, 'vienna'), 1, 'the spare seat on the bus; the class does not count against it')
  assert.deepEqual(leavesForSwap(INPUT, ROWS, 'sara', 'reading'), ['dance'])
  assert.deepEqual(leavesForSwap(INPUT, ROWS, 'sara', 'pottery'), ['chess'])
  assert.deepEqual(leavesForSwap(INPUT, ROWS, 'tim', 'chess'), [], 'a gap is filled without leaving anything')
  assert.deepEqual(leavesForSwap(INPUT, ROWS, 'sara', 'darts'), [], 'the class activity is never among what is left')
})

test('a move is refused for what the rules say, each by its code', () => {
  const swap = (personId: string, toItemId: string, options = {}) => codes(checkMove(INPUT, ROWS, { personId, toItemId, leaves: leavesForSwap(INPUT, ROWS, personId, toItemId) }, options))
  assert.deepEqual(swap('tim', 'chess'), ['item_full'], 'Sara has the one place')
  assert.deepEqual(swap('tim', 'chess', { force: true }), [], 'the organizer may override a full item')
  assert.deepEqual(swap('tim', 'pottery'), ['not_offered'], 'the 10th grade\'s')
  assert.deepEqual(swap('tim', 'darts'), ['not_offered'], 'overlaps the class trip')
  assert.deepEqual(swap('tim', 'vienna'), ['not_offered'], 'the class activity he is in by class')
  assert.deepEqual(swap('tim', 'dance'), ['already_placed'])
  assert.deepEqual(swap('tim', 'nothing'), ['not_offered'])
  assert.deepEqual(swap('tim', 'reading', { unavailable: new Set(['reading']) }), ['not_offered'], 'cancelled or withdrawn')
  assert.deepEqual(swap('sara', 'reading'), ['coverage_lost'], 'reading credits 120 where dance credited 180: Monday would miss 60 minutes')
  assert.deepEqual(swap('tim', 'reading'), ['coverage_lost'], 'already short, and shorter after')
  assert.deepEqual(swap('lena', 'pottery'), [], 'Lena fills her afternoon')
  assert.deepEqual(swap('lena', 'reading'), ['coverage_lost'])
  assert.deepEqual(swap('sara', 'climbing'), ['item_full'], 'climbing is Lena\'s alone; dance keeps Tim and Max')
  // Leaving chess leaves it empty under its minimum of one; the organizer may force that, the student may not.
  assert.deepEqual(swap('sara', 'crafts'), ['below_minimum'])
  assert.deepEqual(swap('sara', 'crafts', { force: true }), [])
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'sara', toItemId: 'reading', leaves: [] })), ['overlap', 'fills_nothing'], 'a placement into a gap must not overlap what the student keeps, and must fill one')
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'sara', toItemId: 'darts', leaves: [] })), ['not_offered'], 'the trip is Tuesday\'s; nothing of Sara\'s is placeable there')
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'lena', toItemId: 'crafts', leaves: [] })), [], 'Lena\'s afternoon is the gap crafts fills')
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'sara', toItemId: 'crafts', leaves: [] }, { force: true })), ['overlap', 'fills_nothing'], 'not even the organizer: a seat on a covered day is no placement')
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'sara', toItemId: null, leaves: ['vienna'] })), ['leaves_fixed'], 'never by hand either')
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'sara', toItemId: null, leaves: ['darts'] })), ['not_placed'])
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'sara', toItemId: null, leaves: ['chess'] })), ['below_minimum'])
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'sara', toItemId: null, leaves: ['dance'] })), [], 'a removal by hand may cost coverage; the class\'s list shows it')
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'nobody', toItemId: 'chess', leaves: [] })), ['not_offered'])
})

test('applying a move drops the left rows and adds the target with its source; the offers say what each move would do', () => {
  const after = applyMove(ROWS, { personId: 'tim', toItemId: 'chess', leaves: [] }, 'manual')
  assert.deepEqual(after.filter((a) => a.personId === 'tim').map((a) => `${a.itemId}:${a.source}`), ['vienna:fixed', 'dance:wish', 'chess:manual'])
  assert.deepEqual(applyMove(ROWS, { personId: 'sara', toItemId: null, leaves: ['chess'] }, 'manual').filter((a) => a.personId === 'sara').map((a) => a.itemId), ['vienna', 'dance'])
  const offers = moveOffers(INPUT, ROWS, 'tim', 'swap')
  assert.deepEqual(offers.map((o) => [o.itemId, o.free, o.leaves, codes(o.problems)]), [
    ['chess', 0, [], ['item_full']],
    ['climbing', 0, ['dance'], ['item_full']],
    ['crafts', 10, [], []],
    ['reading', 10, ['dance'], ['coverage_lost']],
  ], 'in id order; pottery is not his grade\'s, darts overlaps Vienna, dance is where he is')
  assert.deepEqual(moveOffers(INPUT, ROWS, 'lena', 'place').map((o) => [o.itemId, codes(o.problems)]), [['chess', ['item_full']], ['crafts', []], ['dance', ['overlap']], ['pottery', []], ['reading', ['overlap']], ['vienna', ['overlap']]], 'the trip\'s spare seat is on offer to the 10th grade too, but Lena has darts then')
  assert.deepEqual(moveOffers(INPUT, ROWS, 'nobody', 'swap'), [])
})
