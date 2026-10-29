import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

test('the production build rejects a schema imported indirectly through a browser helper', async () => {
  await assert.rejects(build({
    root: fileURLToPath(new URL('..', import.meta.url)),
    logLevel: 'silent',
    build: { write: false },
    plugins: [{
      name: 'simulate-schema-leak',
      transform(code, id) {
        if (!id.endsWith('/api-contracts/src/client-endpoint.ts')) return
        // No source-file mutation: simulate a future indirect runtime import.
        return `${code}\nimport { CampaignSchema } from './campaigns.ts'; console.log(CampaignSchema);`
      },
    }],
  }), /Server schemas must not enter the browser bundle/)
})
