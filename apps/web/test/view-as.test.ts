import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mayViewAsTeacher, readView, VIEW_AS_HEADER, viewAs, viewHeaders, writeView } from '../src/lib/view-as.ts'

/** A tab's storage that keeps what it is given. */
function tab(): Map<string, string> {
  const store = new Map<string, string>()
  const sessionStorage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) }
  Object.assign(globalThis, { sessionStorage })
  return store
}
const closeTab = () => delete (globalThis as { sessionStorage?: unknown }).sessionStorage

test('a tab starts in the person\'s own view, and its requests carry no header', () => {
  assert.equal(viewAs.value, null)
  assert.equal(readView(), null)
  assert.deepEqual(viewHeaders(), {})
})

test('the view as a teacher is remembered by the tab and named on every request; the way back forgets it', (ctx) => {
  const store = tab()
  ctx.after(closeTab)
  writeView('teacher')
  assert.equal(viewAs.value, 'teacher')
  assert.deepEqual([...store.values()], ['teacher'])
  assert.equal(readView(), 'teacher', 'a reload of the tab finds it')
  assert.deepEqual(viewHeaders(), { [VIEW_AS_HEADER]: 'teacher' })
  writeView(null)
  assert.equal(viewAs.value, null)
  assert.equal(store.size, 0)
  assert.equal(readView(), null)
  assert.deepEqual(viewHeaders(), {})
})

test('a value the tab does not know is the person\'s own view', (ctx) => {
  const store = tab()
  ctx.after(closeTab)
  writeView('teacher')
  const [key] = [...store.keys()]
  store.set(key ?? '', 'administrator')
  assert.equal(readView(), null)
  writeView(null)
})

test('where the browser denies storage the view lasts as long as the page', (ctx) => {
  const denied = () => {
    throw new Error('denied')
  }
  Object.assign(globalThis, { sessionStorage: { getItem: denied, setItem: denied, removeItem: denied } })
  ctx.after(closeTab)
  assert.equal(readView(), null)
  writeView('teacher')
  assert.equal(viewAs.value, 'teacher')
  assert.deepEqual(viewHeaders(), { [VIEW_AS_HEADER]: 'teacher' })
  writeView(null)
  assert.equal(viewAs.value, null)
})

test('the view is offered to someone with a role who is a teacher, in their own view', () => {
  const teacher = { kind: 'teacher' }
  assert.equal(mayViewAsTeacher({ roles: ['campaign_organizer'], person: teacher }, null), true)
  assert.equal(mayViewAsTeacher({ roles: ['school_admin', 'read_only_auditor'], person: teacher }, null), true)
  assert.equal(mayViewAsTeacher({ roles: [], person: teacher }, null), false, 'a teacher without a role has nothing to lay down')
  assert.equal(mayViewAsTeacher({ roles: ['school_admin'], person: null }, null), false, 'an account the class lists do not know')
  assert.equal(mayViewAsTeacher({ roles: ['school_admin'], person: { kind: null } }, null), false)
  assert.equal(mayViewAsTeacher({ roles: ['school_admin'], person: { kind: 'student' } }, null), false)
  assert.equal(mayViewAsTeacher({ roles: ['school_admin'], person: teacher }, 'teacher'), false, 'already in it')
  assert.equal(mayViewAsTeacher(null, null), false)
  assert.equal(mayViewAsTeacher(undefined, null), false)
})
