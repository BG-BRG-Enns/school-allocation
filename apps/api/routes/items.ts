// Activity drafts, proposals and organizer review.

import * as endpoints from '@school-allocation/api-contracts/items-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance, FastifyReply } from 'fastify'
import { type Caller } from '../lib/actor.ts'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { isOrganizer, mayPropose } from '../lib/policies.ts'
import { itemInput } from '../services/catalogue-input.ts'
import { visibleCampaign } from '../services/catalogue.ts'
import { approveItem, createItem, deleteDraft, proposeItem, returnItem, unproposeItem, updateItem, withdrawItem, withVisibleItem } from '../services/items.ts'

export interface ItemsRoutesOptions {
  db: Database
  guards: Guards
}

export async function itemsRoutes(app: FastifyInstance, { db, guards }: ItemsRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }

  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }

  // The 422 carries the rules broken, which the general error shape would drop.

  /**
   * Runs a change to an item the caller addresses by id. An item of a
   * campaign the caller may not see is not found to them; a refusal by
   * ownership or state gets its code.
   */
  async function withItem<T>(reply: FastifyReply, id: string, caller: Caller, fn: () => Promise<T | undefined>) {
    const result = await withVisibleItem(db, id, caller, fn)
    return result
  }

  registerEndpoint(app, endpoints.postCampaignsByIdItems, { ...signedIn }, async (request, reply) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const caller = callerOf(request)
    if (!mayPropose(caller)) return reply.code(403).send({ error: 'forbidden' })
    return reply.code(201).send(await createItem(db, campaign.id, itemInput(request.body, caller, true), caller))
  })

  registerEndpoint(app, endpoints.patchItemsById, { ...signedIn }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => updateItem(db, request.params.id, itemInput(request.body, caller, false), caller, isOrganizer(caller)))
  })

  registerEndpoint(app, endpoints.deleteItemsById, { ...signedIn }, async (request, reply) => {
    const caller = callerOf(request)
    await withVisibleItem(db, request.params.id, caller, async () => {
      if (!await deleteDraft(db, request.params.id, caller)) return undefined
      return 'deleted'
    })
    return reply.code(204).send()
  })

  registerEndpoint(app, endpoints.postItemsByIdPropose, { ...signedIn }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => proposeItem(db, request.params.id, caller))
  })

  registerEndpoint(app, endpoints.postItemsByIdUnpropose, { ...signedIn }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => unproposeItem(db, request.params.id, caller))
  })

  registerEndpoint(app, endpoints.postAdminItemsByIdApprove, { ...organizer }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => approveItem(db, request.params.id, caller))
  })

  registerEndpoint(app, endpoints.postAdminItemsByIdReturn, { ...organizer }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => returnItem(db, request.params.id, request.body.note, caller))
  })

  registerEndpoint(app, endpoints.postAdminItemsByIdWithdraw, { ...organizer }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => withdrawItem(db, request.params.id, request.body.reason, caller))
  })
}
