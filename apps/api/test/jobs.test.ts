import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDatabase } from '../lib/db.ts'
import { interruptStaleJobs, isBusy, runJob, startJob } from '../lib/jobs.ts'
import { createTestDatabase, DB, withClient } from './helpers/db.ts'

test('busy while a job runs; a failed job is finished as failed; a job left behind is interrupted at the next start', DB, async (t) => {
  const testDb = await createTestDatabase(t)
  const db = createDatabase(testDb.runtimeUrl, () => {})
  t.after(() => db.close())

  assert.equal(await isBusy(db), false)
  const result = await runJob(db, 'roster_import', null, async () => {
    assert.equal(await isBusy(db), true)
    return 42
  })
  assert.equal(result, 42)
  assert.equal(await isBusy(db), false)

  await assert.rejects(runJob(db, 'allocation_run', null, () => Promise.reject(new Error('solver down'))), /solver down/)
  assert.equal(await isBusy(db), false)

  await startJob(db, 'outbox_flush', null)
  assert.equal(await isBusy(db), true)
  assert.equal(await interruptStaleJobs(db), 1)
  assert.equal(await isBusy(db), false)

  const outcomes = await withClient(testDb.ownerUrl, (c) => c.query<{ kind: string, outcome: string }>('select kind, outcome from job order by started_at'))
  assert.deepEqual(outcomes.rows, [
    { kind: 'roster_import', outcome: 'succeeded' },
    { kind: 'allocation_run', outcome: 'failed' },
    { kind: 'outbox_flush', outcome: 'interrupted' },
  ])
})
