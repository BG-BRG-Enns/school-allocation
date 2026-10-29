import * as metadata from './endpoint-metadata.ts'
import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { ChoiceViewSchema } from './choices.ts'
import { ExemptBody, ExemptParams, OnBehalfBody, PersonParams, RankingInvalidResponse } from './window.ts'

export const getAdminCampaignsByIdChoicesByPersonId = defineEndpoint({ ...metadata.getAdminCampaignsByIdChoicesByPersonId, schema: { params: PersonParams, response: { '200': ChoiceViewSchema, '4xx': ErrorResponse } } })

export const putAdminCampaignsByIdChoicesByPersonId = defineEndpoint({ ...metadata.putAdminCampaignsByIdChoicesByPersonId, schema: { params: PersonParams, body: OnBehalfBody, response: { '200': ChoiceViewSchema, '422': RankingInvalidResponse, '4xx': ErrorResponse } } })

export const postAdminCampaignsByIdPreassignmentsByPersonIdByItemIdExempt = defineEndpoint({ ...metadata.postAdminCampaignsByIdPreassignmentsByPersonIdByItemIdExempt, schema: { params: ExemptParams, body: ExemptBody, response: { '200': ChoiceViewSchema, '4xx': ErrorResponse } } })
