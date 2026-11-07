import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceptsProposals, checkItem, creditedMinutesByDate, creditsOf, isEligible, isExtra, isPreAssigned, isStaffOnly, ITEM_STATES, itemTransition, lengthStandings, overlaps, type CreditDay, type ItemInput, type ItemRules, type SessionInput } from '../src/catalogue.ts'

const DAY = 24 * 60 * 60 * 1000
// Monday 2027-06-21 08:00 Europe/Vienna = 06:00Z; the dates are what the API computes for the span.
const MON = Date.UTC(2027, 5, 21, 6)
const context = { projectDays: ['2027-06-21', '2027-06-22', '2027-06-23'], classes: ['5A', '5B', '6A'], activityMinimum: {} }

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

test('an activity without places and without classes is its teachers\' alone: it passes the rules, and nobody may rank it', () => {
  const duty: ItemRules = { ...choosable, places: 0, minParticipants: 0, cancellableBelowMin: false }
  assert.deepEqual(checkItem({ ...item, rules: duty }, context), [])
  assert.equal(isStaffOnly(duty), true)
  assert.equal(isEligible({ className: '6A', grade: 10 }, duty), false)
  // Places, or a class placed into it, make it an activity for students.
  assert.equal(isStaffOnly(choosable), false)
  assert.equal(isStaffOnly({ ...duty, fixedClasses: ['5A'] }), false)
  // A minimum above no places is refused like any minimum above the places.
  assert.deepEqual(checkItem({ ...item, rules: { ...duty, minParticipants: 3 } }, context).map((p) => p.code), ['min_above_places'])
})

test('an activity reaches the minimum length of each day it takes up part of the window, summed over its sessions; strictly, also the morning a trip comes back on', () => {
  const minimum = { ...context, activityMinimum: { '2027-06-21': 200, '2027-06-23': 300 } }
  const dates = (input: ItemInput) => checkItem(input, minimum).map((p) => `${p.code}@${p.date}`)
  // Monday credits 180 of 200: 20 short, counted in the day's window, which the message names.
  const windows = { '2027-06-21': { starts: '08:30', ends: '12:15' } }
  assert.deepEqual(dates(item), ['below_minimum_length@2027-06-21'])
  assert.deepEqual(lengthStandings(item, minimum.activityMinimum, minimum.projectDays, windows), [{ date: '2027-06-21', minimum: 200, credited: 180, met: false, missing: 20, window: { starts: '08:30', ends: '12:15' } }])
  // Two sessions on the day (an interruption) count together: 180 + 50.
  const later = session(MON + 5 * 60 * 60 * 1000, 1, ['2027-06-21'], [{ date: '2027-06-21', minutes: 50 }])
  assert.deepEqual(dates({ ...item, sessions: [monday, later] }), [])
  assert.deepEqual(lengthStandings({ ...item, sessions: [monday, later] }, minimum.activityMinimum, minimum.projectDays), [{ date: '2027-06-21', minimum: 200, credited: 230, met: true, missing: 0, window: null }])
  // A day without a minimum asks for nothing; Tuesday has none.
  const tuesday = session(MON + DAY, 2, ['2027-06-22'], [{ date: '2027-06-22', minutes: 100 }])
  assert.deepEqual(dates({ ...item, sessions: [tuesday] }), [])
  assert.deepEqual(lengthStandings({ ...item, sessions: [tuesday] }, minimum.activityMinimum, minimum.projectDays), [])
  // The trip comes back on Wednesday with 240 of 300 inside the window: the night away does not make up for the rest of the day.
  assert.deepEqual(dates({ ...item, sessions: [vienna] }), ['below_minimum_length@2027-06-23'])
  // Back by the window's start, it credits Wednesday nothing and is not held to Wednesday's minimum.
  const backByStart = session(MON + DAY, 24, ['2027-06-22', '2027-06-23'], [{ date: '2027-06-22', minutes: 360 }, { date: '2027-06-23', minutes: 0 }])
  assert.deepEqual(dates({ ...item, sessions: [backByStart] }), [])
  // An extra in the evening credits nothing: no minimum holds it.
  const evening = session(MON + 11 * 60 * 60 * 1000, 3, ['2027-06-21'], [{ date: '2027-06-21', minutes: 0 }])
  assert.deepEqual(dates({ ...item, sessions: [evening] }), [])
  // A class activity is held to it like any other; one of its teachers alone is not.
  assert.deepEqual(dates({ ...item, rules: { ...choosable, fixedClasses: ['5A'], places: 0, minParticipants: 0, cancellableBelowMin: false } }), ['below_minimum_length@2027-06-21'])
  assert.deepEqual(dates({ ...item, rules: { ...choosable, places: 0, minParticipants: 0, cancellableBelowMin: false } }), [])
  // In the days' order, one problem per day short.
  const wednesday = session(MON + 2 * DAY, 2, ['2027-06-23'], [{ date: '2027-06-23', minutes: 100 }])
  assert.deepEqual(dates({ ...item, sessions: [monday, wednesday] }), ['below_minimum_length@2027-06-21', 'below_minimum_length@2027-06-23'])
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
  // A session that credits nothing is an extra, not a problem.
  assert.deepEqual(codes({ ...item, sessions: [{ ...monday, credits: [{ date: '2027-06-21', minutes: 0 }] }] }), [])
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

// The credit a session earns: its clock minutes inside the day's window, on a zone-free clock, a day 24 hours long. The window of
// the frame 2.–5. EH on the default grid: 08:30 to 12:15.
const HOUR = 60 * 60 * 1000
const clock = (time: string, dayIndex = 0): number => dayIndex * DAY + (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * 60_000
const windowDay = (date: string, dayIndex: number, starts = '08:30', ends = '12:15'): CreditDay => ({ date, startMs: clock(starts, dayIndex), endMs: clock(ends, dayIndex) })
const mondayWindow = windowDay('2027-06-21', 0)
const tuesdayWindow = windowDay('2027-06-22', 1)

test('a session credits its clock minutes inside the window, breaks included: a trip from 08:45 counts what it lasts', () => {
  // 08:45–10:30: 105 minutes, whatever breaks lie inside.
  assert.deepEqual(creditsOf({ startMs: clock('08:45'), endMs: clock('10:30') }, [mondayWindow]), [{ date: '2027-06-21', minutes: 105 }])
  // The 2nd and 3rd period, 08:30–10:15: 105 as well.
  assert.deepEqual(creditsOf({ startMs: clock('08:30'), endMs: clock('10:15') }, [mondayWindow]), [{ date: '2027-06-21', minutes: 105 }])
  // 09:00–13:00: 195, the time after the window not.
  assert.deepEqual(creditsOf({ startMs: clock('09:00'), endMs: clock('13:00') }, [mondayWindow]), [{ date: '2027-06-21', minutes: 195 }])
  // From before the window until the evening: the window, 225.
  assert.deepEqual(creditsOf({ startMs: clock('07:00'), endMs: clock('21:00') }, [mondayWindow]), [{ date: '2027-06-21', minutes: 225 }])
})

test('a session over several days credits each date by its own window; a return by the window\'s start credits that day nothing', () => {
  // Monday 08:30 to Tuesday 10:30: Monday the whole window, Tuesday until 10:30.
  assert.deepEqual(creditsOf({ startMs: clock('08:30'), endMs: clock('10:30', 1) }, [mondayWindow, tuesdayWindow]), [{ date: '2027-06-21', minutes: 225 }, { date: '2027-06-22', minutes: 120 }])
  // Back at 08:30, as the window opens: Tuesday is touched and credits nothing; so is a return in the night.
  assert.deepEqual(creditsOf({ startMs: clock('08:30'), endMs: clock('08:30', 1) }, [mondayWindow, tuesdayWindow]), [{ date: '2027-06-21', minutes: 225 }, { date: '2027-06-22', minutes: 0 }])
  assert.deepEqual(creditsOf({ startMs: clock('08:30'), endMs: clock('02:00', 1) }, [mondayWindow, tuesdayWindow]), [{ date: '2027-06-21', minutes: 225 }, { date: '2027-06-22', minutes: 0 }])
})

test('a session wholly outside the window credits nothing: an activity of such sessions is an extra', () => {
  const evening = creditsOf({ startMs: clock('19:00'), endMs: clock('22:00') }, [mondayWindow])
  assert.deepEqual(evening, [{ date: '2027-06-21', minutes: 0 }])
  assert.equal(isExtra([{ credits: evening }]), true)
  // One minute in a window makes an activity none, and so does a session of it on another day.
  assert.equal(isExtra([{ credits: [{ date: '2027-06-21', minutes: 1 }] }]), false)
  assert.equal(isExtra([{ credits: evening }, { credits: [{ date: '2027-06-22', minutes: 100 }] }]), false)
  assert.equal(isExtra([]), false)
  // The day summer time ends has 25 hours: no credit is above a day's minutes.
  assert.deepEqual(creditsOf({ startMs: 0, endMs: 25 * HOUR }, [{ date: '2027-10-31', startMs: 0, endMs: 25 * HOUR }]), [{ date: '2027-10-31', minutes: 1440 }])
})

test('what the derivation gives passes the rules of an activity', () => {
  const span = { startMs: MON, endMs: MON + 4 * HOUR }
  const day: CreditDay = { date: '2027-06-21', startMs: MON, endMs: MON + 50 * 60_000 }
  const credits = creditsOf(span, [day])
  assert.deepEqual(credits, [{ date: '2027-06-21', minutes: 50 }])
  assert.deepEqual(checkItem({ ...item, sessions: [{ ...span, dates: ['2027-06-21'], credits }] }, context), [])
})

test('one of an activity\'s teachers leads: an activity with teachers names its lead, and names one of them', () => {
  const codes = (input: ItemInput) => checkItem(input, context).map((p) => p.code)
  const two: ItemInput = { ...item, teachers: ['t1', 't2'] }
  assert.deepEqual(codes({ ...two, lead: 't2' }), [])
  assert.deepEqual(codes({ ...two, lead: null }), ['no_lead'])
  assert.deepEqual(codes({ ...two, lead: 't3' }), ['lead_not_teacher'])
  // Without teachers there is one problem, not two; where the lead is not what is checked, it is left out.
  assert.deepEqual(codes({ ...two, teachers: [], lead: null }), ['no_teacher'])
  assert.deepEqual(codes(two), [])
})
