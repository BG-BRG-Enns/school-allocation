import { ItemBody, ItemInvalidResponse, NoteBody, ReasonBody } from './catalogue.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { ItemSchema } from './index.ts'

export const postCampaignsByIdItems = defineEndpoint({ method: 'POST', path: '/api/campaigns/:id/items', transport: 'json', schema: { params: IdParams, body: ItemBody, response: { '422': ItemInvalidResponse, '4xx': ErrorResponse, '201': ItemSchema } } })

export const patchItemsById = defineEndpoint({ method: 'PATCH', path: '/api/items/:id', transport: 'json', schema: { params: IdParams, body: ItemBody, response: { '422': ItemInvalidResponse, '4xx': ErrorResponse, '200': ItemSchema } } })

export const deleteItemsById = defineEndpoint({ method: 'DELETE', path: '/api/items/:id', transport: 'empty', schema: { params: IdParams, response: { '4xx': ErrorResponse } } })

export const postItemsByIdPropose = defineEndpoint({ method: 'POST', path: '/api/items/:id/propose', transport: 'json', schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const postItemsByIdUnpropose = defineEndpoint({ method: 'POST', path: '/api/items/:id/unpropose', transport: 'json', schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const postAdminItemsByIdApprove = defineEndpoint({ method: 'POST', path: '/api/admin/items/:id/approve', transport: 'json', schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const postAdminItemsByIdReturn = defineEndpoint({ method: 'POST', path: '/api/admin/items/:id/return', transport: 'json', schema: { params: IdParams, body: NoteBody, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const postAdminItemsByIdWithdraw = defineEndpoint({ method: 'POST', path: '/api/admin/items/:id/withdraw', transport: 'json', schema: { params: IdParams, body: ReasonBody, response: { '200': ItemSchema, '4xx': ErrorResponse } } })
