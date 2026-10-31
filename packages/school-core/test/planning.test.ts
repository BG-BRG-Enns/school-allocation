import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leadOf } from '../src/planning.ts'

test('the proposer leads when among the teachers; otherwise the first named does; nobody leads an activity without teachers', () => {
  assert.equal(leadOf(['bernd', 'carla'], 'carla'), 'carla')
  assert.equal(leadOf(['bernd', 'carla'], 'anna'), 'bernd', 'an organizer created it on their behalf')
  assert.equal(leadOf(['bernd', 'carla'], null), 'bernd', 'a proposer with no person in the roster')
  assert.equal(leadOf([], 'anna'), null)
})
