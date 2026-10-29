import { ErrorResponse, HealthResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'

export const getHealth = defineEndpoint({
  method: 'GET', path: '/api/health', transport: 'json',
  schema: { response: { '200': HealthResponse, '503': HealthResponse, '4xx': ErrorResponse } },
})
