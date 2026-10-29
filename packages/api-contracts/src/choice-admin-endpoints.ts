import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { ChoiceViewSchema } from './index.ts'
import { ExemptBody,ExemptParams,OnBehalfBody,PersonParams,RankingInvalidResponse } from './window.ts'

export const getAdminCampaignsByIdChoicesByPersonId = defineEndpoint({ method: 'GET', path: '/api/admin/campaigns/:id/choices/:personId', transport: 'json', schema: { params: PersonParams, response: { '200': ChoiceViewSchema, '4xx': ErrorResponse } } })

export const putAdminCampaignsByIdChoicesByPersonId = defineEndpoint({ method: 'PUT', path: '/api/admin/campaigns/:id/choices/:personId', transport: 'json', schema: { params: PersonParams, body: OnBehalfBody, response: { '200': ChoiceViewSchema, '422': RankingInvalidResponse, '4xx': ErrorResponse } } })

export const postAdminCampaignsByIdPreassignmentsByPersonIdByItemIdExempt = defineEndpoint({ method: 'POST', path: '/api/admin/campaigns/:id/preassignments/:personId/:itemId/exempt', transport: 'json', schema: { params: ExemptParams, body: ExemptBody, response: { '200': ChoiceViewSchema, '4xx': ErrorResponse } } })
