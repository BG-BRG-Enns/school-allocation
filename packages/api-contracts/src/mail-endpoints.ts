import * as metadata from './endpoint-metadata.ts'
import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { MailStatusResponse, QueuedResponse, TemplateResponse, TemplatesResponse } from './mail.ts'
import { KindParams, TemplateBody, TemplateInvalidResponse } from './window.ts'

export const getAdminMailTemplates = defineEndpoint({ ...metadata.getAdminMailTemplates, schema: { response: { '200': TemplatesResponse, '4xx': ErrorResponse } } })

export const putAdminMailTemplatesByKind = defineEndpoint({ ...metadata.putAdminMailTemplatesByKind, schema: { params: KindParams, body: TemplateBody, response: { '200': TemplateResponse, '422': TemplateInvalidResponse, '4xx': ErrorResponse } } })

export const postAdminMailTemplatesByKindTest = defineEndpoint({ ...metadata.postAdminMailTemplatesByKindTest, schema: { params: KindParams, response: { '202': QueuedResponse, '4xx': ErrorResponse } } })

export const getAdminMailStatus = defineEndpoint({ ...metadata.getAdminMailStatus, schema: { response: { '200': MailStatusResponse, '4xx': ErrorResponse } } })
