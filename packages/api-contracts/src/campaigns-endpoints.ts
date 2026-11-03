import { Type } from 'typebox'
import * as metadata from './endpoint-metadata.ts'
import { CampaignBody, CampaignChangesBody, CampaignDeletedResponse, ClassInUseResponse, RulesInvalidResponse, TransitionBody } from './catalogue.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { CampaignListResponse, CampaignSchema, CampaignViewSchema } from './campaigns.ts'

export const getCampaigns = defineEndpoint({ ...metadata.getCampaigns, schema: { response: { '200': CampaignListResponse, '4xx': ErrorResponse } } })

export const getCampaignsById = defineEndpoint({ ...metadata.getCampaignsById, schema: { params: IdParams, response: { '200': CampaignViewSchema, '4xx': ErrorResponse } } })

export const postAdminCampaigns = defineEndpoint({ ...metadata.postAdminCampaigns, schema: { body: CampaignBody, response: { '201': CampaignSchema, '4xx': ErrorResponse } } })

export const patchAdminCampaignsById = defineEndpoint({ ...metadata.patchAdminCampaignsById, schema: { params: IdParams, body: CampaignChangesBody, response: { '200': CampaignSchema, '409': Type.Union([ClassInUseResponse, ErrorResponse]), '422': Type.Union([RulesInvalidResponse, ErrorResponse]), '4xx': ErrorResponse } } })

export const postAdminCampaignsByIdTransition = defineEndpoint({ ...metadata.postAdminCampaignsByIdTransition, schema: { params: IdParams, body: TransitionBody, response: { '200': CampaignSchema, '4xx': ErrorResponse } } })
/** A registration still in preparation deleted, with what went; 409 campaign_state for anything later. */
export const deleteAdminCampaignsById = defineEndpoint({ ...metadata.deleteAdminCampaignsById, schema: { params: IdParams, response: { '200': CampaignDeletedResponse, '4xx': ErrorResponse } } })
