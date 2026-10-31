import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAMPAIGN_STATES } from '../src/lifecycle.ts'
import { leadOf, mayTakePlace } from '../src/planning.ts'

test('the proposer leads when among the teachers; otherwise the first named does; nobody leads an activity without teachers', () => {
  assert.equal(leadOf(['bernd', 'carla'], 'carla'), 'carla')
  assert.equal(leadOf(['bernd', 'carla'], 'anna'), 'bernd', 'an organizer created it on their behalf')
  assert.equal(leadOf(['bernd', 'carla'], null), 'bernd', 'a proposer with no person in the roster')
  assert.equal(leadOf([], 'anna'), null)
})

test('an activity counts while it may still take place: approved always, a proposal until the catalogue is out, a draft while proposals are taken', () => {
  const counted = (state: Parameters<typeof mayTakePlace>[0]) => CAMPAIGN_STATES.filter((campaignState) => mayTakePlace(state, campaignState))
  assert.deepEqual(counted('approved'), CAMPAIGN_STATES)
  assert.deepEqual(counted('proposed'), ['catalogue', 'published'])
  assert.deepEqual(counted('draft'), ['catalogue'])
  assert.deepEqual(counted('withdrawn'), [])
})
