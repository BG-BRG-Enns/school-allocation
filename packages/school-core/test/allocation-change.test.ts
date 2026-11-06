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
  // Lena was placed into climbing directly before the run: its one place is hers (the frozen places are 0), and the row says so whatever its source.
  const reserved: AllocationInput = { ...INPUT, students: INPUT.students.map((s) => (s.personId === 'lena' ? { ...s, fixedItemIds: ['climbing'] } : s)), items: ITEMS.map((i) => (i.id === 'climbing' ? { ...i, rules: { ...i.rules, places: 0 } } : i)) }
  const placed = ROWS.map((r) => (r.personId === 'lena' && r.itemId === 'climbing' ? row('lena', 'climbing', 'fixed') : r))
  assert.equal(freePlaces(reserved, placed, 'climbing'), 0)
  const freed = placed.filter((r) => !(r.personId === 'lena' && r.itemId === 'climbing'))
  assert.equal(freePlaces(reserved, freed, 'climbing'), 1, 'taken out again, the seat is free')
  assert.deepEqual(moveOffers(reserved, freed, 'tim', 'swap').filter((o) => o.itemId === 'climbing').map((o) => [o.free, codes(o.problems)]), [[1, []]], 'and someone may enter it, the frozen places of zero notwithstanding')
  assert.deepEqual(moveOffers(reserved, placed, 'tim', 'swap').filter((o) => o.itemId === 'climbing').map((o) => codes(o.problems)), [['item_full']])
  assert.equal(freePlaces(reserved, [...placed, row('tim', 'climbing', 'fixed')], 'climbing'), 0, 'a teacher\'s placement after publication takes a seat like one before the run')
  assert.equal(freePlaces(INPUT, [...ROWS.filter((r) => !(r.personId === 'sara' && r.itemId === 'vienna')), row('sara', 'vienna', 'fixed')], 'vienna'), 1, 'a class member brought back is in it by class, not on the spare seat')
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
  // The class trip withdrawn after publication (its rows removed): it bars nothing on Tuesday any more, and darts fills Tim's Tuesday.
  const withoutTrip = ROWS.filter((r) => !(r.personId === 'tim' && r.itemId === 'vienna'))
  assert.deepEqual(codes(checkMove(INPUT, withoutTrip, { personId: 'tim', toItemId: 'darts', leaves: [] }, { unavailable: new Set(['vienna']) })), [], 'the withdrawn class activity holds no time')
  assert.ok(moveOffers(INPUT, withoutTrip, 'tim', 'place', new Set(['vienna'])).some((o) => o.itemId === 'darts' && o.problems.length === 0), 'and is offered as a placement')
  // Taken out of the trip since publication, with the trip taking place: it holds no time of his either, and darts is his to enter.
  assert.deepEqual(codes(checkMove(INPUT, withoutTrip, { personId: 'tim', toItemId: 'darts', leaves: [] })), [], 'a class activity he has no row in bars nothing')
  assert.ok(moveOffers(INPUT, withoutTrip, 'tim', 'swap').some((o) => o.itemId === 'darts' && o.problems.length === 0))
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'tim', toItemId: 'darts', leaves: [] })), ['not_offered'], 'while he is in it, it bars its time')
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

test('a teacher\'s change after publication: out of a class activity, into their own activity whatever the lists and the places say, and back; never two things at once', () => {
  const byTeacher = { byTeacher: true }
  // The trip's teacher takes Sara out of it: a class placement, which nobody else leaves.
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'sara', toItemId: null, leaves: ['vienna'] }, byTeacher)), [])
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'sara', toItemId: null, leaves: ['vienna'] }, { force: true })), ['leaves_fixed'], 'not the organizer\'s change by hand either')
  // Darts' teacher takes Tim for Tuesday morning, instead of the trip: one change, the trip left and darts entered.
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'tim', toItemId: 'darts', leaves: ['vienna'] }, byTeacher)), [])
  // Without leaving the trip it is an overlap; beside it, it is not: he is away from his class for that time.
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'tim', toItemId: 'darts', leaves: [] }, byTeacher)), ['overlap'])
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'tim', toItemId: 'darts', leaves: [] }, { byTeacher: true, besideClass: true })), [])
  // Beside a class activity means beside his own class's: with dance he keeps, reading still overlaps.
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'tim', toItemId: 'reading', leaves: [] }, { byTeacher: true, besideClass: true })), ['overlap'])
  // The lists and the places do not bind a teacher's placement: pottery is the 10th grade's, climbing is full, and a second Monday morning fills nothing.
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'tim', toItemId: 'pottery', leaves: [] }, byTeacher)), [])
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'tim', toItemId: 'climbing', leaves: ['dance'] }, byTeacher)), [], 'dance falls under its minimum of two with it: the teacher\'s to answer for')
  // What stays: the activity takes place, the student is not in it already, and is in the run.
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'tim', toItemId: 'reading', leaves: ['dance'] }, { byTeacher: true, unavailable: new Set(['reading']) })), ['not_offered'])
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'tim', toItemId: 'dance', leaves: [] }, byTeacher)), ['already_placed'])
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'tim', toItemId: 'dance', leaves: ['dance'] }, byTeacher)), [], 'in it by a wish: the teacher\'s placement supersedes that row with its own')
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'nobody', toItemId: 'darts', leaves: [] }, byTeacher)), ['not_offered'])
  assert.deepEqual(codes(checkMove(INPUT, ROWS, { personId: 'tim', toItemId: null, leaves: ['darts'] }, byTeacher)), ['not_placed'])
  // Back on the trip: the class's own activity, which he could never rank, entered by its teacher, leaving what he was given instead.
  const away = applyMove(ROWS, { personId: 'tim', toItemId: 'darts', leaves: ['vienna'] }, 'fixed')
  assert.deepEqual(codes(checkMove(INPUT, away, { personId: 'tim', toItemId: 'vienna', leaves: ['darts'] }, byTeacher)), [])
  assert.deepEqual(codes(checkMove(INPUT, away, { personId: 'tim', toItemId: 'vienna', leaves: [] }, byTeacher)), ['overlap'])
  // Or back on it beside what he was given: on the trip again, away for the darts.
  assert.deepEqual(codes(checkMove(INPUT, away, { personId: 'tim', toItemId: 'vienna', leaves: [] }, { byTeacher: true, besideClass: true })), [])
  // The rows a teacher adds are fixed: Tim cannot swap out of the darts, nor out of the trip once brought back on it beside them.
  assert.deepEqual(codes(checkMove(INPUT, away, { personId: 'tim', toItemId: null, leaves: ['darts'] }, { force: true })), ['leaves_fixed'])
  const back = applyMove(away, { personId: 'tim', toItemId: 'vienna', leaves: [] }, 'fixed')
  assert.deepEqual(leavesForSwap(INPUT, back, 'tim', 'darts'), [], 'the trip is his class\'s again, not something a swap leaves')
  assert.deepEqual(codes(checkMove(INPUT, back, { personId: 'tim', toItemId: null, leaves: ['vienna'] }, { force: true })), ['leaves_fixed'])
  // And a later placement beside the class activity he is back in reads it as his class's.
  assert.deepEqual(codes(checkMove(INPUT, back.filter((r) => !(r.personId === 'tim' && r.itemId === 'darts')), { personId: 'tim', toItemId: 'darts', leaves: [] }, { byTeacher: true, besideClass: true })), [])
})
