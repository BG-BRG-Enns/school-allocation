import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byStart, firstStart, groupByStartDay } from '../src/lib/item-order.ts'

const item = (title: string, ...starts: string[]) => ({ title, sessions: starts.map((startsAt) => ({ startsAt })) })

test('the first start is the earliest session, whatever the order they were entered in', () => {
  assert.equal(firstStart(item('Chor', '2027-06-23T06:00:00Z', '2027-06-21T08:00:00Z')), '2027-06-21T08:00:00Z')
  assert.equal(firstStart(item('Entwurf')), '')
})

test('activities are ordered by their first start, then by title; one without a session is last', () => {
  const list = [
    item('Zirkus', '2027-06-21T06:30:00Z'),
    item('Entwurf'),
    item('Wien', '2027-06-22T06:00:00Z'),
    item('Äpfel pressen', '2027-06-21T06:30:00Z'),
    item('Klettern', '2027-06-21T05:35:00Z'),
  ]
  assert.deepEqual(byStart(list).map((i) => i.title), ['Klettern', 'Äpfel pressen', 'Zirkus', 'Wien', 'Entwurf'])
  assert.equal(list[0]?.title, 'Zirkus', 'the list handed over keeps its order')
})

test('activities stand under the day they start on, in the school\'s zone; a trip over two days stands once', () => {
  const groups = groupByStartDay([
    item('Wien', '2027-06-22T06:00:00Z', '2027-06-23T06:00:00Z'),
    item('Klettern', '2027-06-21T05:35:00Z'),
    // 22:30 UTC on the 21st is half past midnight on the 22nd in Vienna.
    item('Nachtwanderung', '2027-06-21T22:30:00Z'),
    item('Entwurf'),
  ])
  assert.deepEqual(groups.map((g) => [g.day, g.items.map((i) => i.title)]), [
    ['2027-06-21', ['Klettern']],
    ['2027-06-22', ['Nachtwanderung', 'Wien']],
    [null, ['Entwurf']],
  ])
})

test('no activities, no groups', () => {
  assert.deepEqual(groupByStartDay([]), [])
})
