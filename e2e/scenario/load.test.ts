// The scenario carried into a database through the services: everyone
// acts as themselves, at their moment, and the school ends where the
// story says.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDatabase } from '../../apps/api/lib/db.ts'
import { ControlledClock } from '../../apps/api/test/helpers/clock.ts'
import { createTestDatabase, DB, withClient } from '../../apps/api/test/helpers/db.ts'
import { TENANT_ID } from '../../apps/api/test/helpers/env.ts'
import { startFakeGraph } from '../../apps/api/test/helpers/fake-graph.ts'
import { ANNA, SARA } from '../../apps/api/test/helpers/personas.ts'
import { loadScenario } from './load.ts'
import { STORY, scenario, studentsOf } from './school.ts'

test('the whole story up to the close: roster, catalogue, both windows, nobody entered on anyone\'s behalf', DB, async (t) => {
  const s = scenario()
  const testDb = await createTestDatabase(t)
  const clock = new ControlledClock(new Date(STORY.starts))
  const token = 'scenario-token'
  const graph = await startFakeGraph([token], new Map())
  const db = createDatabase(testDb.runtimeUrl, (err) => t.diagnostic(`database client failed: ${err.message}`), clock)
  // Closed before the database is dropped (createTestDatabase's own cleanup).
  const loaded = await loadScenario({ db, clock, graph, accessToken: token, tenantId: TENANT_ID, bootstrapAdmins: [ANNA.email ?? ''], context: { baseUrl: 'http://127.0.0.1:3100' } }, s, { log: (m) => t.diagnostic(m) })
    .finally(async () => {
      await db.close()
      await graph.close()
    })

  assert.equal(loaded.campaign.state, 'closed')
  assert.equal(loaded.personIds.size, studentsOf(s).length + s.teachers.length)
  assert.equal(loaded.itemIds.size, s.items.length)
  const outcome = (plan: string) => [...loaded.choices.values()].filter((c) => c.plan === plan)
  assert.equal(outcome('never').every((c) => c.saves === 0), true)
  assert.equal(outcome('incomplete').every((c) => c.saves === 1), true)
  assert.equal(loaded.choices.get(SARA.oid)?.complete, true)

  const counts = await withClient(testDb.ownerUrl, async (client) => {
    const one = async (sql: string) => Number((await client.query<{ n: string }>(sql)).rows[0]?.n)
    return {
      approved: await one('select count(*) as n from catalog_item where state = \'approved\''),
      lists: await one('select count(*) as n from choice'),
      late: await one('select count(*) as n from choice where saved_in = \'late\''),
      onBehalf: await one('select count(*) as n from audit_event where action = \'choice.entered-on-behalf\''),
    }
  })
  const saved = s.choices.filter((c) => c.plan !== 'never').length
  assert.deepEqual(counts, { approved: s.items.length, lists: saved, late: outcome('late').length, onBehalf: 0 })
})
