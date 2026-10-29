import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { ChoiceViewSchema } from './index.ts'
import { RankingBody, RankingInvalidResponse } from './window.ts'

export const getCampaignsByIdMyChoice = defineEndpoint({ method: 'GET', path: '/api/campaigns/:id/my-choice', transport: 'json', schema: { params: IdParams, response: { '200': ChoiceViewSchema, '4xx': ErrorResponse } } })

export const putCampaignsByIdMyChoice = defineEndpoint({ method: 'PUT', path: '/api/campaigns/:id/my-choice', transport: 'json', schema: { params: IdParams, body: RankingBody, response: { '422': RankingInvalidResponse, '4xx': ErrorResponse, '200': ChoiceViewSchema } } })
