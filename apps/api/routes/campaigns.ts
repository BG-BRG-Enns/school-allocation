// Campaigns and their catalogue (docs/domain-and-api.md §8):
//
//   GET    /api/campaigns                         the campaigns the caller may see
//   GET    /api/campaigns/:id                     one of them, with what the caller may know
//   GET    /api/campaigns/:id/items               its activities, as far as the caller may see them
//   GET    /api/campaigns/:id/catalogue           the published catalogue: approved items in print order
//   GET    /api/campaigns/:id/classes             the roster's classes, for the pickers (teachers, organizers)
//   GET    /api/campaigns/:id/teachers?q=         the roster's teachers, for naming an activity's teachers
//   POST   /api/campaigns/:id/items               a teacher's or organizer's draft
//   PATCH  /api/items/:id                         its content; own drafts, or an organizer (audited)
//   DELETE /api/items/:id                         an own draft
//   POST   /api/items/:id/propose                 draft → proposed
//   POST   /api/items/:id/unpropose               proposed → draft, by its own teachers
//   POST   /api/admin/campaigns                   an organizer sets a campaign up
//   PATCH  /api/admin/campaigns/:id               name, year, days while setting up or taking proposals
//   POST   /api/admin/campaigns/:id/transition    { to }: catalogue, published
//   POST   /api/admin/items/:id/approve           audited
//   POST   /api/admin/items/:id/return            { note }, audited
//   POST   /api/admin/items/:id/withdraw          { reason }, audited
//   GET    /api/admin/campaigns/:id/export/catalogue.xlsx
//
// Reads are authorized per request: a campaign the caller may not see is
// 404 to them, an item of such a campaign too. 403 is for the wrong role on
// a campaign they may see, 409 with its code for a lifecycle refusal, 422
// with the rules broken for an activity that is not one.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Type, type Static } from 'typebox'
import { callerOf, type Caller, type Guards } from '../lib/auth.ts'
import { campaignCounts, canSee, createCampaign, isOrganizer, isTeacher, listCampaigns, readCampaign, rosterClasses, rosterTeachers, transitionCampaign, updateCampaign, type Campaign } from '../lib/campaigns.ts'
import type { Database } from '../lib/db.ts'
import { approveItem, catalogueItems, createItem, deleteDraft, ItemInvalid, listItems, proposeItem, readItem, returnItem, unproposeItem, updateItem, withdrawItem, type ItemInput } from '../lib/items.ts'
import { RosterConflict } from '../lib/roster.ts'
import { actorOf } from './admin-roster.ts'
import { ErrorResponse, StrictObject, Uuid } from '../lib/schemas/common.ts'
import { CampaignBody, CampaignChangesBody, ItemBody, ItemInvalidResponse, NoteBody, ReasonBody, TransitionBody } from '../lib/schemas/catalogue.ts'
import { catalogueWorkbook } from '../lib/xlsx.ts'

export interface CampaignRoutesOptions {
  db: Database
  guards: Guards
}

const IdParams = StrictObject({ id: Uuid })
const TeachersQuery = StrictObject({ q: Type.Optional(Type.String({ maxLength: 100 })) })

export async function campaignRoutes(app: FastifyInstance, { db, guards }: CampaignRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }

  /** The campaign, when the caller may see it; otherwise a 404 has been sent. */
  async function visible(request: FastifyRequest, reply: FastifyReply, id: string): Promise<Campaign | undefined> {
    const campaign = await readCampaign(db, id)
    if (!campaign || !canSee(callerOf(request), campaign.state)) {
      await reply.code(404).send({ error: 'not_found' })
      return undefined
    }
    return campaign
  }

  app.get('/api/campaigns', { ...signedIn, schema: { response: { '4xx': ErrorResponse } } }, async (request) => {
    return { campaigns: await listCampaigns(db, callerOf(request)) }
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/campaigns/:id', { ...signedIn, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const campaign = await visible(request, reply, request.params.id)
    if (!campaign) return
    const caller = callerOf(request)
    return {
      campaign,
      counts: isOrganizer(caller) ? await campaignCounts(db, campaign.id) : null,
      may: { propose: (isTeacher(caller) || isOrganizer(caller)) && campaign.state === 'catalogue', organize: isOrganizer(caller) },
    }
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/campaigns/:id/items', { ...signedIn, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const campaign = await visible(request, reply, request.params.id)
    if (!campaign) return
    const caller = callerOf(request)
    return { items: await listItems(db, campaign, caller, isOrganizer(caller)) }
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/campaigns/:id/catalogue', { ...signedIn, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const campaign = await visible(request, reply, request.params.id)
    if (!campaign) return
    // Before publication the catalogue is the organizers' and the teachers' work in progress.
    const caller = callerOf(request)
    if (campaign.state === 'draft' || campaign.state === 'catalogue') {
      if (!isOrganizer(caller) && !isTeacher(caller)) return reply.code(404).send({ error: 'not_found' })
    }
    return { campaign, items: await catalogueItems(db, campaign.id) }
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/campaigns/:id/classes', { ...signedIn, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const campaign = await visible(request, reply, request.params.id)
    if (!campaign) return
    if (!mayPropose(callerOf(request))) return reply.code(403).send({ error: 'forbidden' })
    return { classes: await rosterClasses(db) }
  })

  app.get<{ Params: Static<typeof IdParams>, Querystring: Static<typeof TeachersQuery> }>('/api/campaigns/:id/teachers', { ...signedIn, schema: { params: IdParams, querystring: TeachersQuery, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const campaign = await visible(request, reply, request.params.id)
    if (!campaign) return
    if (!mayPropose(callerOf(request))) return reply.code(403).send({ error: 'forbidden' })
    return { teachers: await rosterTeachers(db, request.query.q?.trim() ?? '') }
  })

  // The 422 carries the rules broken, which the general error shape would drop.
  const itemSchema = { params: IdParams, body: ItemBody, response: { '422': ItemInvalidResponse, '4xx': ErrorResponse } }

  app.post<{ Params: Static<typeof IdParams>, Body: Static<typeof ItemBody> }>('/api/campaigns/:id/items', { ...signedIn, schema: itemSchema }, async (request, reply) => {
    const campaign = await visible(request, reply, request.params.id)
    if (!campaign) return
    const caller = callerOf(request)
    if (!mayPropose(caller)) return reply.code(403).send({ error: 'forbidden' })
    return refusals(reply, async () => reply.code(201).send(await createItem(db, campaign.id, itemInput(request.body, caller, true), actorOf(request))))
  })

  app.patch<{ Params: Static<typeof IdParams>, Body: Static<typeof ItemBody> }>('/api/items/:id', { ...signedIn, schema: itemSchema }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => updateItem(db, request.params.id, itemInput(request.body, caller, false), caller, isOrganizer(caller)))
  })

  app.delete<{ Params: Static<typeof IdParams> }>('/api/items/:id', { ...signedIn, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, async () => {
      if (!await deleteDraft(db, request.params.id, caller, isOrganizer(caller))) return undefined
      return 'deleted'
    }, 204)
  })

  app.post<{ Params: Static<typeof IdParams> }>('/api/items/:id/propose', { ...signedIn, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => proposeItem(db, request.params.id, caller, isOrganizer(caller)))
  })

  app.post<{ Params: Static<typeof IdParams> }>('/api/items/:id/unpropose', { ...signedIn, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => unproposeItem(db, request.params.id, caller, isOrganizer(caller)))
  })

  // Organizers.

  app.post<{ Body: Static<typeof CampaignBody> }>('/api/admin/campaigns', { ...organizer, schema: { body: CampaignBody, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const days = uniqueSorted(request.body.projectDays)
    if (days.length !== request.body.projectDays.length) return reply.code(422).send({ error: 'project_day_twice' })
    return reply.code(201).send(await createCampaign(db, { ...request.body, projectDays: days }, actorOf(request)))
  })

  app.patch<{ Params: Static<typeof IdParams>, Body: Static<typeof CampaignChangesBody> }>('/api/admin/campaigns/:id', { ...organizer, schema: { params: IdParams, body: CampaignChangesBody, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const days = uniqueSorted(request.body.projectDays)
    if (days.length !== request.body.projectDays.length) return reply.code(422).send({ error: 'project_day_twice' })
    return refusals(reply, async () => {
      const campaign = await updateCampaign(db, request.params.id, { ...request.body, projectDays: days }, actorOf(request))
      return campaign ?? reply.code(404).send({ error: 'not_found' })
    })
  })

  app.post<{ Params: Static<typeof IdParams>, Body: Static<typeof TransitionBody> }>('/api/admin/campaigns/:id/transition', { ...organizer, schema: { params: IdParams, body: TransitionBody, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    return refusals(reply, async () => {
      const campaign = await transitionCampaign(db, request.params.id, request.body.to, actorOf(request))
      return campaign ?? reply.code(404).send({ error: 'not_found' })
    })
  })

  app.post<{ Params: Static<typeof IdParams> }>('/api/admin/items/:id/approve', { ...organizer, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => approveItem(db, request.params.id, caller))
  })

  app.post<{ Params: Static<typeof IdParams>, Body: Static<typeof NoteBody> }>('/api/admin/items/:id/return', { ...organizer, schema: { params: IdParams, body: NoteBody, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => returnItem(db, request.params.id, request.body.note, caller))
  })

  app.post<{ Params: Static<typeof IdParams>, Body: Static<typeof ReasonBody> }>('/api/admin/items/:id/withdraw', { ...organizer, schema: { params: IdParams, body: ReasonBody, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const caller = callerOf(request)
    return withItem(reply, request.params.id, caller, () => withdrawItem(db, request.params.id, request.body.reason, caller))
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/admin/campaigns/:id/export/catalogue.xlsx', {
    preHandler: guards.requireRole('campaign_organizer', 'school_admin', 'read_only_auditor'),
    exposeHeadRoute: false,
    schema: { params: IdParams, response: { '4xx': ErrorResponse } },
  }, async (request, reply) => {
    const campaign = await readCampaign(db, request.params.id)
    if (!campaign) return reply.code(404).send({ error: 'not_found' })
    const bytes = await catalogueWorkbook(await catalogueItems(db, campaign.id))
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="katalog-${campaign.schoolYear.replace('/', '-')}.xlsx"`)
      .send(bytes)
  })

  /**
   * Runs a change to an item the caller addresses by id. An item of a
   * campaign the caller may not see is not found to them; a refusal by
   * ownership or state gets its code.
   */
  async function withItem<T>(reply: FastifyReply, id: string, caller: Caller, fn: () => Promise<T | undefined>, okStatus = 200) {
    const item = await readItem(db, id)
    const campaign = item === undefined ? undefined : await readCampaign(db, item.campaignId)
    if (!item || !campaign || !canSee(caller, campaign.state)) return reply.code(404).send({ error: 'not_found' })
    return refusals(reply, async () => {
      const result = await fn()
      if (result === undefined) return reply.code(404).send({ error: 'not_found' })
      return okStatus === 204 ? reply.code(204).send() : result
    })
  }
}

/** Who may propose: teachers of the roster in force, and organizers on anyone's behalf. */
function mayPropose(caller: Caller): boolean {
  return isTeacher(caller) || isOrganizer(caller)
}

/**
 * The body as the library takes it, defaults filled in. On creation the
 * proposing teacher is among the teachers when they are one and left
 * themselves out; an edit keeps the list as sent, so an organizer who is
 * also a teacher does not become a teacher of an item they corrected.
 */
function itemInput(body: Static<typeof ItemBody>, caller: Caller, creating: boolean): ItemInput {
  const teachers = [...body.teachers]
  if (creating && isTeacher(caller) && caller.person && !teachers.includes(caller.person.id)) teachers.unshift(caller.person.id)
  return {
    title: body.title,
    description: body.description ?? '',
    location: body.location ?? '',
    feeCents: body.feeCents ?? 0,
    feeNote: body.feeNote ?? '',
    places: body.places,
    minParticipants: body.minParticipants ?? 0,
    cancellableBelowMin: body.cancellableBelowMin ?? (body.fixedClasses ?? []).length === 0,
    fixedClasses: uniqueSorted(body.fixedClasses ?? []),
    eligibleGrades: [...new Set(body.eligibleGrades ?? [])].sort((a, b) => a - b),
    eligibleClasses: uniqueSorted(body.eligibleClasses ?? []),
    teachers,
    sessions: body.sessions.map((session) => ({ startsAt: session.startsAt, endsAt: session.endsAt, location: session.location ?? '', credits: session.credits })),
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'de'))
}

/** 403 for the wrong person, 404 for what is not there, 409 for a state that refuses, 422 for an activity that breaks the rules. */
async function refusals<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ItemInvalid) return reply.code(422).send({ error: 'item_invalid', problems: err.problems, unknownTeachers: err.unknownTeachers })
    if (err instanceof RosterConflict) {
      if (err.code === 'forbidden') return reply.code(403).send({ error: 'forbidden' })
      if (err.code === 'not_found') return reply.code(404).send({ error: 'not_found' })
      return reply.code(409).send({ error: err.code })
    }
    throw err
  }
}
