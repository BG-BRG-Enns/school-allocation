import * as metadata from './endpoint-metadata.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { ChoiceViewSchema } from './choices.ts'
import { RankingBody, RankingInvalidResponse } from './window.ts'

export const getCampaignsByIdMyChoice = defineEndpoint({ ...metadata.getCampaignsByIdMyChoice, schema: { params: IdParams, response: { '200': ChoiceViewSchema, '4xx': ErrorResponse } } })

export const putCampaignsByIdMyChoice = defineEndpoint({ ...metadata.putCampaignsByIdMyChoice, schema: { params: IdParams, body: RankingBody, response: { '422': RankingInvalidResponse, '4xx': ErrorResponse, '200': ChoiceViewSchema } } })
