import { RunParams } from './allocation.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import * as metadata from './endpoint-metadata.ts'
import { ItemParams, MyResultResponse, ParticipantsResponse, PublishBody, PublishedResponse } from './publication.ts'

export const postAdminCampaignsByIdRunsByRunIdPublish = defineEndpoint({ ...metadata.postAdminCampaignsByIdRunsByRunIdPublish, schema: { params: RunParams, body: PublishBody, response: { '200': PublishedResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdExportAssignmentsXlsx = defineEndpoint({ ...metadata.getAdminCampaignsByIdExportAssignmentsXlsx, schema: { params: IdParams, response: { '4xx': ErrorResponse } } })

export const getCampaignsByIdMyResult = defineEndpoint({ ...metadata.getCampaignsByIdMyResult, schema: { params: IdParams, response: { '200': MyResultResponse, '4xx': ErrorResponse } } })

export const getCampaignsByIdItemsByItemIdParticipants = defineEndpoint({ ...metadata.getCampaignsByIdItemsByItemIdParticipants, schema: { params: ItemParams, response: { '200': ParticipantsResponse, '4xx': ErrorResponse } } })
