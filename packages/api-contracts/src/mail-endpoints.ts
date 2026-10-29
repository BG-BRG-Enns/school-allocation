import { ErrorResponse } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { MailStatusResponse,QueuedResponse,TemplateResponse,TemplatesResponse } from './index.ts'
import { KindParams,TemplateBody,TemplateInvalidResponse } from './window.ts'

export const getAdminMailTemplates = defineEndpoint({ method: 'GET', path: '/api/admin/mail-templates', transport: 'json', schema: { response: { '200': TemplatesResponse, '4xx': ErrorResponse } } })

export const putAdminMailTemplatesByKind = defineEndpoint({ method: 'PUT', path: '/api/admin/mail-templates/:kind', transport: 'json', schema: { params: KindParams, body: TemplateBody, response: { '200': TemplateResponse, '422': TemplateInvalidResponse, '4xx': ErrorResponse } } })

export const postAdminMailTemplatesByKindTest = defineEndpoint({ method: 'POST', path: '/api/admin/mail-templates/:kind/test', transport: 'json', schema: { params: KindParams, response: { '202': QueuedResponse, '4xx': ErrorResponse } } })

export const getAdminMailStatus = defineEndpoint({ method: 'GET', path: '/api/admin/mail/status', transport: 'json', schema: { response: { '200': MailStatusResponse, '4xx': ErrorResponse } } })
