// The allocation's API, typed as the server answers it (apps/api/routes/allocation.ts).

import { endpointPath } from '@school-allocation/api-contracts/client-endpoint'
import * as endpoints from '@school-allocation/api-contracts/endpoint-metadata'
import { apiRequest } from './api.ts'

export type { AllocationRun, MyResultResponse, ParticipantsResponse, ReviewItem, ReviewStudent, RunFailureCode, RunReviewResponse, RunStatus, SolverStatusResponse } from '@school-allocation/api-contracts'

export const loadSolverStatus = () => apiRequest(endpoints.getAdminSolver, {})
export const loadRuns = (id: string) => apiRequest(endpoints.getAdminCampaignsByIdRuns, { params: { id } })
export const loadRun = (id: string, runId: string) => apiRequest(endpoints.getAdminCampaignsByIdRunsByRunId, { params: { id, runId } })
export const startRun = (id: string, body: { seed?: number, deterministicTimePerLevel?: number }) => apiRequest(endpoints.postAdminCampaignsByIdRuns, { params: { id }, body })
export const runExportPath = (id: string, runId: string) => endpointPath(endpoints.getAdminCampaignsByIdRunsByRunIdExportXlsx, { params: { id, runId } })
export const publishRun = (id: string, runId: string, cancelledItemIds: string[]) => apiRequest(endpoints.postAdminCampaignsByIdRunsByRunIdPublish, { params: { id, runId }, body: { cancelledItemIds } })
export const assignmentsExportPath = (id: string) => endpointPath(endpoints.getAdminCampaignsByIdExportAssignmentsXlsx, { params: { id } })
export const loadMyResult = (id: string) => apiRequest(endpoints.getCampaignsByIdMyResult, { params: { id } })
export const loadParticipants = (id: string, itemId: string) => apiRequest(endpoints.getCampaignsByIdItemsByItemIdParticipants, { params: { id, itemId } })
