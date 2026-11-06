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

test('a direct placement takes a place of its activity and takes its student out of the class activity it overlaps', () => {
  const result = withPlacements(items, [row('workshop', 'sara', 'direct'), row('workshop', 'mia', 'direct')], classOf)
  assert.equal(result.get('workshop')?.places, 3)
  assert.deepEqual(result.get('workshop')?.placed, [{ className: '5A', leaving: 1, beside: 0 }, { className: '6A', leaving: 1, beside: 0 }])
  assert.deepEqual(result.get('trip')?.away, [{ className: '5A', students: 1 }])
  // Nothing for an activity nobody is placed into, and nothing for the trip after it.
  assert.deepEqual([result.get('evening')?.placed, result.get('evening')?.away, result.get('evening')?.places], [undefined, undefined, 10])
  assert.deepEqual(withPlacements(items, [row('evening', 'sara', 'direct')], classOf).get('trip')?.away, undefined)
})

test('beside the class activity a student stays in it; taken out of it by hand, their placement beside it counts as one instead of it', () => {
  const beside = withPlacements(items, [row('rehearsal', 'tim', 'direct', { leavesClass: false })], classOf)
  assert.deepEqual([beside.get('rehearsal')?.placed, beside.get('trip')?.away], [[{ className: '5A', leaving: 0, beside: 1 }], undefined])
  // On the trip's list and rehearsing: out of the trip once, and placed, so not someone who needs a place during the rehearsal.
  const listed = withPlacements(items, [row('trip', 'tim', 'class', { exempted: true }), row('rehearsal', 'tim', 'direct', { leavesClass: false })], classOf)
  assert.deepEqual([listed.get('rehearsal')?.placed, listed.get('trip')?.away], [[{ className: '5A', leaving: 1, beside: 0 }], [{ className: '5A', students: 1 }]])
  // Out by the list and by a placement at once: one student, counted once.
  const both = withPlacements(items, [row('trip', 'sara', 'class', { exempted: true }), row('workshop', 'sara', 'direct')], classOf)
  assert.deepEqual(both.get('trip')?.away, [{ className: '5A', students: 1 }])
})

test('rows of people who are not the campaign\'s students, and of activities that are not counted, count for nothing', () => {
  const rows = [row('workshop', 'gone', 'direct'), row('workshop', 'sara', 'direct'), row('withdrawn', 'tim', 'direct'), row('trip', 'gone', 'class', { exempted: true })]
  const result = withPlacements(items, rows, classOf)
  assert.equal(result.get('workshop')?.places, 4)
  assert.deepEqual(result.get('trip')?.away, [{ className: '5A', students: 1 }])
  assert.deepEqual([...directlyPlaced(rows, classOf)], [['workshop', 1], ['withdrawn', 1]])
  assert.deepEqual([...placementsByPerson(rows)].map(([personId, own]) => [personId, own.length]), [['gone', 2], ['sara', 1], ['tim', 1]])
})
