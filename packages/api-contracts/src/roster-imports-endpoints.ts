import * as metadata from './endpoint-metadata.ts'
import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { BatchDetailSchema } from './roster.ts'
import { CsvBody } from './roster.ts'

export const postAdminRosterCsv = defineEndpoint({ ...metadata.postAdminRosterCsv, schema: { body: CsvBody, response: { '201': BatchDetailSchema, '4xx': ErrorResponse } } })

export const getAdminRosterCsvTemplate = defineEndpoint({ ...metadata.getAdminRosterCsvTemplate, schema: { } })
