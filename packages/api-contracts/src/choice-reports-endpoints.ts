import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { CampaignMailResponse, MissingResponse } from './index.ts'

export const getAdminCampaignsByIdMissing = defineEndpoint({ method: 'GET', path: '/api/admin/campaigns/:id/missing', transport: 'json', schema: { params: IdParams, response: { '200': MissingResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdExportMissingXlsx = defineEndpoint({ method: 'GET', path: '/api/admin/campaigns/:id/export/missing.xlsx', transport: 'download', schema: { params: IdParams, response: { '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdMail = defineEndpoint({ method: 'GET', path: '/api/admin/campaigns/:id/mail', transport: 'json', schema: { params: IdParams, response: { '200': CampaignMailResponse, '4xx': ErrorResponse } } })
