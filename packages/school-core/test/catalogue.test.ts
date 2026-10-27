import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceptsProposals, checkItem, creditedMinutesByDate, isEligible, isPreAssigned, ITEM_STATES, itemTransition, overlaps, type ItemInput, type ItemRules, type SessionInput } from '../src/catalogue.ts'

const DAY = 24 * 60 * 60 * 1000
// Monday 2027-06-21 08:00 Europe/Vienna = 06:00Z; the dates are what the API computes for the span.
const MON = Date.UTC(2027, 5, 21, 6)
const context = { projectDays: ['2027-06-21', '2027-06-22', '2027-06-23'], classes: ['5A', '5B', '6A'] }

function session(startMs: number, hours: number, dates: string[], credits: { date: string, minutes: number }[]): SessionInput {
  return { startMs, endMs: startMs + hours * 60 * 60 * 1000, dates, credits }
}

const choosable: ItemRules = { fixedClasses: [], eligibleGrades: [], eligibleClasses: [], places: 20, minParticipants: 8, cancellableBelowMin: true }
const monday = session(MON, 4, ['2027-06-21'], [{ date: '2027-06-21', minutes: 180 }])
const vienna = session(MON + DAY, 29, ['2027-06-22', '2027-06-23'], [{ date: '2027-06-22', minutes: 360 }, { date: '2027-06-23', minutes: 240 }])
const item: ItemInput = { sessions: [monday], rules: choosable, teachers: ['t1'] }

test('an activity with a session on a project day, credit on it, places and a teacher passes', () => {
  assert.deepEqual(checkItem(item, context), [])
  const trip: ItemInput = { sessions: [vienna], rules: { ...choosable, fixedClasses: ['5A', '5B'], places: 8, minParticipants: 0, cancellableBelowMin: false }, teachers: ['t1', 't2'] }
  assert.deepEqual(checkItem(trip, context), [])
})

test('sessions must lie on project days, not overlap each other, and credit only the dates they touch', () => {
  const codes = (input: ItemInput) => checkItem(input, context).map((p) => `${p.code}${p.session === undefined ? '' : `@${p.session}`}`)
  assert.deepEqual(codes({ ...item, sessions: [] }), ['no_sessions'])
  assert.deepEqual(codes({ ...item, sessions: [{ ...monday, endMs: monday.startMs }] }), ['session_ends_before_start@0'])
  assert.deepEqual(codes({ ...item, sessions: [session(MON + 7 * DAY, 2, ['2027-06-28'], [{ date: '2027-06-28', minutes: 60 }])] }), ['session_outside_project_days@0'])
  assert.deepEqual(codes({ ...item, sessions: [monday, session(MON + 2 * 60 * 60 * 1000, 2, ['2027-06-21'], [{ date: '2027-06-21', minutes: 60 }])] }), ['sessions_overlap@1'])
  // Touching end points do not overlap.
  assert.deepEqual(codes({ ...item, sessions: [monday, session(monday.endMs, 2, ['2027-06-21'], [{ date: '2027-06-21', minutes: 60 }])] }), [])
  assert.deepEqual(codes({ ...item, sessions: [{ ...monday, credits: [{ date: '2027-06-22', minutes: 60 }] }] }), ['credit_date_outside_session@0'])
  assert.deepEqual(codes({ ...item, sessions: [{ ...monday, credits: [{ date: '2027-06-21', minutes: 60 }, { date: '2027-06-21', minutes: 60 }] }] }), ['credit_date_twice@0'])
  assert.deepEqual(codes({ ...item, sessions: [{ ...monday, credits: [{ date: '2027-06-21', minutes: 1500 }] }] }), ['credit_minutes_invalid@0'])
  assert.deepEqual(codes({ ...item, sessions: [{ ...monday, credits: [{ date: '2027-06-21', minutes: 0.5 }] }] }), ['credit_minutes_invalid@0'])
  assert.deepEqual(codes({ ...item, sessions: [{ ...monday, credits: [] }] }), ['no_credit@0'])
})

test('places, minimum, fixed classes and eligibility must agree with each other and with the roster', () => {
  const codes = (rules: Partial<ItemRules>, teachers = ['t1']) => checkItem({ ...item, rules: { ...choosable, ...rules }, teachers }, context).map((p) => p.code)
  assert.deepEqual(codes({ minParticipants: 21 }), ['min_above_places'])
  assert.deepEqual(codes({ fixedClasses: ['5A'], minParticipants: 0 }), ['fixed_item_cancellable'])
  assert.deepEqual(codes({ fixedClasses: ['7C'], cancellableBelowMin: false, minParticipants: 0 }), ['fixed_class_unknown'])
  assert.deepEqual(codes({ eligibleClasses: ['7C'] }), ['eligible_class_unknown'])
  assert.deepEqual(codes({ fixedClasses: ['5A'], eligibleClasses: ['5A'], cancellableBelowMin: false, minParticipants: 0 }), ['fixed_class_also_eligible'])
  assert.deepEqual(codes({}, []), ['no_teacher'])
  assert.deepEqual(codes({}, ['t1', 't1']), ['teacher_twice'])
})

test('a pre-assigned student does not rank the activity; other students rank it for its places, within grade and class', () => {
  const sara = { className: '5A', grade: 9 }
  const max = { className: '6A', grade: 10 }
  const trip: ItemRules = { ...choosable, fixedClasses: ['5A'], places: 8, minParticipants: 0, cancellableBelowMin: false }
  assert.equal(isPreAssigned(sara, trip), true)
  assert.equal(isEligible(sara, trip), false)
  assert.equal(isEligible(max, trip), true)
  // Without extra places the class activity is nobody else's.
  assert.equal(isEligible(max, { ...trip, places: 0 }), false)
  assert.equal(isEligible(max, { ...choosable, eligibleGrades: [9] }), false)
  assert.equal(isEligible(sara, { ...choosable, eligibleGrades: [9] }), true)
  assert.equal(isEligible(sara, { ...choosable, eligibleClasses: ['6A'] }), false)
  assert.equal(isEligible(sara, { ...choosable, eligibleClasses: ['5A', '5B'], eligibleGrades: [9, 10] }), true)
})

test('credits add up per date across sessions; overlap is strict', () => {
  const minutes = creditedMinutesByDate([monday, vienna, { credits: [{ date: '2027-06-21', minutes: 60 }] }])
  assert.deepEqual([...minutes], [['2027-06-21', 240], ['2027-06-22', 360], ['2027-06-23', 240]])
  assert.equal(overlaps({ startMs: 0, endMs: 10 }, { startMs: 10, endMs: 20 }), false)
  assert.equal(overlaps({ startMs: 0, endMs: 11 }, { startMs: 10, endMs: 20 }), true)
  assert.equal(overlaps({ startMs: 5, endMs: 6 }, { startMs: 0, endMs: 20 }), true)
})

test('an item goes draft → proposed → approved, back to draft when returned, and withdrawn is the end; proposals only while the catalogue is open', () => {
  assert.deepEqual(itemTransition('draft', 'proposed'), { ok: true, state: 'proposed' })
  assert.deepEqual(itemTransition('proposed', 'approved'), { ok: true, state: 'approved' })
  assert.deepEqual(itemTransition('proposed', 'draft'), { ok: true, state: 'draft' })
  assert.deepEqual(itemTransition('approved', 'draft'), { ok: true, state: 'draft' })
  assert.deepEqual(itemTransition('draft', 'approved'), { ok: false, code: 'invalid_item_transition', from: 'draft', to: 'approved' })
  for (const state of ITEM_STATES) assert.equal(itemTransition('withdrawn', state).ok, false, state)
  assert.equal(acceptsProposals('catalogue'), true)
  assert.equal(acceptsProposals('published'), false)
  assert.equal(acceptsProposals('draft'), false)
})
