import * as metadata from './endpoint-metadata.ts'
import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { GraphGroupsResponse } from './roster.ts'
import { GraphCallbackQuery, GraphStartQuery, GroupsQuery } from './roster.ts'

export const getAdminRosterGraphStart = defineEndpoint({ ...metadata.getAdminRosterGraphStart, schema: { querystring: GraphStartQuery, response: { '4xx': ErrorResponse } } })

export const getAdminRosterGraphCallback = defineEndpoint({ ...metadata.getAdminRosterGraphCallback, schema: { querystring: GraphCallbackQuery, response: { '4xx': ErrorResponse } } })

export const getAdminRosterGraphGroups = defineEndpoint({ ...metadata.getAdminRosterGraphGroups, schema: { querystring: GroupsQuery, response: { '200': GraphGroupsResponse, '4xx': ErrorResponse } } })
