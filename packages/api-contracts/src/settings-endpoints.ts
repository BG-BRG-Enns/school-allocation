import { ClassParams, ClassTeachersBody, PeriodsBody, PeriodsInvalidResponse, TeachersQuery } from './catalogue.ts'
import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { ClassesResponse, PeriodsResponse, TeachersResponse } from './index.ts'

export const getSettingsPeriods = defineEndpoint({ method: 'GET', path: '/api/settings/periods', transport: 'json', schema: { response: { '200': PeriodsResponse, '4xx': ErrorResponse } } })

export const putAdminSettingsPeriods = defineEndpoint({ method: 'PUT', path: '/api/admin/settings/periods', transport: 'json', schema: { body: PeriodsBody, response: { '200': PeriodsResponse, '422': PeriodsInvalidResponse, '4xx': ErrorResponse } } })

export const getAdminClasses = defineEndpoint({ method: 'GET', path: '/api/admin/classes', transport: 'json', schema: { response: { '200': ClassesResponse, '4xx': ErrorResponse } } })

export const getAdminClassesTeachers = defineEndpoint({ method: 'GET', path: '/api/admin/classes/teachers', transport: 'json', schema: { querystring: TeachersQuery, response: { '200': TeachersResponse, '4xx': ErrorResponse } } })

export const putAdminClassesByClassNameTeachers = defineEndpoint({ method: 'PUT', path: '/api/admin/classes/:className/teachers', transport: 'json', schema: { params: ClassParams, body: ClassTeachersBody, response: { '200': ClassesResponse, '4xx': ErrorResponse } } })
