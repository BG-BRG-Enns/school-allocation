import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { readUiState, useUiState } from '../src/lib/ui-state.ts'

/** A browser's storage for one test: a map, or one that refuses as a browser with storage off does; gone once `run` has settled. */
async function withStorage(store: Map<string, string> | 'denied', run: () => void | Promise<void>): Promise<void> {
  const denied = (): never => {
    throw new Error('SecurityError')
  }
  const localStorage = store === 'denied'
    ? { getItem: denied, setItem: denied }
    : { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) }
  Object.assign(globalThis, { localStorage })
  try {
    await run()
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage
  }
}

test('what the browser remembers is read back when it has the shape of the initial value; else the initial value', async () => {
  const store = new Map<string, string>()
  await withStorage(store, () => {
    assert.equal(readUiState('wahl:status:open', true), true, 'nothing stored')
    store.set('schulwahl::wahl:status:open', 'false')
    assert.equal(readUiState('wahl:status:open', true), false)
    store.set('schulwahl::wahl:status:open', '"yes"')
    assert.equal(readUiState('wahl:status:open', true), true, 'a string where a boolean is expected')
    store.set('schulwahl::wahl:status:open', '{')
    assert.equal(readUiState('wahl:status:open', true), true, 'a value that does not parse')
    store.set('schulwahl::wahl:items:filter', '{"state":"approved"}')
    assert.deepEqual(readUiState('wahl:items:filter', { state: '' }), { state: 'approved' })
    store.set('schulwahl::wahl:items:filter', 'null')
    assert.deepEqual(readUiState('wahl:items:filter', { state: '' }), { state: '' }, 'null is not an object')
    store.set('schulwahl::wahl:items:filter', '["a"]')
    assert.deepEqual(readUiState('wahl:items:filter', { state: '' }), { state: '' }, 'an array is not an object')
    store.set('schulwahl::list', '{"a":1}')
    assert.deepEqual(readUiState<string[]>('list', []), [], 'an object is not an array')
    store.set('schulwahl::list', '["a"]')
    assert.deepEqual(readUiState<string[]>('list', []), ['a'])
  })
})

test('without a browser, or with storage denied, the initial value stands and nothing throws', async () => {
  assert.equal(readUiState('wahl:status:open', true), true)
  await withStorage('denied', () => {
    assert.equal(readUiState('wahl:status:open', true), true)
    const state = useUiState('wahl:status:open', true)
    state.value = false
    assert.equal(state.value, false)
  })
})

test('a change of the state is written back, deeply', async () => {
  const store = new Map<string, string>()
  await withStorage(store, async () => {
    const open = useUiState('wahl:status:open', true)
    open.value = false
    await nextTick()
    assert.equal(store.get('schulwahl::wahl:status:open'), 'false')
    const filter = useUiState<Record<string, string>>('wahl:items:filter', { state: '' })
    filter.value.state = 'approved'
    await nextTick()
    assert.equal(store.get('schulwahl::wahl:items:filter'), '{"state":"approved"}')
    assert.equal(useUiState('wahl:status:open', true).value, false, 'read back by the next page')
  })
})
