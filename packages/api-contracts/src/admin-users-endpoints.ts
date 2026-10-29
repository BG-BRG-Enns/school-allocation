import * as metadata from './endpoint-metadata.ts'
import { BindingBody, GrantBody, UsersQuery } from './administration.ts'
import { ReasonBody } from './catalogue.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { AccountsResponse, AuditResponse, GrantSchema, GrantsResponse } from './administration.ts'

export const getAdminUsers = defineEndpoint({ ...metadata.getAdminUsers, schema: { querystring: UsersQuery, response: { '200': AccountsResponse, '4xx': ErrorResponse } } })

export const postAdminUsersByIdBlock = defineEndpoint({ ...metadata.postAdminUsersByIdBlock, schema: { params: IdParams, body: ReasonBody, response: { '4xx': ErrorResponse } } })

export const postAdminUsersByIdUnblock = defineEndpoint({ ...metadata.postAdminUsersByIdUnblock, schema: { params: IdParams, body: ReasonBody, response: { '4xx': ErrorResponse } } })

export const postAdminBindings = defineEndpoint({ ...metadata.postAdminBindings, schema: { body: BindingBody, response: { '4xx': ErrorResponse } } })

export const getAdminRoles = defineEndpoint({ ...metadata.getAdminRoles, schema: { response: { '200': GrantsResponse, '4xx': ErrorResponse } } })

export const postAdminRoles = defineEndpoint({ ...metadata.postAdminRoles, schema: { body: GrantBody, response: { '201': GrantSchema, '4xx': ErrorResponse } } })

export const postAdminRolesByIdRevoke = defineEndpoint({ ...metadata.postAdminRolesByIdRevoke, schema: { params: IdParams, body: ReasonBody, response: { '4xx': ErrorResponse } } })

export const getAdminAudit = defineEndpoint({ ...metadata.getAdminAudit, schema: { response: { '200': AuditResponse, '4xx': ErrorResponse } } })
