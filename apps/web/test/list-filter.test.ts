import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { filtered, isFiltering, matchesOneOf, matchesOption, matchesText, useListFilter } from '../src/lib/list-filter.ts'

test('a text matches case-insensitively in any of the texts; an empty or missing needle matches everything', () => {
  assert.equal(matchesText(['Klettern', 'Anna Zwexmhofer'], 'zwex'), true)
  assert.equal(matchesText(['Klettern', null, undefined], 'KLETT'), true)
  assert.equal(matchesText(['Klettern'], '  '), true)
  assert.equal(matchesText(['Klettern'], undefined), true)
  assert.equal(matchesText(['Klettern'], false), true)
  assert.equal(matchesText(['Klettern'], 'Wien'), false)
  assert.equal(matchesText([], 'x'), false)
})

test('an option matches the chosen one; nothing chosen, a box or a value the page never set matches every row', () => {
  assert.equal(matchesOption('5A', '5A'), true)
  assert.equal(matchesOption('5A', '5B'), false)
  assert.equal(matchesOption(9, '9'), true)
  assert.equal(matchesOption(null, ''), true)
  assert.equal(matchesOption('5A', undefined), true)
  assert.equal(matchesOption('5A', false), true)
  assert.equal(matchesOption('5A', true), true)
})

test('one of the values matches the chosen one; nothing chosen or a value the page never set matches every row', () => {
  assert.equal(matchesOneOf(['sport', 'kultur'], 'kultur'), true)
  assert.equal(matchesOneOf(['sport'], 'kultur'), false)
  assert.equal(matchesOneOf([], 'kultur'), false)
  assert.equal(matchesOneOf([], ''), true)
  assert.equal(matchesOneOf([], undefined), true)
  assert.equal(matchesOneOf([], true), true)
})

test('values filter when any text is set or any box checked', () => {
  assert.equal(isFiltering({ className: '', incomplete: false, text: '' }), false)
  assert.equal(isFiltering({ className: '5A', incomplete: false, text: '' }), true)
  assert.equal(isFiltering({ className: '', incomplete: true, text: '' }), true)
})

test('the filtered rows follow the values and the rows, from a ref or a getter', () => {
  const rows = ref([{ className: '5A', name: 'Sara' }, { className: '8B', name: 'Tim' }])
  const values = ref<Record<string, string | boolean>>({ className: '', text: '' })
  const shown = filtered(rows, values, (row, f) => matchesOption(row.className, f.className) && matchesText([row.name], f.text))
  assert.deepEqual(shown.value.map((row) => row.name), ['Sara', 'Tim'])
  values.value = { className: '8B', text: '' }
  assert.deepEqual(shown.value.map((row) => row.name), ['Tim'])
  values.value = { className: '', text: 'sar' }
  assert.deepEqual(shown.value.map((row) => row.name), ['Sara'])
  rows.value = [...rows.value, { className: '5A', name: 'Sarah' }]
  assert.deepEqual(shown.value.map((row) => row.name), ['Sara', 'Sarah'])
  const byGetter = filtered(() => rows.value.filter((row) => row.className === '5A'), values, () => true)
  assert.equal(byGetter.value.length, 2)
})

test('a remembered filter is completed from the page\'s defaults, so every key the page reads is there', () => {
  const store = new Map<string, string>()
  const localStorage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) }
  Object.assign(globalThis, { localStorage })
  try {
    store.set('schulwahl::wahl:items:filter', JSON.stringify({ state: 'approved' }))
    const values = useListFilter('wahl:items', { state: '', category: '', text: '' })
    assert.deepEqual(values.value, { state: 'approved', category: '', text: '' })
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage
  }
})
