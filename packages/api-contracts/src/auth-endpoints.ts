import { CallbackQuery, LoginQuery, MeResponse } from './auth.ts'
import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'

export const getAuthLogin = defineEndpoint({ method: 'GET', path: '/api/auth/login', transport: 'redirect', schema: { querystring: LoginQuery, response: { '4xx': ErrorResponse } } })

export const getAuthCallback = defineEndpoint({ method: 'GET', path: '/api/auth/callback', transport: 'redirect', schema: { querystring: CallbackQuery, response: { '4xx': ErrorResponse } } })

export const postAuthLogout = defineEndpoint({ method: 'POST', path: '/api/auth/logout', transport: 'empty', schema: { } })

export const getAuthMe = defineEndpoint({ method: 'GET', path: '/api/auth/me', transport: 'json', optionalResponse: true, schema: { response: { '200': MeResponse, '4xx': ErrorResponse } } })
