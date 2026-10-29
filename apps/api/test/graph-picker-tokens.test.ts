import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GraphPickerTokens } from '../lib/graph-picker-tokens.ts'

test('picker handles are scoped to their owner, expire, can be revoked and cannot cross app instances', () => {
  let now = 0
  const tokens = new GraphPickerTokens(() => now)
  const handle = tokens.store('alice', 'token')
  assert.equal(tokens.read(handle, 'alice'), 'token')
  assert.equal(tokens.read(handle, 'bob'), undefined)
  assert.equal(new GraphPickerTokens(() => now).read(handle, 'alice'), undefined)
  now = 50 * 60 * 1000
  assert.equal(tokens.read(handle, 'alice'), undefined)
  const next = tokens.store('alice', 'next')
  tokens.forget(next)
  assert.equal(tokens.read(next, 'alice'), undefined)
  assert.equal(tokens.read(undefined, 'alice'), undefined)
})
