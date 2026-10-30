import { RunListResponse, RunParams, RunReviewResponse, RunStartedResponse, SolverStatusResponse, StartRunBody } from './allocation.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import * as metadata from './endpoint-metadata.ts'

export const getAdminSolver = defineEndpoint({ ...metadata.getAdminSolver, schema: { response: { '200': SolverStatusResponse, '4xx': ErrorResponse } } })

export const postAdminCampaignsByIdRuns = defineEndpoint({ ...metadata.postAdminCampaignsByIdRuns, schema: { params: IdParams, body: StartRunBody, response: { '202': RunStartedResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdRuns = defineEndpoint({ ...metadata.getAdminCampaignsByIdRuns, schema: { params: IdParams, response: { '200': RunListResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdRunsByRunId = defineEndpoint({ ...metadata.getAdminCampaignsByIdRunsByRunId, schema: { params: RunParams, response: { '200': RunReviewResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdRunsByRunIdExportXlsx = defineEndpoint({ ...metadata.getAdminCampaignsByIdRunsByRunIdExportXlsx, schema: { params: RunParams, response: { '4xx': ErrorResponse } } })

export type { AllocationRun } from './allocation.ts'
