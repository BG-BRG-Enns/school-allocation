import { AttendanceBody, ClassAttendanceResponse, RecordedResponse } from './attendance.ts'
import { ClassParams } from './catalogue.ts'
import { ErrorResponse, IdParams, StrictObject } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import * as metadata from './endpoint-metadata.ts'

const ClassOfCampaign = StrictObject({ ...IdParams.properties, ...ClassParams.properties })

export const getCampaignsByIdClassesByClassNameAttendance = defineEndpoint({ ...metadata.getCampaignsByIdClassesByClassNameAttendance, schema: { params: ClassOfCampaign, response: { '200': ClassAttendanceResponse, '4xx': ErrorResponse } } })

export const getCampaignsByIdClassesByClassNameAttendanceXlsx = defineEndpoint({ ...metadata.getCampaignsByIdClassesByClassNameAttendanceXlsx, schema: { params: ClassOfCampaign, response: { '4xx': ErrorResponse } } })

/** The session's attendance for the students named; a class teacher for their class's students, an organizer for all. */
export const putSessionsByIdAttendance = defineEndpoint({ ...metadata.putSessionsByIdAttendance, schema: { params: IdParams, body: AttendanceBody, response: { '200': RecordedResponse, '4xx': ErrorResponse } } })

export const getAdminCampaignsByIdExportAttendanceXlsx = defineEndpoint({ ...metadata.getAdminCampaignsByIdExportAttendanceXlsx, schema: { params: IdParams, response: { '4xx': ErrorResponse } } })
