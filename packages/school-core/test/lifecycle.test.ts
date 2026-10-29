import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAMPAIGN_STATES, CAMPAIGN_TRANSITIONS, acceptsChoices, isCampaignState, transition, type CampaignState } from '../src/lifecycle.ts'

test('every state is reachable from draft, and archived is the end', () => {
  const reached = new Set<CampaignState>(['draft'])
  const queue: CampaignState[] = ['draft']
  for (let state = queue.shift(); state !== undefined; state = queue.shift()) {
    for (const next of CAMPAIGN_TRANSITIONS[state]) {
      if (!reached.has(next)) {
        reached.add(next)
        queue.push(next)
      }
    }
  }
  assert.deepEqual([...reached].sort(), [...CAMPAIGN_STATES].sort())
  assert.deepEqual(CAMPAIGN_TRANSITIONS.archived, [])
})

test('the forward path runs in order; review may go back to allocating but nothing else goes back', () => {
  const forward: CampaignState[] = ['draft', 'catalogue', 'published', 'open', 'grace', 'closed', 'allocating', 'review', 'results', 'archived']
  for (let i = 0; i + 1 < forward.length; i++) {
    const from = forward[i] as CampaignState
    const to = forward[i + 1] as CampaignState
    assert.deepEqual(transition(from, to), { ok: true, state: to })
  }
  assert.deepEqual(transition('review', 'allocating'), { ok: true, state: 'allocating' })
  for (const [from, targets] of Object.entries(CAMPAIGN_TRANSITIONS) as [CampaignState, readonly CampaignState[]][]) {
    for (const to of targets) {
      if (from === 'review' && to === 'allocating') continue
      assert.ok(forward.indexOf(to) > forward.indexOf(from), `${from} -> ${to} goes backwards`)
    }
  }
})

test('a transition that is not listed is refused with its states, and a state never moves to itself', () => {
  assert.deepEqual(transition('open', 'draft'), { ok: false, code: 'invalid_transition', from: 'open', to: 'draft' })
  assert.deepEqual(transition('results', 'allocating'), { ok: false, code: 'invalid_transition', from: 'results', to: 'allocating' })
  for (const state of CAMPAIGN_STATES) {
    assert.equal(transition(state, state).ok, false, `${state} -> ${state}`)
  }
})

test('choices are accepted while the window is open and in the grace week after it', () => {
  for (const state of CAMPAIGN_STATES) {
    assert.equal(acceptsChoices(state), state === 'open' || state === 'grace', state)
  }
  // A campaign without a grace week closes straight from open.
  assert.deepEqual(transition('open', 'closed'), { ok: true, state: 'closed' })
})

test('isCampaignState tells the states from everything else', () => {
  assert.equal(isCampaignState('open'), true)
  assert.equal(isCampaignState('voting'), false)
  assert.equal(isCampaignState(1), false)
  assert.equal(isCampaignState(null), false)
})
