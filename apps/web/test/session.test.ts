import { test } from 'node:test'
import assert from 'node:assert/strict'
import { session, setView } from '../src/lib/session.ts'
import { viewAs, VIEW_AS_HEADER } from '../src/lib/view-as.ts'

const ME = { id: 'u1', displayName: 'Anna Zwexmhofer', person: { id: 'p1', kind: 'teacher', className: null, grade: null } }

/** A server that answers the session by the view the request names, each answer when the test lets it go; it records the views asked for. */
function server(): { asked: (string | null)[], release: (index: number, fail?: boolean) => void } {
  const asked: (string | null)[] = []
  const waiting: { answer: () => void, fail: () => void }[] = []
  const fetch = (_url: string, init: { headers: Record<string, string> }): Promise<Response> => {
    const view = init.headers[VIEW_AS_HEADER] ?? null
    asked.push(view)
    return new Promise((resolve, reject) => {
      waiting.push({
        answer: () => resolve(new Response(JSON.stringify({ ...ME, roles: view === 'teacher' ? [] : ['school_admin'] }), { status: 200 })),
        fail: () => reject(new TypeError('network')),
      })
    })
  }
  Object.assign(globalThis, { fetch })
  return { asked, release: (index, fail = false) => (fail ? waiting[index]?.fail() : waiting[index]?.answer()) }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

test('a change of view reads the session again as the server answers it in that view', async (ctx) => {
  const original = globalThis.fetch
  ctx.after(() => Object.assign(globalThis, { fetch: original }))
  const { asked, release } = server()
  const into = setView('teacher')
  await tick()
  release(0)
  await into
  assert.deepEqual([viewAs.value, session.value?.roles], ['teacher', []])
  const back = setView(null)
  await tick()
  release(1)
  await back
  assert.deepEqual([viewAs.value, session.value?.roles], [null, ['school_admin']])
  assert.deepEqual(asked, ['teacher', null])
})

test('changes of view go one after the other: the second waits for the first, so the session is the last view\'s', async (ctx) => {
  const original = globalThis.fetch
  ctx.after(() => Object.assign(globalThis, { fetch: original }))
  const { asked, release } = server()
  const into = setView('teacher')
  const back = setView(null)
  await tick()
  assert.deepEqual(asked, ['teacher'], 'the way back has not asked yet')
  release(0)
  await into
  await tick()
  assert.deepEqual(asked, ['teacher', null])
  release(1)
  await back
  assert.deepEqual([viewAs.value, session.value?.roles], [null, ['school_admin']])
})

test('a change that fails leaves the tab in the view it had, and the next change still goes', async (ctx) => {
  const original = globalThis.fetch
  ctx.after(() => Object.assign(globalThis, { fetch: original }))
  const { release } = server()
  const into = setView('teacher')
  await tick()
  release(0, true)
  await assert.rejects(into)
  assert.equal(viewAs.value, null)
  const again = setView('teacher')
  await tick()
  release(1)
  await again
  assert.deepEqual([viewAs.value, session.value?.roles], ['teacher', []])
  const back = setView(null)
  await tick()
  release(2)
  await back
  assert.equal(viewAs.value, null)
})
