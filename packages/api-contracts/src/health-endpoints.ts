import * as metadata from './endpoint-metadata.ts'
import { ErrorResponse, HealthResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'

export const getHealth = defineEndpoint({ ...metadata.getHealth,
  schema: { response: { '200': HealthResponse, '503': HealthResponse, '4xx': ErrorResponse } },
})
