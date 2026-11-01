// An organizer withdraws an item (docs/domain-and-api.md §3, §8): before
// publication the catalogue's concern alone (services/items.ts), after it
// also the published run's: its students are removed from it, a change by
// hand each with the withdrawal's reason, told (services/assignment-changes.ts).
// This module composes the two, so that items stays below the changes.

import { actorOf, type Caller } from '../lib/actor.ts'
import type { Database } from '../lib/db.ts'
import type { Item } from '../lib/models/items.ts'
import type { WindowContext } from '../lib/models/window.ts'
import { removeFromWithdrawn } from './assignment-changes.ts'
import { withdrawItem as withdraw } from './items.ts'

/** Withdraws the item with the reason, audited; after publication its students are removed from it and told. */
export function withdrawItem(db: Database, context: WindowContext, id: string, reason: string, caller: Caller): Promise<Item> {
  return withdraw(db, id, reason, caller, (client, item, why) => removeFromWithdrawn(client, context, item.campaignId, item.id, why, actorOf(caller)))
}
