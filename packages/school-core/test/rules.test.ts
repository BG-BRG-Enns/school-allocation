import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkAllocationInput, compilePass, prepareStudent, solverItems } from '../src/allocation-compile.ts'
import { checkMove } from '../src/allocation-change.ts'
import { explainStudent, summarizeAllocation } from '../src/allocation-explain.ts'
import { levelNames, type AllocationInput, type AllocationItem, type AllocationStudent, type Assignment } from '../src/allocation-model.ts'
import { recomputeLevels } from '../src/allocation-validate.ts'
import type { ItemRules, SessionInput } from '../src/catalogue.ts'
import { timeGroupsOf } from '../src/choices.ts'
import { checkRules, rankingReach, ruleAmount, ruleApplies, ruleDemand, ruleReaches, type CampaignRule } from '../src/rules.ts'

// Monday 2027-06-21 and Tuesday, Vienna time (UTC+2). Monday has a morning
// group (football, dance, climbing) and an afternoon group (handball,
// crafts); Tuesday a morning group (careers, museum). 5A is fixed into a
// sports day on Tuesday afternoon. Football, handball and the sports day
// are sport; careers is IBOBB. Daily minimum 180 for grade 9, 120 for 10.
const DAYS = ['2027-06-21', '2027-06-22']
const SPORT = 'sport'
const IBOBB = 'ibobb'
const at = (day: number, hour: number) => Date.UTC(2027, 5, 21 + day, hour - 2)
const session = (day: number, from: number, to: number, minutes: number): SessionInput => ({ startMs: at(day, from), endMs: at(day, to), dates: [DAYS[day] as string], credits: [{ date: DAYS[day] as string, minutes }] })
const open: ItemRules = { fixedClasses: [], eligibleGrades: [], eligibleClasses: [], places: 10, minParticipants: 0, cancellableBelowMin: true }
const item = (id: string, sessions: SessionInput[], categoryIds: string[] = [], rules: Partial<ItemRules> = {}, feeCents = 0): AllocationItem => ({ id, feeCents, rules: { ...open, ...rules }, sessions, categoryIds })
const ITEMS: AllocationItem[] = [
  item('football', [session(0, 8, 11, 180)], [SPORT]),
  item('dance', [session(0, 8, 11, 180)]),
  item('climbing', [session(0, 8, 11, 180)], [SPORT], {}, 1500),
  item('handball', [session(0, 11, 13, 120)], [SPORT]),
  item('crafts', [session(0, 11, 13, 120)]),
  item('careers', [session(1, 8, 11, 180)], [IBOBB]),
  item('museum', [session(1, 8, 11, 180)]),
  item('sportsday', [session(1, 11, 13, 120)], [SPORT], { fixedClasses: ['5A'], places: 0, cancellableBelowMin: false }),
]
const RULES: CampaignRule[] = [
  { id: 'r-sport', categoryId: SPORT, grades: [9, 10], classes: [], unit: 'items', minimum: 1 },
  { id: 'r-ibobb', categoryId: IBOBB, grades: [10], classes: ['6A'], unit: 'minutes', minimum: 180 },
]
const key = (id: string) => (ITEMS.find((i) => i.id === id) as AllocationItem).sessions.map((s) => `${s.startMs}-${s.endMs}`).join('+')
const MON_AM = key('dance')
const MON_PM = key('crafts')
const TUE_AM = key('museum')
const student = (personId: string, className: string, grade: number, fixedItemIds: string[], ranking: AllocationStudent['ranking']): AllocationStudent => ({ personId, className, grade, fixedItemIds, ranking, savedIn: 'first' })
const INPUT: AllocationInput = {
  projectDays: DAYS,
  dailyMinimum: { 9: 180, 10: 180 },
  wishesPerGroup: 2,
  seed: 7,
  limits: { deterministicTimePerLevel: 5 },
  rules: RULES,
  items: ITEMS,
  students: [
    // Ann (5A, grade 9) has the sports day: her sport rule is met before she ranks anything.
    student('ann', '5A', 9, ['sportsday'], { [MON_AM]: ['dance'], [TUE_AM]: ['museum'] }),
    // Ben (6A, grade 10) ranks dance and the museum: no sport and no careers among his wishes.
    student('ben', '6A', 10, [], { [MON_AM]: ['dance'], [TUE_AM]: ['museum'] }),
  ],
}
const byId = new Map(ITEMS.map((i) => [i.id, i]))

test('a rule asks for activities or minutes of its category, of the grades and classes it names; the list of rules is checked', () => {
  const sport = RULES[0] as CampaignRule
  const ibobb = RULES[1] as CampaignRule
  assert.equal(ruleApplies(sport, { className: '5A', grade: 9 }), true)
  assert.equal(ruleApplies(ibobb, { className: '6B', grade: 10 }), false, 'the classes limit it')
  assert.equal(ruleApplies(ibobb, { className: '6A', grade: 9 }), false)
  assert.equal(ruleAmount(sport, byId.get('football') as AllocationItem, DAYS), 1)
  assert.equal(ruleAmount(sport, byId.get('dance') as AllocationItem, DAYS), 0)
  assert.equal(ruleAmount(ibobb, byId.get('careers') as AllocationItem, DAYS), 180)
  assert.equal(ruleAmount(ibobb, byId.get('careers') as AllocationItem, ['2027-06-21']), 0, 'minutes on the project days only')
  assert.deepEqual(checkRules([
    { categoryId: SPORT, grades: [9], classes: [], unit: 'items', minimum: 1 },
    { categoryId: 'nope', grades: [], classes: [], unit: 'minutes', minimum: 0 },
    { categoryId: SPORT, grades: [9], classes: [], unit: 'items', minimum: 21 },
  ], new Set([SPORT, IBOBB])), [
    { code: 'category_unknown', rule: 1 },
    { code: 'grades_missing', rule: 1 },
    { code: 'minimum_out_of_range', rule: 1 },
    { code: 'minimum_out_of_range', rule: 2 },
  ])
})

test('the choice page: a list does what it can for each rule, per time group its best ranked activity of the category; the offer limits what is asked', () => {
  const groups = timeGroupsOf(ITEMS.filter((i) => i.rules.places > 0 && i.id !== 'climbing'))
  const ranking = { [MON_AM]: ['dance', 'football'], [MON_PM]: ['handball'] }
  assert.equal(rankingReach(RULES[0] as CampaignRule, ranking, groups, byId, DAYS), 2, 'one per group: football and handball')
  const ben = ruleReaches(RULES, { className: '6A', grade: 10 }, [], { [MON_AM]: ['dance'] }, groups, byId, DAYS, 2)
  assert.deepEqual(ben.map((r) => [r.ruleId, r.fixed, r.ranked, r.offered, r.done]), [['r-sport', 0, 0, 2, false], ['r-ibobb', 0, 0, 180, false]])
  const better = ruleReaches(RULES, { className: '6A', grade: 10 }, [], { [MON_AM]: ['football'], [TUE_AM]: ['careers'] }, groups, byId, DAYS, 2)
  assert.deepEqual(better.map((r) => r.done), [true, true])
  const ann = ruleReaches(RULES, { className: '5A', grade: 9 }, [byId.get('sportsday') as AllocationItem], {}, groups, byId, DAYS, 2)
  assert.deepEqual(ann.map((r) => [r.ruleId, r.fixed, r.done]), [['r-sport', 1, true]], 'the class activity meets it')
  // Nothing of the category offered: a rule cannot ask the impossible of a list.
  const noSport = timeGroupsOf(ITEMS.filter((i) => ['dance', 'crafts', 'museum', 'careers'].includes(i.id)))
  assert.deepEqual(ruleReaches(RULES, { className: '6A', grade: 10 }, [], {}, noSport, byId, DAYS, 2).map((r) => [r.ruleId, r.offered, r.done]), [['r-sport', 0, true], ['r-ibobb', 180, false]])
})

test('the choice page: where the cap leaves a time group no room for every rule, a list is done when no single wish brings one closer without costing another', () => {
  const CREATIVE = 'creative'
  const tight = [
    item('football', [session(0, 8, 11, 180)], [SPORT]),
    item('dance', [session(0, 8, 11, 180)], [CREATIVE]),
    item('museum', [session(0, 8, 11, 180)]),
    item('handball', [session(0, 11, 13, 120)], [SPORT]),
    item('crafts', [session(0, 11, 13, 120)], [CREATIVE]),
  ]
  const tightById = new Map(tight.map((i) => [i.id, i]))
  const both = (minimum: number): CampaignRule[] => [
    { id: 'r-sport', categoryId: SPORT, grades: [10], classes: [], unit: 'items', minimum },
    { id: 'r-creative', categoryId: CREATIVE, grades: [10], classes: [], unit: 'items', minimum },
  ]
  const done = (rules: CampaignRule[], items: AllocationItem[], ranking: Record<string, string[]>, cap: number) =>
    ruleReaches(rules, { className: '6A', grade: 10 }, [], ranking, timeGroupsOf(items), tightById, DAYS, cap).map((r) => r.done)
  const morning = tight.slice(0, 3)
  // One morning group and one wish: sport or creative, never both. Either is the most a list can do.
  assert.deepEqual(done(both(1), morning, { [MON_AM]: ['football'] }, 1), [true, true])
  assert.deepEqual(done(both(1), morning, { [MON_AM]: ['dance'] }, 1), [true, true])
  // A wish that serves no rule could make room for either.
  assert.deepEqual(done(both(1), morning, { [MON_AM]: ['museum'] }, 1), [false, false])
  // With two wishes there is room for dance as well.
  assert.deepEqual(done(both(1), morning, { [MON_AM]: ['football'] }, 2), [true, false])
  // Football and handball meet sport twice over: dance in the morning would cost it nothing.
  assert.deepEqual(done(both(1), tight, { [MON_AM]: ['football'], [MON_PM]: ['handball'] }, 1), [true, false])
  // Two of each asked and one wish per group: one of each goes as far as a list can, a trade gains nothing.
  assert.deepEqual(done(both(2), tight, { [MON_AM]: ['football'], [MON_PM]: ['crafts'] }, 1), [true, true])
})

test('the compiler: a class activity counts toward a rule, open rules bring fee-free fallbacks on covered days, and the request carries each rule with its amounts', () => {
  const items = solverItems(INPUT, new Set())
  const ann = prepareStudent(INPUT, INPUT.students[0] as AllocationStudent, items)
  assert.deepEqual(ann.rules, [], 'the sports day met her rule')
  const ben = prepareStudent(INPUT, INPUT.students[1] as AllocationStudent, items)
  assert.deepEqual(ben.rules.map((r) => [r.rule.id, r.need]), [['r-sport', 1], ['r-ibobb', 180]])
  // Monday morning is covered by his wish (dance), yet football and handball come as fallbacks for the sport rule;
  // climbing costs and never does; careers comes for IBOBB.
  assert.deepEqual(ben.options.map((o) => [o.itemId, o.kind, [...o.amounts]]), [
    ['careers', 'fallback', [['r-ibobb', 180]]],
    ['crafts', 'fallback', []],
    ['dance', 'wish', []],
    ['football', 'fallback', [['r-sport', 1]]],
    ['handball', 'fallback', [['r-sport', 1]]],
    ['museum', 'wish', []],
  ])
  const pass = compilePass(INPUT, 1, 'run-r')
  assert.deepEqual(pass.request.levels, levelNames(2, true))
  assert.deepEqual(pass.request.levels.slice(2, 5), ['students_missing_rule', 'rule_missing_items', 'rule_missing_minutes'])
  const o = (id: string) => pass.itemIds.indexOf(id)
  const benRequest = pass.request.students[pass.personIds.indexOf('ben')]
  assert.deepEqual(benRequest?.rules, [
    { r: 0, unit: 'items', need: 1, amounts: [{ o: o('football'), n: 1 }, { o: o('handball'), n: 1 }].sort((a, b) => a.o - b.o) },
    { r: 1, unit: 'minutes', need: 180, amounts: [{ o: o('careers'), n: 180 }] },
  ])
  assert.deepEqual(compilePass({ ...INPUT, rules: [] }, 1, 'run-r').request.levels, levelNames(2), 'without rules, no rule levels')
})

test('a student whose days are covered is still in the pass for a rule, and has no average rank to be over', () => {
  // Grade 10 needs nothing on the days here; only the sport rule is left.
  const input: AllocationInput = { ...INPUT, dailyMinimum: { 9: 180, 10: 0 }, students: [student('ben', '6A', 10, [], { [MON_AM]: ['dance'] })], rules: [RULES[0] as CampaignRule] }
  const pass = compilePass(input, 1, 'run-r')
  assert.deepEqual(pass.personIds, ['ben'])
  const levels = recomputeLevels(pass, [['ben', 'football']])
  assert.deepEqual(Object.fromEntries(levels.map((l) => [l.name, l.value])), {
    'students_with_deficit': 0, 'deficit_minutes': 0, 'students_missing_rule': 0, 'rule_missing_items': 0, 'rule_missing_minutes': 0, 'over:2000': 0, 'total_cost': 0, 'tiebreak': levels.at(-1)?.value,
  })
})

test('a student whose class activities cover the days ranks for a rule as for the days: the first wish, the second, then a fallback', () => {
  // 6C's trip takes both mornings, more than grade 10's minimum; Monday afternoon is open, and only the sport rule is left.
  const trip = item('trip', [session(0, 8, 11, 180), session(1, 8, 11, 180)], [], { fixedClasses: ['6C'], places: 0, cancellableBelowMin: false })
  const input: AllocationInput = {
    ...INPUT,
    dailyMinimum: { 9: 180, 10: 120 },
    items: [...ITEMS, trip, item('volleyball', [session(0, 11, 13, 120)], [SPORT]), item('badminton', [session(0, 11, 13, 120)], [SPORT])],
    rules: [RULES[0] as CampaignRule],
    students: [student('cleo', '6C', 10, ['trip'], { [MON_PM]: ['volleyball', 'handball'] })],
  }
  const pass = compilePass(input, 1, 'run-r')
  assert.deepEqual(pass.personIds, ['cleo'])
  assert.equal(pass.request.students[0]?.norm, 0, 'no average rank to be over')
  const cost = (id: string) => pass.request.students[0]?.options.find((o) => o.o === pass.itemIds.indexOf(id))?.cost ?? -1
  assert.ok(cost('volleyball') > 0)
  assert.ok(cost('volleyball') < cost('handball') && cost('handball') < cost('badminton'), 'the wishes decide, before the unranked fallback')
  const levels = (itemId: string) => Object.fromEntries(recomputeLevels(pass, [['cleo', itemId]]).map((l) => [l.name, l.value]))
  assert.equal(levels('volleyball').students_missing_rule, 0)
  assert.equal(levels('badminton').students_missing_rule, 0)
  assert.ok((levels('volleyball').total_cost as number) < (levels('badminton').total_cost as number))
})

test('the validator recomputes the rule levels from the assignment', () => {
  const pass = compilePass(INPUT, 1, 'run-r')
  const values = (pairs: [string, string][]) => Object.fromEntries(recomputeLevels(pass, pairs).filter((l) => l.name.includes('rule')).map((l) => [l.name, l.value]))
  assert.deepEqual(values([['ann', 'dance'], ['ann', 'museum'], ['ben', 'dance'], ['ben', 'museum']]), { students_missing_rule: 1, rule_missing_items: 1, rule_missing_minutes: 180 })
  assert.deepEqual(values([['ann', 'dance'], ['ann', 'museum'], ['ben', 'football'], ['ben', 'museum']]), { students_missing_rule: 1, rule_missing_items: 0, rule_missing_minutes: 180 })
  assert.deepEqual(values([['ann', 'dance'], ['ann', 'museum'], ['ben', 'football'], ['ben', 'careers']]), { students_missing_rule: 0, rule_missing_items: 0, rule_missing_minutes: 0 })
})

test('a rule the places of its category cannot meet for a grade is named before the run', () => {
  const tight: AllocationInput = { ...INPUT, items: ITEMS.map((i) => (i.id === 'careers' ? { ...i, rules: { ...i.rules, places: 0 } } : i)) }
  assert.deepEqual(checkAllocationInput(tight).warnings, [{ code: 'rule_out_of_reach', ruleId: 'r-ibobb', grade: 10, possible: 0, needed: 180 }])
  assert.deepEqual(checkAllocationInput(INPUT).warnings, [])
})

const rows = (personId: string, ...itemIds: string[]): Assignment[] => itemIds.map((itemId) => ({ personId, itemId, source: 'wish', pass: 1, rank: 1 }))

test('the explanation and the summary: each rule with what it asks and what the items bring, and who misses it', () => {
  const assignments: Assignment[] = [{ personId: 'ann', itemId: 'sportsday', source: 'fixed', pass: null, rank: null }, ...rows('ann', 'dance', 'museum'), ...rows('ben', 'football', 'museum')]
  assert.deepEqual(explainStudent(INPUT, assignments, 'ann')?.rules, [{ ruleId: 'r-sport', categoryId: SPORT, unit: 'items', minimum: 1, have: 1, met: true }])
  assert.deepEqual(explainStudent(INPUT, assignments, 'ben')?.rules.map((r) => [r.ruleId, r.have, r.met]), [['r-sport', 1, true], ['r-ibobb', 0, false]])
  const summary = summarizeAllocation(INPUT, assignments, [])
  assert.equal(summary.students.missingRule, 1)
  assert.deepEqual(summary.rules, [{ ruleId: 'r-sport', students: 2, met: 2 }, { ruleId: 'r-ibobb', students: 1, met: 0 }])
  assert.deepEqual(summary.ruleGaps, [{ personId: 'ben', ruleId: 'r-ibobb', missing: 180 }])
})

test('after publication: a move that leaves a rule short is refused unless the organizer forces it, a removal alone is not; a placement closing a rule gap fills one', () => {
  const placed = rows('ben', 'football', 'crafts', 'museum')
  const swapToDance = { personId: 'ben', toItemId: 'dance', leaves: ['football'] }
  assert.deepEqual(checkMove(INPUT, placed, swapToDance), [{ code: 'rule_lost', itemId: 'dance' }])
  assert.deepEqual(checkMove(INPUT, placed, swapToDance, { force: true }), [])
  // A removal alone may cost a rule, as it may cost minutes: the student is out of the item either way.
  assert.deepEqual(checkMove(INPUT, placed, { personId: 'ben', toItemId: null, leaves: ['football'] }), [])
  // From crafts to handball keeps the rule met and adds to it.
  assert.deepEqual(checkMove(INPUT, placed, { personId: 'ben', toItemId: 'handball', leaves: ['crafts'] }), [])
  // Every day covered: a seat in careers fills no day, but closes the IBOBB gap.
  assert.deepEqual(checkMove(INPUT, rows('ben', 'football', 'museum'), { personId: 'ben', toItemId: 'careers', leaves: ['museum'] }), [])
  const covered: Assignment[] = [{ personId: 'ann', itemId: 'sportsday', source: 'fixed', pass: null, rank: null }, ...rows('ann', 'dance', 'crafts', 'museum')]
  assert.deepEqual(checkMove(INPUT, covered, { personId: 'ann', toItemId: 'handball', leaves: [] }).map((p) => p.code), ['overlap', 'fills_nothing'], 'her rule is met: nothing to fill')
})

test('the places page: per rule and grade the need after class activities against the category places the grade may take', () => {
  const classes = [{ className: '5A', grade: 9, students: 20 }, { className: '5B', grade: 9, students: 10 }, { className: '6A', grade: 10, students: 25 }, { className: '6B', grade: 10, students: 5 }]
  const offers = ITEMS.map((i) => ({ ...i.rules, categoryIds: i.categoryIds, sessions: i.sessions }))
  assert.deepEqual(ruleDemand(RULES, classes, offers, DAYS), [
    // 5A's sports day meets the rule: only 5B needs a sport activity; football, climbing and handball offer 10 places each.
    { ruleId: 'r-sport', grade: 9, students: 30, needed: 10, offered: 30 },
    { ruleId: 'r-sport', grade: 10, students: 30, needed: 30, offered: 30 },
    // Only 6A: 180 minutes each, careers' 10 places bring 180 minutes each.
    { ruleId: 'r-ibobb', grade: 10, students: 25, needed: 25 * 180, offered: 1800 },
  ])
})
