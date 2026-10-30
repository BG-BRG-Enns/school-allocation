import { RunParams } from './allocation.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import * as metadata from './endpoint-metadata.ts'
import { ChangedResponse, ChangesResponse, ItemParams, ManualChangeBody, MyResultResponse, ParticipantsResponse, PublishBody, PublishedResponse, SwapBody } from './publication.ts'

export const postAdminCampaignsByIdRunsByRunIdPublish = defineEndpoint({ ...metadata.postAdminCampaignsByIdRunsByRunIdPublish, schema: { params: RunParams, body: PublishBody, response: { '200': PublishedResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdExportAssignmentsXlsx = defineEndpoint({ ...metadata.getAdminCampaignsByIdExportAssignmentsXlsx, schema: { params: IdParams, response: { '4xx': ErrorResponse } } })

export const getCampaignsByIdMyResult = defineEndpoint({ ...metadata.getCampaignsByIdMyResult, schema: { params: IdParams, response: { '200': MyResultResponse, '4xx': ErrorResponse } } })

export const getCampaignsByIdItemsByItemIdParticipants = defineEndpoint({ ...metadata.getCampaignsByIdItemsByItemIdParticipants, schema: { params: ItemParams, response: { '200': ParticipantsResponse, '4xx': ErrorResponse } } })

// Changes after publication (mvp-plan S5a): the student's move in the swap window, the organizer's change and the log; the class teacher's placement is with the class routes.

export const postCampaignsByIdSwap = defineEndpoint({ ...metadata.postCampaignsByIdSwap, schema: { params: IdParams, body: SwapBody, response: { '200': MyResultResponse, '4xx': ErrorResponse } } })

export const postAdminCampaignsByIdAssignments = defineEndpoint({ ...metadata.postAdminCampaignsByIdAssignments, schema: { params: IdParams, body: ManualChangeBody, response: { '200': ChangedResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdAssignments = defineEndpoint({ ...metadata.getAdminCampaignsByIdAssignments, schema: { params: IdParams, response: { '200': ChangesResponse, '4xx': ErrorResponse } } })
