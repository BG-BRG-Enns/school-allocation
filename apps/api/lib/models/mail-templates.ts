import { type MailKind } from '@school-allocation/api-contracts/mail'

export interface MailTemplate {
  kind: MailKind
  subject: string
  body: string
  placeholders: readonly string[]
  updatedAt: string
  updatedBy: string | null
}

export interface TemplateProblem {
  code: 'subject_syntax' | 'body_syntax' | 'unknown_placeholder' | 'subject_empty'
  message: string
}
