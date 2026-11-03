import * as metadata from './endpoint-metadata.ts'
import { ErrorResponse, IdParams } from './common.ts'
import { defineEndpoint } from './endpoint.ts'
import { DiscardBody, DiscardResponse, MailPausedBody, MailQueueQuery, MailQueueResponse, MailStatusResponse, QueuedResponse, RetryResponse, TemplateResponse, TemplatesResponse } from './mail.ts'
import { KindParams, TemplateBody, TemplateInvalidResponse } from './window.ts'

export const getAdminMailTemplates = defineEndpoint({ ...metadata.getAdminMailTemplates, schema: { response: { '200': TemplatesResponse, '4xx': ErrorResponse } } })

export const putAdminMailTemplatesByKind = defineEndpoint({ ...metadata.putAdminMailTemplatesByKind, schema: { params: KindParams, body: TemplateBody, response: { '200': TemplateResponse, '422': TemplateInvalidResponse, '4xx': ErrorResponse } } })

export const deleteAdminMailTemplatesByKind = defineEndpoint({ ...metadata.deleteAdminMailTemplatesByKind, schema: { params: KindParams, response: { '200': TemplateResponse, '4xx': ErrorResponse } } })

export const postAdminMailTemplatesByKindTest = defineEndpoint({ ...metadata.postAdminMailTemplatesByKindTest, schema: { params: KindParams, response: { '202': QueuedResponse, '4xx': ErrorResponse } } })

export const getAdminMailStatus = defineEndpoint({ ...metadata.getAdminMailStatus, schema: { response: { '200': MailStatusResponse, '4xx': ErrorResponse } } })

export const putAdminMailPaused = defineEndpoint({ ...metadata.putAdminMailPaused, schema: { body: MailPausedBody, response: { '200': MailStatusResponse, '4xx': ErrorResponse } } })

/** The queue: every mail by state, kind and registration, newest first, without subject or text. */
export const getAdminMail = defineEndpoint({ ...metadata.getAdminMail, schema: { querystring: MailQueueQuery, response: { '200': MailQueueResponse, '4xx': ErrorResponse } } })
/** Waiting mails taken out of the queue, audited; one in a session expires instead of a retry. */
export const postAdminMailDiscard = defineEndpoint({ ...metadata.postAdminMailDiscard, schema: { body: DiscardBody, response: { '200': DiscardResponse, '4xx': ErrorResponse } } })
/** A failed or discarded mail queued again as a copy, audited; the original stays as it was. */
export const postAdminMailByIdRetry = defineEndpoint({ ...metadata.postAdminMailByIdRetry, schema: { params: IdParams, response: { '200': RetryResponse, '4xx': ErrorResponse } } })
