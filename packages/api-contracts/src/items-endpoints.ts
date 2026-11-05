import { Type } from 'typebox'
import * as metadata from './endpoint-metadata.ts'
import { ClassConflictResponse, ItemBody, ItemCheckBody, ItemCheckResponse, ItemInvalidResponse, NoteBody, ReasonBody, TargetReachedResponse } from './catalogue.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { CompanionsBody, CompanionsResponse } from './companions.ts'
import { defineEndpoint } from './endpoint.ts'
import { ItemSchema } from './campaigns.ts'

/** The activity's problems, or a category it names that the school does not have. */
const ItemRefused = Type.Union([ItemInvalidResponse, ErrorResponse])

export const postCampaignsByIdItems = defineEndpoint({ ...metadata.postCampaignsByIdItems, schema: { params: IdParams, body: ItemBody, response: { '422': ItemRefused, '4xx': ErrorResponse, '201': ItemSchema } } })

export const patchItemsById = defineEndpoint({ ...metadata.patchItemsById, schema: { params: IdParams, body: ItemBody, response: { '422': ItemRefused, '409': Type.Union([ClassConflictResponse, ErrorResponse]), '4xx': ErrorResponse, '200': ItemSchema } } })

export const deleteItemsById = defineEndpoint({ ...metadata.deleteItemsById, schema: { params: IdParams, response: { '4xx': ErrorResponse } } })

/** A submission's refusals beyond the state's: a class in two class activities at once, or every cell at its target. */
const ProposalRefused = Type.Union([ClassConflictResponse, TargetReachedResponse, ErrorResponse])

export const postCampaignsByIdItemsCheck = defineEndpoint({ ...metadata.postCampaignsByIdItemsCheck, schema: { params: IdParams, body: ItemCheckBody, response: { '422': ItemRefused, '4xx': ErrorResponse, '200': ItemCheckResponse } } })

export const postItemsByIdPropose = defineEndpoint({ ...metadata.postItemsByIdPropose, schema: { params: IdParams, response: { '200': ItemSchema, '409': ProposalRefused, '4xx': ErrorResponse } } })

/** The companions (the school's wish 6): the list a teacher joins from, joining and leaving, and the lead's or an organizer's edit of the companions alone. */
export const getCampaignsByIdCompanions = defineEndpoint({ ...metadata.getCampaignsByIdCompanions, schema: { params: IdParams, response: { '200': CompanionsResponse, '4xx': ErrorResponse } } })

export const postItemsByIdCompanionsMe = defineEndpoint({ ...metadata.postItemsByIdCompanionsMe, schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const deleteItemsByIdCompanionsMe = defineEndpoint({ ...metadata.deleteItemsByIdCompanionsMe, schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const putItemsByIdCompanions = defineEndpoint({ ...metadata.putItemsByIdCompanions, schema: { params: IdParams, body: CompanionsBody, response: { '422': ItemRefused, '200': ItemSchema, '4xx': ErrorResponse } } })

export const postItemsByIdUnpropose = defineEndpoint({ ...metadata.postItemsByIdUnpropose, schema: { params: IdParams, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const postAdminItemsByIdApprove = defineEndpoint({ ...metadata.postAdminItemsByIdApprove, schema: { params: IdParams, response: { '200': ItemSchema, '409': Type.Union([ClassConflictResponse, ErrorResponse]), '4xx': ErrorResponse } } })

export const postAdminItemsByIdReturn = defineEndpoint({ ...metadata.postAdminItemsByIdReturn, schema: { params: IdParams, body: NoteBody, response: { '200': ItemSchema, '4xx': ErrorResponse } } })

export const postAdminItemsByIdWithdraw = defineEndpoint({ ...metadata.postAdminItemsByIdWithdraw, schema: { params: IdParams, body: ReasonBody, response: { '200': ItemSchema, '4xx': ErrorResponse } } })
