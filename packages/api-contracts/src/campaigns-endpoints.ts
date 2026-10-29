import { CampaignBody,CampaignChangesBody,TransitionBody } from './catalogue.ts'
import { ErrorResponse,IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { CampaignListResponse,CampaignSchema,CampaignViewSchema } from './index.ts'

export const getCampaigns = defineEndpoint({ method: 'GET', path: '/api/campaigns', transport: 'json', schema: { response: { '200': CampaignListResponse, '4xx': ErrorResponse } } })

export const getCampaignsById = defineEndpoint({ method: 'GET', path: '/api/campaigns/:id', transport: 'json', schema: { params: IdParams, response: { '200': CampaignViewSchema, '4xx': ErrorResponse } } })

export const postAdminCampaigns = defineEndpoint({ method: 'POST', path: '/api/admin/campaigns', transport: 'json', schema: { body: CampaignBody, response: { '201': CampaignSchema, '4xx': ErrorResponse } } })

export const patchAdminCampaignsById = defineEndpoint({ method: 'PATCH', path: '/api/admin/campaigns/:id', transport: 'json', schema: { params: IdParams, body: CampaignChangesBody, response: { '200': CampaignSchema, '4xx': ErrorResponse } } })

export const postAdminCampaignsByIdTransition = defineEndpoint({ method: 'POST', path: '/api/admin/campaigns/:id/transition', transport: 'json', schema: { params: IdParams, body: TransitionBody, response: { '200': CampaignSchema, '4xx': ErrorResponse } } })
