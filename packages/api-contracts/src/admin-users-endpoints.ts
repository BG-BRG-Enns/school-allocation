import { BindingBody, GrantBody, UsersQuery } from './administration.ts'
import { ReasonBody } from './catalogue.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { AccountsResponse, AuditResponse, GrantSchema, GrantsResponse } from './index.ts'

export const getAdminUsers = defineEndpoint({ method: 'GET', path: '/api/admin/users', transport: 'json', schema: { querystring: UsersQuery, response: { '200': AccountsResponse, '4xx': ErrorResponse } } })

export const postAdminUsersByIdBlock = defineEndpoint({ method: 'POST', path: '/api/admin/users/:id/block', transport: 'empty', schema: { params: IdParams, body: ReasonBody, response: { '4xx': ErrorResponse } } })

export const postAdminUsersByIdUnblock = defineEndpoint({ method: 'POST', path: '/api/admin/users/:id/unblock', transport: 'empty', schema: { params: IdParams, body: ReasonBody, response: { '4xx': ErrorResponse } } })

export const postAdminBindings = defineEndpoint({ method: 'POST', path: '/api/admin/bindings', transport: 'empty', schema: { body: BindingBody, response: { '4xx': ErrorResponse } } })

export const getAdminRoles = defineEndpoint({ method: 'GET', path: '/api/admin/roles', transport: 'json', schema: { response: { '200': GrantsResponse, '4xx': ErrorResponse } } })

export const postAdminRoles = defineEndpoint({ method: 'POST', path: '/api/admin/roles', transport: 'json', schema: { body: GrantBody, response: { '201': GrantSchema, '4xx': ErrorResponse } } })

export const postAdminRolesByIdRevoke = defineEndpoint({ method: 'POST', path: '/api/admin/roles/:id/revoke', transport: 'empty', schema: { params: IdParams, body: ReasonBody, response: { '4xx': ErrorResponse } } })

export const getAdminAudit = defineEndpoint({ method: 'GET', path: '/api/admin/audit', transport: 'json', schema: { response: { '200': AuditResponse, '4xx': ErrorResponse } } })
