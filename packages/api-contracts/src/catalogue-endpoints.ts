import * as metadata from './endpoint-metadata.ts'
import { ClassParams, TeachersQuery } from './catalogue.ts'
import { ErrorResponse, IdParams, StrictObject } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { CatalogueResponse, DemandResponse, ItemsResponse, RosterClassesResponse, TeachersResponse } from './campaigns.ts'
import { ClassStatusSchema } from './choices.ts'

export const getCampaignsByIdDemand = defineEndpoint({ ...metadata.getCampaignsByIdDemand, schema: { params: IdParams, response: { '200': DemandResponse, '4xx': ErrorResponse } } })

export const getCampaignsByIdClassesByClassNameStatus = defineEndpoint({ ...metadata.getCampaignsByIdClassesByClassNameStatus, schema: { params: StrictObject({ ...IdParams.properties, ...ClassParams.properties }), response: { '200': ClassStatusSchema, '4xx': ErrorResponse } } })

export const getCampaignsByIdItems = defineEndpoint({ ...metadata.getCampaignsByIdItems, schema: { params: IdParams, response: { '200': ItemsResponse, '4xx': ErrorResponse } } })

export const getCampaignsByIdCatalogue = defineEndpoint({ ...metadata.getCampaignsByIdCatalogue, schema: { params: IdParams, response: { '200': CatalogueResponse, '4xx': ErrorResponse } } })

export const getCampaignsByIdClasses = defineEndpoint({ ...metadata.getCampaignsByIdClasses, schema: { params: IdParams, response: { '200': RosterClassesResponse, '4xx': ErrorResponse } } })

export const getCampaignsByIdTeachers = defineEndpoint({ ...metadata.getCampaignsByIdTeachers, schema: { params: IdParams, querystring: TeachersQuery, response: { '200': TeachersResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdExportCatalogueXlsx = defineEndpoint({ ...metadata.getAdminCampaignsByIdExportCatalogueXlsx, schema: { params: IdParams, response: { '4xx': ErrorResponse } } })
