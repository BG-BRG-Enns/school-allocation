import * as metadata from './endpoint-metadata.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { CampaignMailResponse } from './mail.ts'
import { MissingResponse } from './choices.ts'

export const getAdminCampaignsByIdMissing = defineEndpoint({ ...metadata.getAdminCampaignsByIdMissing, schema: { params: IdParams, response: { '200': MissingResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdExportMissingXlsx = defineEndpoint({ ...metadata.getAdminCampaignsByIdExportMissingXlsx, schema: { params: IdParams, response: { '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdMail = defineEndpoint({ ...metadata.getAdminCampaignsByIdMail, schema: { params: IdParams, response: { '200': CampaignMailResponse, '4xx': ErrorResponse } } })
