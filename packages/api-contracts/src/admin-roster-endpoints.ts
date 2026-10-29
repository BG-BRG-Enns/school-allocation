import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { BatchDetailSchema, GroupsResponse, PersonsResponse, RosterOverviewSchema } from './roster.ts'
import { GroupsBody, PersonsQuery } from './roster.ts'

export const getAdminRoster = defineEndpoint({ method: 'GET', path: '/api/admin/roster', transport: 'json', schema: { response: { '200': RosterOverviewSchema, '4xx': ErrorResponse } } })

export const putAdminRosterGroups = defineEndpoint({ method: 'PUT', path: '/api/admin/roster/groups', transport: 'json', schema: { body: GroupsBody, response: { '200': GroupsResponse, '4xx': ErrorResponse } } })

export const getAdminRosterBatchesById = defineEndpoint({ method: 'GET', path: '/api/admin/roster/batches/:id', transport: 'json', schema: { params: IdParams, response: { '200': BatchDetailSchema, '4xx': ErrorResponse } } })

export const postAdminRosterBatchesByIdCommit = defineEndpoint({ method: 'POST', path: '/api/admin/roster/batches/:id/commit', transport: 'json', schema: { params: IdParams, response: { '200': BatchDetailSchema, '4xx': ErrorResponse } } })

export const postAdminRosterBatchesByIdDiscard = defineEndpoint({ method: 'POST', path: '/api/admin/roster/batches/:id/discard', transport: 'json', schema: { params: IdParams, response: { '200': BatchDetailSchema, '4xx': ErrorResponse } } })

export const getAdminRosterPersons = defineEndpoint({ method: 'GET', path: '/api/admin/roster/persons', transport: 'json', schema: { querystring: PersonsQuery, response: { '200': PersonsResponse, '4xx': ErrorResponse } } })
