import { ClassParams, TeachersQuery } from './catalogue.ts'
import { ErrorResponse, IdParams, StrictObject } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { CatalogueResponse, DemandResponse, ItemsResponse, RosterClassesResponse, TeachersResponse } from './campaigns.ts'
import { ClassStatusSchema } from './choices.ts'

export const getCampaignsByIdDemand = defineEndpoint({ method: 'GET', path: '/api/campaigns/:id/demand', transport: 'json', schema: { params: IdParams, response: { '200': DemandResponse, '4xx': ErrorResponse } } })

export const getCampaignsByIdClassesByClassNameStatus = defineEndpoint({ method: 'GET', path: '/api/campaigns/:id/classes/:className/status', transport: 'json', schema: { params: StrictObject({ ...IdParams.properties, ...ClassParams.properties }), response: { '200': ClassStatusSchema, '4xx': ErrorResponse } } })

export const getCampaignsByIdItems = defineEndpoint({ method: 'GET', path: '/api/campaigns/:id/items', transport: 'json', schema: { params: IdParams, response: { '200': ItemsResponse, '4xx': ErrorResponse } } })

export const getCampaignsByIdCatalogue = defineEndpoint({ method: 'GET', path: '/api/campaigns/:id/catalogue', transport: 'json', schema: { params: IdParams, response: { '200': CatalogueResponse, '4xx': ErrorResponse } } })

export const getCampaignsByIdClasses = defineEndpoint({ method: 'GET', path: '/api/campaigns/:id/classes', transport: 'json', schema: { params: IdParams, response: { '200': RosterClassesResponse, '4xx': ErrorResponse } } })

export const getCampaignsByIdTeachers = defineEndpoint({ method: 'GET', path: '/api/campaigns/:id/teachers', transport: 'json', schema: { params: IdParams, querystring: TeachersQuery, response: { '200': TeachersResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdExportCatalogueXlsx = defineEndpoint({ method: 'GET', path: '/api/admin/campaigns/:id/export/catalogue.xlsx', transport: 'download', schema: { params: IdParams, response: { '4xx': ErrorResponse } } })
