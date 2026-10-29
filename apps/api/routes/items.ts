// Activity drafts, proposals and organizer review.

import { ItemSchema } from '@school-allocation/api-contracts'
import { ItemBody, ItemInvalidResponse, NoteBody, ReasonBody } from '@school-allocation/api-contracts/catalogue'
import { ErrorResponse, IdParams } from '@school-allocation/api-contracts/common'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { type Static } from 'typebox'
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
  const itemSchema = { params: IdParams, body: ItemBody, response: { '422': ItemInvalidResponse, '4xx': ErrorResponse } }

  /**
   * Runs a change to an item the caller addresses by id. An item of a
   * campaign the caller may not see is not found to them; a refusal by
   * ownership or state gets its code.
   */
  async function withItem<T>(reply: FastifyReply, id: string, caller: Caller, fn: () => Promise<T | undefined>, okStatus = 200) {
    const result = await withVisibleItem(db, id, caller, fn)
    return okStatus === 204 ? reply.code(204).send() : result
  }

  app.post<{ Params: Static<typeof IdParams>, Body: Static<typeof ItemBody> }>('/api/campaigns/:id/items', { ...signedIn, schema: { ...itemSchema, response: { ...itemSchema.response, 201: ItemSchema } } }, async (request, reply) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const caller = callerOf(request)
    if (!mayPropose(caller)) return reply.code(403).send({ error: 'forbidden' })
    return reply.code(201).send(await createItem(db, campaign.id, itemInput(request.body, caller, true), caller))
  })

  app.patch<{ Params: Static<typeof IdParams>, Body: Static<typeof ItemBody> }>('/api/items/:id', { ...signedIn, schema: { ...itemSchema, response: { ...itemSchema.response, 200: ItemSchema } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => updateItem(db, request.params.id, itemInput(request.body, caller, false), caller, isOrganizer(caller)))
  })

  app.delete<{ Params: Static<typeof IdParams> }>('/api/items/:id', { ...signedIn, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, async () => {
      if (!await deleteDraft(db, request.params.id, caller)) return undefined
      return 'deleted'
    }, 204)
  })

  app.post<{ Params: Static<typeof IdParams> }>('/api/items/:id/propose', { ...signedIn, schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => proposeItem(db, request.params.id, caller))
  })

  app.post<{ Params: Static<typeof IdParams> }>('/api/items/:id/unpropose', { ...signedIn, schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => unproposeItem(db, request.params.id, caller))
  })

  app.post<{ Params: Static<typeof IdParams> }>('/api/admin/items/:id/approve', { ...organizer, schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => approveItem(db, request.params.id, caller))
  })

  app.post<{ Params: Static<typeof IdParams>, Body: Static<typeof NoteBody> }>('/api/admin/items/:id/return', { ...organizer, schema: { params: IdParams, body: NoteBody, response: { '200': ItemSchema, '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => returnItem(db, request.params.id, request.body.note, caller))
  })

  app.post<{ Params: Static<typeof IdParams>, Body: Static<typeof ReasonBody> }>('/api/admin/items/:id/withdraw', { ...organizer, schema: { params: IdParams, body: ReasonBody, response: { '200': ItemSchema, '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => withdrawItem(db, request.params.id, request.body.reason, caller))
  })
}
