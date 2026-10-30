// The allocation's API, typed as the server answers it (apps/api/routes/allocation.ts).

import { endpointPath } from '@school-allocation/api-contracts/client-endpoint'
import * as endpoints from '@school-allocation/api-contracts/endpoint-metadata'
import { apiRequest } from './api.ts'

export type { AllocationRun, ReviewItem, ReviewStudent, RunFailureCode, RunReviewResponse, RunStatus, SolverStatusResponse } from '@school-allocation/api-contracts'

export const loadSolverStatus = () => apiRequest(endpoints.getAdminSolver, {})
export const loadRuns = (id: string) => apiRequest(endpoints.getAdminCampaignsByIdRuns, { params: { id } })
export const loadRun = (id: string, runId: string) => apiRequest(endpoints.getAdminCampaignsByIdRunsByRunId, { params: { id, runId } })
export const startRun = (id: string, body: { seed?: number, deterministicTimePerLevel?: number }) => apiRequest(endpoints.postAdminCampaignsByIdRuns, { params: { id }, body })
export const runExportPath = (id: string, runId: string) => endpointPath(endpoints.getAdminCampaignsByIdRunsByRunIdExportXlsx, { params: { id, runId } })
