import { type MailKind } from '@school-allocation/api-contracts/mail'
import type { Locale } from '@school-allocation/messages'

export interface MailTemplate {
  kind: MailKind
  subject: string
  body: string
  placeholders: readonly string[]
  /** Whether the school saved this text; otherwise it is the catalogue's default in the school's language. */
  custom: boolean
  /** The language a saved text was written in; null for the default. */
  locale: Locale | null
  updatedAt: string | null
  updatedBy: string | null
}

export interface TemplateProblem {
  code: 'subject_syntax' | 'body_syntax' | 'unknown_placeholder' | 'subject_empty'
  message: string
}
