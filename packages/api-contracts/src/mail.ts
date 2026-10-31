// Shared HTTP shapes. Types are derived from the schemas used by Fastify.

import { Type, type Static } from 'typebox'
import { Literals, StrictObject } from './common.ts'
import { SCHOOL_LOCALES } from './settings.ts'

export const MAIL_KINDS = ['choice_invitation', 'choice_reminder', 'grace_invitation', 'grace_reminder', 'missed_deadline', 'class_missing', 'result_published', 'class_unplaced', 'item_cancelled', 'swap_confirmed', 'assignment_changed'] as const
/** A kind's text as it stands: the school's own when an organizer saved one (`custom`, with the language it was written in), else the catalogue's default in the school's language. */
export const MailTemplateSchema = StrictObject({
  kind: Literals(MAIL_KINDS),
  subject: Type.String(),
  body: Type.String(),
  placeholders: Type.Array(Type.String()),
  custom: Type.Boolean(),
  locale: Type.Union([Literals(SCHOOL_LOCALES), Type.Null()]),
  updatedAt: Type.Union([Type.String(), Type.Null()]),
  updatedBy: Type.Union([Type.String(), Type.Null()]),
})
export type MailTemplate = Static<typeof MailTemplateSchema>

export const OutboxMailSchema = StrictObject({
  id: Type.String(),
  kind: Type.String(),
  campaignId: Type.Union([Type.String(), Type.Null()]),
  personId: Type.Union([Type.String(), Type.Null()]),
  to: Type.String(),
  subject: Type.String(),
  body: Type.String(),
  dedupeKey: Type.String(),
  state: Literals(['queued', 'sending', 'sent', 'failed', 'expired'] as const),
  attempts: Type.Number(),
  detail: Type.Union([Type.String(), Type.Null()]),
  messageId: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  sentAt: Type.Union([Type.String(), Type.Null()]),
})
export type OutboxMail = Static<typeof OutboxMailSchema>

export type MailKind = typeof MAIL_KINDS[number]

export const TemplatesResponse = StrictObject({ templates: Type.Array(MailTemplateSchema), mailEnabled: Type.Boolean() })
export type TemplatesResponse = Static<typeof TemplatesResponse>

export const TemplateResponse = StrictObject({ template: MailTemplateSchema })
export type TemplateResponse = Static<typeof TemplateResponse>

/**
 * What the outbox holds: the mails waiting by priority (`personal`, one
 * someone waits for; `staff`; `students`, in bulk) and one in a session,
 * whether sending is paused, the pace (null while mail is off), and when
 * the last waiting one goes out at that pace (null while off or paused).
 */
export const MailStatusResponse = StrictObject({
  mailEnabled: Type.Boolean(),
  paused: Type.Boolean(),
  perHour: Type.Union([Type.Integer(), Type.Null()]),
  waiting: StrictObject({ personal: Type.Integer(), staff: Type.Integer(), students: Type.Integer() }),
  sending: Type.Integer(),
  expectedEndAt: Type.Union([Type.String(), Type.Null()]),
})
export type MailStatusResponse = Static<typeof MailStatusResponse>

export const MailPausedBody = StrictObject({ paused: Type.Boolean() })
export type MailPausedBody = Static<typeof MailPausedBody>

export const QueuedResponse = StrictObject({ queued: Type.Boolean() })
export type QueuedResponse = Static<typeof QueuedResponse>

export const CampaignMailResponse = StrictObject({ mails: Type.Array(Type.Omit(OutboxMailSchema, ['body', 'subject'])) })
export type CampaignMailResponse = Static<typeof CampaignMailResponse>

export type TemplateInvalidBody = Static<typeof import('./window.ts').TemplateInvalidResponse>
