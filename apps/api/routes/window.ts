// The choice window (docs/domain-and-api.md §3, §8):
//
//   GET  /api/campaigns/:id/my-choice                      a student's fixed items, the groups offered, their ranking, completeness
//   PUT  /api/campaigns/:id/my-choice                      { ranking }: replace it, while the window takes choices
//   GET  /api/admin/campaigns/:id/choices/:personId        the same view of a student, for an organizer
//   PUT  /api/admin/campaigns/:id/choices/:personId        { ranking, reason }: entered on the student's behalf, audited
//   POST /api/admin/campaigns/:id/preassignments/:personId/:itemId/exempt   { reason }, audited
//   GET  /api/admin/campaigns/:id/missing                  every student with the state of their list and the mails sent to them
//   GET  /api/admin/campaigns/:id/export/missing.xlsx
//   GET  /api/admin/campaigns/:id/mail                     the campaign's outbox, newest first
//
// A student is whoever the roster lists as one; a signed-in person the
// roster does not list that way has no choice to make (403). Reads are
// authorized per request: a campaign the caller may not see is 404.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Static } from 'typebox'
import { callerOf, type Caller, type Guards } from '../lib/auth.ts'
import { canSee, isOrganizer, readCampaign, type Campaign } from '../lib/campaigns.ts'
import { campaignStudent, ChoiceInvalid, choiceStates, choiceView, exemptPreAssignment, saveRanking, type CampaignStudent } from '../lib/choices.ts'
import type { Database } from '../lib/db.ts'
import { listCampaignMails, mailStatesByPerson } from '../lib/mail/outbox.ts'
import { RosterConflict } from '../lib/roster.ts'
import { ErrorResponse, StrictObject, Uuid } from '../lib/schemas/common.ts'
import { ExemptBody, ExemptParams, OnBehalfBody, PersonParams, RankingBody, RankingInvalidResponse } from '../lib/schemas/window.ts'
import { missingWorkbook } from '../lib/xlsx.ts'

export interface WindowRoutesOptions {
  db: Database
  guards: Guards
}

const IdParams = StrictObject({ id: Uuid })

export async function windowRoutes(app: FastifyInstance, { db, guards }: WindowRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }
  const auditor = { preHandler: guards.requireRole('campaign_organizer', 'school_admin', 'read_only_auditor') }

  /** The campaign, when the caller may see it; otherwise a 404 has been sent. */
  async function visible(request: FastifyRequest, reply: FastifyReply, id: string): Promise<Campaign | undefined> {
    const campaign = await readCampaign(db, id)
    if (!campaign || !canSee(callerOf(request), campaign.state)) {
      await reply.code(404).send({ error: 'not_found' })
      return undefined
    }
    return campaign
  }

  /** The caller as a student of the campaign's roster, or a 403 has been sent. */
  async function asStudent(reply: FastifyReply, campaign: Campaign, caller: Caller): Promise<CampaignStudent | undefined> {
    const student = caller.person === null ? undefined : await campaignStudent(db, campaign, caller.person.id)
    if (!student) {
      await reply.code(403).send({ error: 'not_a_student' })
      return undefined
    }
    return student
  }

  /** The student an organizer names, or a 404 has been sent. */
  async function namedStudent(reply: FastifyReply, campaign: Campaign, personId: string): Promise<CampaignStudent | undefined> {
    const student = await campaignStudent(db, campaign, personId.toLowerCase())
    if (!student) await reply.code(404).send({ error: 'not_found' })
    return student
  }

  const rankingSchema = { params: IdParams, body: RankingBody, response: { '422': RankingInvalidResponse, '4xx': ErrorResponse } }

  app.get<{ Params: Static<typeof IdParams> }>('/api/campaigns/:id/my-choice', { ...signedIn, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const campaign = await visible(request, reply, request.params.id)
    if (!campaign) return
    const student = await asStudent(reply, campaign, callerOf(request))
    if (!student) return
    return { campaign, ...await choiceView(db, campaign, student) }
  })

  app.put<{ Params: Static<typeof IdParams>, Body: Static<typeof RankingBody> }>('/api/campaigns/:id/my-choice', { ...signedIn, schema: rankingSchema }, async (request, reply) => {
    const campaign = await visible(request, reply, request.params.id)
    if (!campaign) return
    const caller = callerOf(request)
    const student = await asStudent(reply, campaign, caller)
    if (!student) return
    return refusals(reply, async () => ({ campaign, ...await saveRanking(db, campaign, student, request.body.ranking, { caller }) }))
  })

  app.get<{ Params: Static<typeof PersonParams> }>('/api/admin/campaigns/:id/choices/:personId', { ...organizer, schema: { params: PersonParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const campaign = await visible(request, reply, request.params.id)
    if (!campaign) return
    const student = await namedStudent(reply, campaign, request.params.personId)
    if (!student) return
    return { campaign, ...await choiceView(db, campaign, student) }
  })

  app.put<{ Params: Static<typeof PersonParams>, Body: Static<typeof OnBehalfBody> }>('/api/admin/campaigns/:id/choices/:personId', {
    ...organizer, schema: { params: PersonParams, body: OnBehalfBody, response: { '422': RankingInvalidResponse, '4xx': ErrorResponse } },
  }, async (request, reply) => {
    const campaign = await visible(request, reply, request.params.id)
    if (!campaign) return
    const student = await namedStudent(reply, campaign, request.params.personId)
    if (!student) return
    return refusals(reply, async () => ({ campaign, ...await saveRanking(db, campaign, student, request.body.ranking, { caller: callerOf(request), reason: request.body.reason }) }))
  })

  app.post<{ Params: Static<typeof ExemptParams>, Body: Static<typeof ExemptBody> }>('/api/admin/campaigns/:id/preassignments/:personId/:itemId/exempt', {
    ...organizer, schema: { params: ExemptParams, body: ExemptBody, response: { '4xx': ErrorResponse } },
  }, async (request, reply) => {
    const campaign = await visible(request, reply, request.params.id)
    if (!campaign) return
    const student = await namedStudent(reply, campaign, request.params.personId)
    if (!student) return
    return refusals(reply, async () => {
      const done = await exemptPreAssignment(db, campaign, student.personId, request.params.itemId.toLowerCase(), request.body.reason, callerOf(request))
      if (!done) return reply.code(404).send({ error: 'not_found' })
      return { campaign, ...await choiceView(db, campaign, student) }
    })
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/admin/campaigns/:id/missing', { ...auditor, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const campaign = await readCampaign(db, request.params.id)
    if (!campaign) return reply.code(404).send({ error: 'not_found' })
    const [states, mails] = await Promise.all([choiceStates(db, campaign), mailStatesByPerson(db, campaign.id)])
    return { students: states.map((s) => ({ ...s, mails: mails.get(s.personId) ?? [] })) }
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/admin/campaigns/:id/export/missing.xlsx', { ...auditor, exposeHeadRoute: false, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const campaign = await readCampaign(db, request.params.id)
    if (!campaign) return reply.code(404).send({ error: 'not_found' })
    const [states, mails] = await Promise.all([choiceStates(db, campaign), mailStatesByPerson(db, campaign.id)])
    const bytes = await missingWorkbook(states.map((s) => ({ ...s, mails: mails.get(s.personId) ?? [] })))
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="wahlstand-${campaign.schoolYear.replace('/', '-')}.xlsx"`)
      .send(bytes)
  })

  app.get<{ Params: Static<typeof IdParams> }>('/api/admin/campaigns/:id/mail', { ...auditor, schema: { params: IdParams, response: { '4xx': ErrorResponse } } }, async (request, reply) => {
    const campaign = await readCampaign(db, request.params.id)
    if (!campaign) return reply.code(404).send({ error: 'not_found' })
    // The protocol: what was sent to whom and whether it left; the texts stay in the outbox.
    const mails = (await listCampaignMails(db, campaign.id)).map(({ body: _body, ...rest }) => rest)
    return { mails }
  })

  void isOrganizer
}

/** 404 for what is not there, 409 for a state that refuses, 422 for a ranking that breaks the rules. */
async function refusals<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ChoiceInvalid) return reply.code(422).send({ error: 'ranking_invalid', problems: err.problems })
    if (err instanceof RosterConflict) {
      if (err.code === 'not_found') return reply.code(404).send({ error: 'not_found' })
      return reply.code(409).send({ error: err.code })
    }
    throw err
  }
}
