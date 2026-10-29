import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { BatchDetailSchema } from './index.ts'
import { CsvBody } from './roster.ts'

export const postAdminRosterCsv = defineEndpoint({ method: 'POST', path: '/api/admin/roster/csv', transport: 'json', schema: { body: CsvBody, response: { '201': BatchDetailSchema, '4xx': ErrorResponse } } })

export const getAdminRosterCsvTemplate = defineEndpoint({ method: 'GET', path: '/api/admin/roster/csv/template', transport: 'download', schema: { } })
