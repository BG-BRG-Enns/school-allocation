import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasUnsaved, mayLeave, stayed, watchUnsaved } from '../src/lib/unsaved.ts'
import { t } from '../src/lib/i18n.ts'

/** A browser whose confirm answers as told and records what it asked. */
function browser(answer: boolean): { asked: string[] } {
  const asked: string[] = []
  const confirm = (question: string): boolean => {
    asked.push(question)
    return answer
  }
  Object.assign(globalThis, { window: { confirm } })
  return { asked }
}

test('without a page watched, or with nothing unsaved, leaving asks nothing', (ctx) => {
  const { asked } = browser(false)
  ctx.after(() => delete (globalThis as { window?: unknown }).window)
  assert.equal(hasUnsaved(), false)
  assert.equal(mayLeave(), true)
  const stop = watchUnsaved(() => false)
  assert.equal(hasUnsaved(), false)
  assert.equal(mayLeave(), true)
  stop()
  assert.deepEqual(asked, [])
})

test('with a change unsaved the person is asked; no asks once, yes stops the asking until the page is gone, and a failed leaving watches again', (ctx) => {
  const { asked } = browser(false)
  ctx.after(() => delete (globalThis as { window?: unknown }).window)
  let dirty = true
  const stop = watchUnsaved(() => dirty)
  assert.equal(hasUnsaved(), true)
  assert.equal(mayLeave(), false, 'declined: the page stays')
  assert.equal(hasUnsaved(), true, 'and is watched still')
  browser(true)
  assert.equal(mayLeave(), true, 'agreed: the page goes')
  assert.equal(hasUnsaved(), false, 'the browser\'s own question is not asked on the way out')
  assert.equal(mayLeave(), true, 'nor the shell\'s a second time')
  stayed()
  assert.equal(hasUnsaved(), true, 'the leaving did not happen: watched again')
  dirty = false
  assert.equal(hasUnsaved(), false)
  dirty = true
  stop()
  assert.equal(hasUnsaved(), false, 'the page is gone')
  assert.equal(mayLeave(), true)
  assert.deepEqual(asked, [t.common.leaveUnsaved])
})

test('a stop of an earlier watch does not end a later page\'s', () => {
  const first = watchUnsaved(() => true)
  const second = watchUnsaved(() => true)
  first()
  assert.equal(hasUnsaved(), true)
  second()
  assert.equal(hasUnsaved(), false)
})
