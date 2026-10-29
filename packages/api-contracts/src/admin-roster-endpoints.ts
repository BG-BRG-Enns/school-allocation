import * as metadata from './endpoint-metadata.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { BatchDetailSchema, GroupsResponse, PersonsResponse, RosterOverviewSchema } from './roster.ts'
import { GroupsBody, PersonsQuery } from './roster.ts'

export const getAdminRoster = defineEndpoint({ ...metadata.getAdminRoster, schema: { response: { '200': RosterOverviewSchema, '4xx': ErrorResponse } } })

export const putAdminRosterGroups = defineEndpoint({ ...metadata.putAdminRosterGroups, schema: { body: GroupsBody, response: { '200': GroupsResponse, '4xx': ErrorResponse } } })

export const getAdminRosterBatchesById = defineEndpoint({ ...metadata.getAdminRosterBatchesById, schema: { params: IdParams, response: { '200': BatchDetailSchema, '4xx': ErrorResponse } } })

export const postAdminRosterBatchesByIdCommit = defineEndpoint({ ...metadata.postAdminRosterBatchesByIdCommit, schema: { params: IdParams, response: { '200': BatchDetailSchema, '4xx': ErrorResponse } } })

export const postAdminRosterBatchesByIdDiscard = defineEndpoint({ ...metadata.postAdminRosterBatchesByIdDiscard, schema: { params: IdParams, response: { '200': BatchDetailSchema, '4xx': ErrorResponse } } })

export const getAdminRosterPersons = defineEndpoint({ ...metadata.getAdminRosterPersons, schema: { querystring: PersonsQuery, response: { '200': PersonsResponse, '4xx': ErrorResponse } } })
