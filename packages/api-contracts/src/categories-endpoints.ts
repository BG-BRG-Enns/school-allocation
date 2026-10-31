import { CategoriesResponse, CategoryBody, CategoryUsageResponse } from './categories.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import * as metadata from './endpoint-metadata.ts'

/** The school's categories, for everyone signed in: the activity form, the catalogue and the choice page name them. */
export const getCategories = defineEndpoint({ ...metadata.getCategories, schema: { response: { '200': CategoriesResponse, '4xx': ErrorResponse } } })

/** The list with what uses each category, for organizers and administrators; every change answers with it. */
export const getAdminCategories = defineEndpoint({ ...metadata.getAdminCategories, schema: { response: { '200': CategoryUsageResponse, '4xx': ErrorResponse } } })
export const postAdminCategories = defineEndpoint({ ...metadata.postAdminCategories, schema: { body: CategoryBody, response: { '200': CategoryUsageResponse, '4xx': ErrorResponse } } })
export const patchAdminCategoriesById = defineEndpoint({ ...metadata.patchAdminCategoriesById, schema: { params: IdParams, body: CategoryBody, response: { '200': CategoryUsageResponse, '4xx': ErrorResponse } } })
export const deleteAdminCategoriesById = defineEndpoint({ ...metadata.deleteAdminCategoriesById, schema: { params: IdParams, response: { '200': CategoryUsageResponse, '4xx': ErrorResponse } } })
