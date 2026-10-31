import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ESLint, Linter } from 'eslint'

const eslint = new ESLint()
const linter = new Linter()

/** Exercise the actual boundary rules without running unrelated type-aware rules. */
async function violations(file, code) {
  const config = await eslint.calculateConfigForFile(file)
  const messages = linter.verify(code, [{
    files: ['**/*.ts'],
    languageOptions: { parser: config.languageOptions.parser, parserOptions: { projectService: false }, sourceType: 'module' },
    rules: Object.fromEntries(Object.entries(config.rules).filter(([name]) => name.startsWith('no-restricted-'))),
  }], { filename: file })
  assert.ok(!messages.some((m) => m.fatal), JSON.stringify(messages))
  return messages
}

test('routes cannot reach persistence adapters, call Graph reads or bypass endpoint registration', async () => {
  for (const code of [
    'import { readAudit } from \'../lib/audit.ts\'',
    'import { listCampaignMails } from \'../lib/mail/outbox.ts\'',
    'import { readCampaign } from \'../lib/dao/campaigns.ts\'',
    'import { searchGroups } from \'../lib/graph.ts\'',
    'import * as graph from \'../lib/graph.ts\'',
    'db.query(sql)',
    'db.tx(work)',
    'app.get(\'/api/new\', handler)',
  ]) assert.ok((await violations('apps/api/routes/campaigns.ts', code)).length, code)
  assert.deepEqual(await violations('apps/api/routes/roster-graph.ts', 'import { GraphError, GRAPH_BASE_URL } from \'../lib/graph.ts\'\nimport { findGraphGroups } from \'../services/graph-picker.ts\''), [])
})

test('services cannot re-export data access or import raw driver rows', async () => {
  for (const code of [
    'export { readCampaign } from \'../lib/dao/campaigns.ts\'',
    'export * from \'../lib/dao/campaigns.ts\'',
    'import type { CampaignRow } from \'../lib/dao/campaigns-rows.ts\'',
    'import type { QueryResult } from \'pg\'',
    'db.query(sql)',
  ]) assert.ok((await violations('apps/api/services/campaigns.ts', code)).length, code)
  assert.deepEqual(await violations('apps/api/services/campaigns.ts', 'import { readCampaign } from \'../lib/dao/campaigns.ts\'\nexport async function campaign(db) { return readCampaign(db) }'), [])
})

test('the scheduler is a timer adapter and browser wrappers use descriptor URLs', async () => {
  for (const code of ['db.query(sql)', 'db.tx(work)', 'import { scheduledCampaignIds } from \'./dao/scheduling.ts\'', 'import(\'../services/scheduling.ts\')']) {
    assert.ok((await violations('apps/api/lib/scheduler.ts', code)).length, code)
  }
  for (const code of ['fetch(\'/api/campaigns\')', 'fetch(`/api/campaigns/${id}`)']) {
    assert.ok((await violations('apps/web/src/lib/campaigns-api.ts', code)).length, code)
  }
  assert.deepEqual(await violations('apps/web/src/lib/campaigns-api.ts', 'apiRequest(getCampaigns, {})'), [])
})

test('the message catalogue is pure as school-core is: nothing from outside its src, no clock, no randomness, no environment', async () => {
  for (const code of [
    'import { readFileSync } from \'node:fs\'',
    'import { ref } from \'vue\'',
    'import { CAMPAIGN_STATES } from \'@school-allocation/school-core\'',
    'const today = new Date()',
    'const pick = Math.random()',
    'const language = process.env.LANG',
  ]) assert.ok((await violations('packages/messages/src/de.ts', code)).length, code)
  assert.deepEqual(await violations('packages/messages/src/de.ts', 'const plural = new Intl.PluralRules(\'de\')'), [])
})

test('endpoint modules import schemas directly from their feature, never the package barrel', async () => {
  assert.ok((await violations('packages/api-contracts/src/campaigns-endpoints.ts', 'import { CampaignSchema } from \'./index.ts\'')).length)
  assert.deepEqual(await violations('packages/api-contracts/src/campaigns-endpoints.ts', 'import { CampaignSchema } from \'./campaigns.ts\''), [])
})

test('browser imports permit contract types and schema-free values, but reject server values', async () => {
  for (const source of ['@school-allocation/api-contracts', '@school-allocation/api-contracts/endpoints', '@school-allocation/api-contracts/auth-endpoints', '@school-allocation/api-contracts/auth']) {
    assert.ok((await violations('apps/web/src/lib/api.ts', `import * as contracts from '${source}'`)).length, source)
    assert.deepEqual(await violations('apps/web/src/lib/api.ts', `import type * as contracts from '${source}'`), [], source)
  }
  assert.deepEqual(await violations('apps/web/src/lib/api.ts', 'import * as metadata from \'@school-allocation/api-contracts/endpoint-metadata\'\nimport { endpointPath } from \'@school-allocation/api-contracts/client-endpoint\''), [])
})
