import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectivePlacements, rankablePlaces, type PlacedItem, type PlacementRow } from '../src/placements.ts'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const span = (day: number, from: number, to: number) => ({ startMs: day * DAY + from * HOUR, endMs: day * DAY + to * HOUR })
// London: Monday 08:00 to Friday 18:00, the class's. On Monday a rehearsal 10–11 and a workshop 08–12; on Tuesday the lab 08–12; the hike on Saturday.
const items = new Map<string, PlacedItem>([
  ['london', { id: 'london', sessions: [{ startMs: span(0, 8, 8).startMs, endMs: span(4, 18, 18).endMs }] }],
  ['rehearsal', { id: 'rehearsal', sessions: [span(0, 10, 11)] }],
  ['workshop', { id: 'workshop', sessions: [span(0, 8, 12)] }],
  ['lab', { id: 'lab', sessions: [span(1, 8, 12)] }],
  ['hike', { id: 'hike', sessions: [span(5, 8, 12)] }],
])
const byClass = (itemId: string, exempted = false): PlacementRow => ({ itemId, source: 'class', exempted, leavesClass: true })
const direct = (itemId: string, leavesClass = true): PlacementRow => ({ itemId, source: 'direct', exempted: false, leavesClass })

test('a class placement holds; taken out by hand, the student is out of the class activity and in nothing', () => {
  assert.deepEqual(effectivePlacements([byClass('london')], items), { itemIds: ['london'], besideClassItemIds: [], left: [] })
  assert.deepEqual(effectivePlacements([byClass('london', true)], items), { itemIds: [], besideClassItemIds: [], left: [{ itemId: 'london', by: 'exempted', directItemIds: [] }] })
})

test('a direct placement beats a class placement: the student is out of the whole class activity it overlaps, and free for the rest of it', () => {
  // The workshop on Monday morning takes the student out of all of London, so the lab on Tuesday can take them too.
  const stays = effectivePlacements([byClass('london'), direct('workshop'), direct('lab')], items)
  assert.deepEqual(stays.itemIds, ['lab', 'workshop'])
  assert.deepEqual(stays.left, [{ itemId: 'london', by: 'direct', directItemIds: ['lab', 'workshop'] }])
  assert.deepEqual(stays.besideClassItemIds, [])
  // A class activity that does not overlap the direct placement is kept.
  assert.deepEqual(effectivePlacements([byClass('hike'), direct('workshop')], items).itemIds, ['hike', 'workshop'])
})

test('placed beside the class activity, the student stays in it and is only away for that time: the one pair that overlaps', () => {
  const beside = effectivePlacements([byClass('london'), direct('rehearsal', false)], items)
  assert.deepEqual(beside, { itemIds: ['london', 'rehearsal'], besideClassItemIds: ['rehearsal'], left: [] })
  // Beside nothing that holds, it is a placement like any other.
  assert.deepEqual(effectivePlacements([direct('rehearsal', false)], items).besideClassItemIds, [])
  assert.deepEqual(effectivePlacements([byClass('london', true), direct('rehearsal', false)], items), { itemIds: ['rehearsal'], besideClassItemIds: [], left: [{ itemId: 'london', by: 'exempted', directItemIds: [] }] })
  // One placement that leaves the class is enough: the one beside it has no class activity left to be beside.
  assert.deepEqual(effectivePlacements([byClass('london'), direct('rehearsal', false), direct('lab')], items), { itemIds: ['lab', 'rehearsal'], besideClassItemIds: [], left: [{ itemId: 'london', by: 'direct', directItemIds: ['lab'] }] })
})

test('a placement of an activity that does not count holds nothing and takes nobody out', () => {
  const approved = new Map([...items].filter(([id]) => id !== 'workshop'))
  assert.deepEqual(effectivePlacements([byClass('london'), direct('workshop')], approved), { itemIds: ['london'], besideClassItemIds: [], left: [] })
  assert.deepEqual(effectivePlacements([], items), { itemIds: [], besideClassItemIds: [], left: [] })
})

test('a direct placement takes a place and is not capped by the places', () => {
  assert.equal(rankablePlaces(20, 5), 15)
  assert.equal(rankablePlaces(5, 5), 0)
  assert.equal(rankablePlaces(0, 12), 0, 'an activity of placed students alone')
  assert.equal(rankablePlaces(20, 0), 20)
})
