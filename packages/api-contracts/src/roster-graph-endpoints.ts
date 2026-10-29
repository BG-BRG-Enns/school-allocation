import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { GraphGroupsResponse } from './index.ts'
import { GraphCallbackQuery, GraphStartQuery, GroupsQuery } from './roster.ts'

export const getAdminRosterGraphStart = defineEndpoint({ method: 'GET', path: '/api/admin/roster/graph/start', transport: 'redirect', schema: { querystring: GraphStartQuery, response: { '4xx': ErrorResponse } } })

export const getAdminRosterGraphCallback = defineEndpoint({ method: 'GET', path: '/api/admin/roster/graph/callback', transport: 'redirect', schema: { querystring: GraphCallbackQuery, response: { '4xx': ErrorResponse } } })

export const getAdminRosterGraphGroups = defineEndpoint({ method: 'GET', path: '/api/admin/roster/graph/groups', transport: 'json', schema: { querystring: GroupsQuery, response: { '200': GraphGroupsResponse, '4xx': ErrorResponse } } })
