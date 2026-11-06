// The placements as the demand takes them (lib/placements.ts), on plain
// rows: no database.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { OfferedItem } from '@school-allocation/school-core'
import type { PlacementRecord } from '../lib/dao/pre-assignments.ts'
import { directlyPlaced, placementsByPerson, withPlacements } from '../lib/placements.ts'

const HOUR = 60 * 60 * 1000
const item = (places: number, from: number, to: number, fixedClasses: string[] = []): OfferedItem => ({ fixedClasses, eligibleGrades: [], eligibleClasses: [], places, sessions: [{ startMs: from * HOUR, endMs: to * HOUR }] })
// The trip takes 5A from 8 to 18; the workshop 8–12 and the rehearsal 10–11 lie inside it, the evening course after it.
const items = new Map<string, OfferedItem>([['trip', item(0, 8, 18, ['5A'])], ['workshop', item(5, 8, 12)], ['rehearsal', item(0, 10, 11)], ['evening', item(10, 19, 21)]])
const classOf = new Map([['sara', '5A'], ['tim', '5A'], ['mia', '6A']])
const row = (itemId: string, personId: string, source: 'class' | 'direct', flags: { exempted?: boolean, leavesClass?: boolean } = {}): PlacementRecord => ({ itemId, personId, source, exempted: flags.exempted ?? false, leavesClass: flags.leavesClass ?? true })

const placedOf = (result: Map<string, OfferedItem>, id: string) => (result.get(id)?.placed ?? []).map((p) => `${p.personId}:${p.className}:${p.beside ? 'beside' : 'instead'}`)
const awayOf = (result: Map<string, OfferedItem>, id: string) => (result.get(id)?.away ?? []).map((a) => `${a.personId}:${a.className}`)

test('a direct placement takes a place of its activity and takes its student out of the class activity it overlaps', () => {
  const result = withPlacements(items, [row('workshop', 'sara', 'direct'), row('workshop', 'mia', 'direct')], classOf)
  assert.equal(result.get('workshop')?.places, 3)
  assert.deepEqual(placedOf(result, 'workshop'), ['mia:6A:instead', 'sara:5A:instead'])
  assert.deepEqual(awayOf(result, 'trip'), ['sara:5A'])
  // Nothing for an activity nobody is placed into, and nothing for the trip from a placement after it.
  assert.deepEqual([result.get('evening')?.placed, result.get('evening')?.away, result.get('evening')?.places], [undefined, undefined, 10])
  assert.deepEqual(awayOf(withPlacements(items, [row('evening', 'sara', 'direct')], classOf), 'trip'), [])
})

test('beside the class activity a student stays in it; out of it, by hand or by another placement, their placement beside it is one instead of it', () => {
  const beside = withPlacements(items, [row('rehearsal', 'tim', 'direct', { leavesClass: false })], classOf)
  assert.deepEqual([placedOf(beside, 'rehearsal'), awayOf(beside, 'trip')], [['tim:5A:beside'], []])
  // On the trip's list and rehearsing: out of the trip once, and placed, so not someone who needs a place during the rehearsal.
  const listed = withPlacements(items, [row('trip', 'tim', 'class', { exempted: true }), row('rehearsal', 'tim', 'direct', { leavesClass: false })], classOf)
  assert.deepEqual([placedOf(listed, 'rehearsal'), awayOf(listed, 'trip')], [['tim:5A:instead'], ['tim:5A']])
  // Out of the trip by the workshop: the rehearsal has no class activity left to be beside.
  const taken = withPlacements(items, [row('workshop', 'tim', 'direct'), row('evening', 'tim', 'direct', { leavesClass: false }), row('rehearsal', 'sara', 'direct', { leavesClass: false })], classOf)
  assert.deepEqual([placedOf(taken, 'evening'), placedOf(taken, 'rehearsal'), awayOf(taken, 'trip')], [['tim:5A:instead'], ['sara:5A:beside'], ['tim:5A']])
  // Out by the list and by a placement at once: one student, once.
  const both = withPlacements(items, [row('trip', 'sara', 'class', { exempted: true }), row('workshop', 'sara', 'direct')], classOf)
  assert.deepEqual(awayOf(both, 'trip'), ['sara:5A'])
  // The class rows need not be written yet: before the window opens there are none, and the trip is 5A's all the same.
  assert.deepEqual(awayOf(withPlacements(items, [row('trip', 'sara', 'class'), row('workshop', 'sara', 'direct')], classOf), 'trip'), ['sara:5A'])
})

test('rows of people who are not the campaign\'s students, and of activities that are not counted, count for nothing', () => {
  const rows = [row('workshop', 'gone', 'direct'), row('workshop', 'sara', 'direct'), row('withdrawn', 'tim', 'direct'), row('trip', 'gone', 'class', { exempted: true })]
  const result = withPlacements(items, rows, classOf)
  assert.equal(result.get('workshop')?.places, 4)
  assert.deepEqual(awayOf(result, 'trip'), ['sara:5A'])
  const fixedClassesOf = new Map([...items].map(([id, item]) => [id, item.fixedClasses]))
  assert.deepEqual([...directlyPlaced(rows, classOf, fixedClassesOf)], [['workshop', 1], ['withdrawn', 1]])
  // Placed into the trip directly before 5A became its class: with the class, and no place taken; Mia, of another class, takes one.
  assert.deepEqual([...directlyPlaced([row('trip', 'sara', 'direct'), row('trip', 'mia', 'direct')], classOf, fixedClassesOf)], [['trip', 1]])
  assert.equal(withPlacements(new Map([['trip', item(5, 8, 18, ['5A'])]]), [row('trip', 'sara', 'direct'), row('trip', 'mia', 'direct')], classOf).get('trip')?.places, 4)
  assert.deepEqual([...placementsByPerson(rows)].map(([personId, own]) => [personId, own.length]), [['gone', 2], ['sara', 1], ['tim', 1]])
})
