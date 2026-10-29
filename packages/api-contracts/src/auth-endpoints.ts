import * as metadata from './endpoint-metadata.ts'
import { CallbackQuery, LoginQuery, MeResponse } from './auth.ts'
import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'

export const getAuthLogin = defineEndpoint({ ...metadata.getAuthLogin, schema: { querystring: LoginQuery, response: { '4xx': ErrorResponse } } })

export const getAuthCallback = defineEndpoint({ ...metadata.getAuthCallback, schema: { querystring: CallbackQuery, response: { '4xx': ErrorResponse } } })

export const postAuthLogout = defineEndpoint({ ...metadata.postAuthLogout, schema: { } })

export const getAuthMe = defineEndpoint({ ...metadata.getAuthMe, optionalResponse: true, schema: { response: { '200': MeResponse, '4xx': ErrorResponse } } })
