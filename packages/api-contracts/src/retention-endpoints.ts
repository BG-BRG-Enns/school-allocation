import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import * as metadata from './endpoint-metadata.ts'
import { PurgeBody, PurgedResponse, RetentionResponse } from './retention.ts'

export const getAdminRetention = defineEndpoint({ ...metadata.getAdminRetention, schema: { response: { '200': RetentionResponse, '4xx': ErrorResponse } } })

/** Removes the records of a school year past its retention (D-15); administrators, with a reason, audited. */
export const postAdminPurge = defineEndpoint({ ...metadata.postAdminPurge, schema: { body: PurgeBody, response: { '200': PurgedResponse, '4xx': ErrorResponse } } })
