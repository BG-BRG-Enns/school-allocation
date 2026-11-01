import { Type } from 'typebox'
import * as metadata from './endpoint-metadata.ts'
import { ClassParams, ClassTeachersBody, PeriodsBody, PeriodsInvalidResponse, TeachersQuery } from './catalogue.ts'
import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { ClassesResponse, LanguageSetting, PeriodsResponse, TeacherListApplied, TeacherListBody, TeacherListInvalidResponse, TeacherListPreview } from './settings.ts'
import { TeachersResponse } from './campaigns.ts'

export const getSettingsPeriods = defineEndpoint({ ...metadata.getSettingsPeriods, schema: { response: { '200': PeriodsResponse, '4xx': ErrorResponse } } })

export const putAdminSettingsPeriods = defineEndpoint({ ...metadata.putAdminSettingsPeriods, schema: { body: PeriodsBody, response: { '200': PeriodsResponse, '422': PeriodsInvalidResponse, '4xx': ErrorResponse } } })

export const getSettingsLanguage = defineEndpoint({ ...metadata.getSettingsLanguage, schema: { response: { '200': LanguageSetting, '4xx': ErrorResponse } } })

export const putAdminSettingsLanguage = defineEndpoint({ ...metadata.putAdminSettingsLanguage, schema: { body: LanguageSetting, response: { '200': LanguageSetting, '4xx': ErrorResponse } } })

export const getAdminClasses = defineEndpoint({ ...metadata.getAdminClasses, schema: { response: { '200': ClassesResponse, '4xx': ErrorResponse } } })

export const getAdminClassesTeachers = defineEndpoint({ ...metadata.getAdminClassesTeachers, schema: { querystring: TeachersQuery, response: { '200': TeachersResponse, '4xx': ErrorResponse } } })

export const putAdminClassesByClassNameTeachers = defineEndpoint({ ...metadata.putAdminClassesByClassNameTeachers, schema: { params: ClassParams, body: ClassTeachersBody, response: { '200': ClassesResponse, '4xx': ErrorResponse } } })

export const postAdminClassesImportPreview = defineEndpoint({ ...metadata.postAdminClassesImportPreview, schema: { body: TeacherListBody, response: { '200': TeacherListPreview, '4xx': ErrorResponse } } })

export const postAdminClassesImport = defineEndpoint({ ...metadata.postAdminClassesImport, schema: { body: TeacherListBody, response: { '200': TeacherListApplied, '422': Type.Union([TeacherListInvalidResponse, ErrorResponse]), '4xx': ErrorResponse } } })

export const getAdminClassesImportTemplate = defineEndpoint({ ...metadata.getAdminClassesImportTemplate, schema: { } })
