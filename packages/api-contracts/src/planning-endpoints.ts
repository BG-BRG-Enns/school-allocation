import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import * as metadata from './endpoint-metadata.ts'
import { AvailabilityBody, CampaignAvailabilityResponse, DateParams, MyAvailabilityResponse, PersonDateParams, PlanningResponse } from './planning.ts'

/** A teacher's own availability on the days of the registrations taking proposals. */
export const getMyAvailability = defineEndpoint({ ...metadata.getMyAvailability, schema: { response: { '200': MyAvailabilityResponse, '4xx': ErrorResponse } } })
export const putMyAvailabilityByDate = defineEndpoint({ ...metadata.putMyAvailabilityByDate, schema: { params: DateParams, body: AvailabilityBody, response: { '200': MyAvailabilityResponse, '4xx': ErrorResponse } } })

/** The registration's days on which teachers are not plainly available, for whoever proposes. */
export const getCampaignsByIdAvailability = defineEndpoint({ ...metadata.getCampaignsByIdAvailability, schema: { params: IdParams, response: { '200': CampaignAvailabilityResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdPlanning = defineEndpoint({ ...metadata.getAdminCampaignsByIdPlanning, schema: { params: IdParams, response: { '200': PlanningResponse, '4xx': ErrorResponse } } })
/** An organizer sets anyone's availability on one of the registration's days, audited in its chain. */
export const putAdminCampaignsByIdAvailabilityByPersonIdByDate = defineEndpoint({ ...metadata.putAdminCampaignsByIdAvailabilityByPersonIdByDate, schema: { params: PersonDateParams, body: AvailabilityBody, response: { '200': PlanningResponse, '4xx': ErrorResponse } } })
export const getAdminCampaignsByIdExportPlanningXlsx = defineEndpoint({ ...metadata.getAdminCampaignsByIdExportPlanningXlsx, schema: { params: IdParams, response: { '4xx': ErrorResponse } } })
