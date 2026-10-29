// Run from the root with npm run contracts:update:routes, then review the diff.
import { writeFile } from 'node:fs/promises'
import { routeInventory } from '../test/helpers/route-inventory.ts'

const inventory = await routeInventory()
await writeFile(new URL('../test/fixtures/routes.json', import.meta.url), `${JSON.stringify(inventory, null, 2)}\n`)
