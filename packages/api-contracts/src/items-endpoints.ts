import * as metadata from './endpoint-metadata.ts'
import { ItemBody, ItemInvalidResponse, NoteBody, ReasonBody } from './catalogue.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { ItemSchema } from './campaigns.ts'

export const postCampaignsByIdItems = defineEndpoint({ ...metadata.postCampaignsByIdItems, schema: { params: IdParams, body: ItemBody, response: { '422': ItemInvalidResponse, '4xx': ErrorResponse, '201': ItemSchema } } })

export const patchItemsById = defineEndpoint({ ...metadata.patchItemsById, schema: { params: IdParams, body: ItemBody, response: { '422': ItemInvalidResponse, '4xx': ErrorResponse, '200': ItemSchema } } })

export const deleteItemsById = defineEndpoint({ ...metadata.deleteItemsById, schema: { params: IdParams, response: { '4xx': ErrorResponse } } })

export const postItemsByIdPropose = defineEndpoint({ ...metadata.postItemsByIdPropose, schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const postItemsByIdUnpropose = defineEndpoint({ ...metadata.postItemsByIdUnpropose, schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const postAdminItemsByIdApprove = defineEndpoint({ ...metadata.postAdminItemsByIdApprove, schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const postAdminItemsByIdReturn = defineEndpoint({ ...metadata.postAdminItemsByIdReturn, schema: { params: IdParams, body: NoteBody, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const postAdminItemsByIdWithdraw = defineEndpoint({ ...metadata.postAdminItemsByIdWithdraw, schema: { params: IdParams, body: ReasonBody, response: { '200': ItemSchema, '4xx': ErrorResponse } } })
