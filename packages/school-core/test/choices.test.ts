import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ItemRules } from '../src/catalogue.ts'
import { checkRanking, groupKeyOf, isComplete, offeredTo, timeGroupsOf, wishesRequired, type OfferableItem } from '../src/choices.ts'

const H = 60 * 60 * 1000
// Monday 2027-06-21 08:30 Vienna (06:30Z), the periods of the default grid as spans.
const MON = Date.UTC(2027, 5, 21, 6, 30)
const span = (fromH: number, hours: number) => ({ startMs: MON + fromH * H, endMs: MON + (fromH + hours) * H })
const open: ItemRules = { fixedClasses: [], eligibleGrades: [], eligibleClasses: [], places: 20, minParticipants: 0, cancellableBelowMin: true }
const item = (id: string, sessions: { startMs: number, endMs: number }[], rules: Partial<ItemRules> = {}): OfferableItem => ({ id, sessions, rules: { ...open, ...rules } })

const minigolf = item('minigolf', [span(0, 2)])
const dance = item('dance', [span(0, 2)])
const tabletennis = item('tabletennis', [span(2, 2)])
const swimming = item('swimming', [span(1, 3)])
const morning = item('morning', [span(0, 4)])
const trip = item('trip', [{ startMs: MON + 24 * H, endMs: MON + 50 * H }])

test('items with the same spans form one group; groups follow their start; a multi-session item makes a group of its own', () => {
  const groups = timeGroupsOf([tabletennis, swimming, minigolf, dance, morning, trip])
  assert.deepEqual(groups.map((g) => g.itemIds), [['minigolf', 'dance'], ['morning'], ['swimming'], ['tabletennis'], ['trip']])
  assert.equal(groups[0]?.key, groupKeyOf(dance))
  const twoDays = item('two', [span(0, 2), { startMs: MON + 24 * H, endMs: MON + 26 * H }])
  assert.equal(timeGroupsOf([twoDays]).length, 1)
  assert.equal(groupKeyOf(twoDays), groupKeyOf(item('other', [{ startMs: MON + 24 * H, endMs: MON + 26 * H }, span(0, 2)])), 'the order of the sessions does not matter')
  assert.deepEqual(timeGroupsOf([item('none', [])]), [])
})

test('a student is offered what they may rank and what does not overlap their fixed items', () => {
  const student = { className: '5A', grade: 9 }
  const items = [minigolf, dance, tabletennis, trip, item('other', [span(0, 2)], { eligibleGrades: [10] }), item('own', [span(0, 2)], { fixedClasses: ['5A'], places: 5 })]
  assert.deepEqual(offeredTo(student, items, []).map((i) => i.id), ['minigolf', 'dance', 'tabletennis', 'trip'])
  // Fixed into something over the Monday morning: only the trip is left.
  assert.deepEqual(offeredTo(student, items, [span(0, 4)]).map((i) => i.id), ['trip'])
  // Touching end points do not overlap.
  assert.deepEqual(offeredTo(student, items, [span(2, 2)]).map((i) => i.id), ['minigolf', 'dance', 'trip'])
})

test('a ranking names offered groups and their items, each once, up to the cap; completeness asks every group for its wishes', () => {
  const groups = timeGroupsOf([minigolf, dance, tabletennis, swimming])
  const [first, second, third] = groups.map((g) => g.key) as [string, string, string]
  assert.deepEqual(checkRanking({ [first]: ['dance', 'minigolf'], [second]: ['swimming'], [third]: ['tabletennis'] }, groups, 3), [])
  assert.deepEqual(checkRanking({ nope: ['dance'] }, groups, 3), [{ code: 'unknown_group', group: 'nope' }])
  assert.deepEqual(checkRanking({ [first]: ['swimming'] }, groups, 3), [{ code: 'unknown_item', group: first }])
  assert.deepEqual(checkRanking({ [first]: ['dance', 'dance'] }, groups, 3), [{ code: 'item_twice', group: first }])
  assert.deepEqual(checkRanking({ [first]: ['dance', 'minigolf'] }, groups, 1), [{ code: 'too_many_wishes', group: first }])

  assert.equal(wishesRequired(groups[0] as never, 3), 2, 'two items, three wishes asked: two will do')
  assert.equal(wishesRequired(groups[1] as never, 3), 1)
  assert.equal(isComplete({ [first]: ['dance', 'minigolf'], [second]: ['swimming'], [third]: ['tabletennis'] }, groups, 3), true)
  assert.equal(isComplete({ [first]: ['dance'], [second]: ['swimming'], [third]: ['tabletennis'] }, groups, 3), false)
  assert.equal(isComplete({ [first]: ['dance'], [second]: ['swimming'], [third]: ['tabletennis'] }, groups, 1), true)
  assert.equal(isComplete({}, [], 3), true, 'nothing to choose is complete')
})
