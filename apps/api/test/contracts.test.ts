import * as endpoints from '@school-allocation/api-contracts/endpoints'
import type { Endpoint } from '@school-allocation/api-contracts/endpoint'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { routeInventory } from './helpers/route-inventory.ts'

const descriptors: readonly Endpoint[] = Object.values(endpoints)
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value))

test('registered routes match shared descriptors and preserve the input inventory', async () => {
  const seen = new Set<string>()
  const actual = await routeInventory((route) => {
    for (const method of [route.method].flat()) {
      if (method === 'HEAD') continue
      const key = `${method} ${route.url}`
      const descriptor = descriptors.find((e) => e.method === method && e.path === route.url)
      assert.ok(descriptor, `${key} needs a shared endpoint descriptor`)
      assert.ok(!seen.has(key), `${key} registered twice`)
      seen.add(key)
      assert.deepEqual(json(route.schema), json(descriptor.schema), `${key} must use its descriptor's schemas`)
      if (descriptor.transport === 'json') {
        assert.ok(Object.keys(descriptor.schema.response ?? {}).some((status) => /^2(?:\d\d|xx)$/.test(status)), `${key} needs a JSON success schema`)
      }
    }
  })
  assert.deepEqual([...seen].sort(), descriptors.map((e) => `${e.method} ${e.path}`).sort(), 'every descriptor must be registered')
  const expected: unknown = JSON.parse(readFileSync(new URL('./fixtures/routes.json', import.meta.url), 'utf8'))
  assert.deepEqual(actual, expected, 'Regenerate deliberately with npm run contracts:update:routes')
})
