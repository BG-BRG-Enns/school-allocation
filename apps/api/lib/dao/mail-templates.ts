import { type MailKind } from '@school-allocation/api-contracts/mail'
import { type Actor } from '../actor.ts'
import type { Queryable } from '../db.ts'

export function listTemplateRows(db: Queryable) {
  return db.query<{ kind: MailKind, subject: string, body: string, updated_at: Date, updated_by: string | null }>(
    'select kind, subject, body, updated_at, updated_by from mail_template order by kind',
  )
}

export function updateTemplate(db: Queryable, kind: string, subject: string, body: string, actor: Actor) {
  return db.query('update mail_template set subject = $2, body = $3, updated_at = now(), updated_by = $4 where kind = $1', [kind, subject, body, actor.id])
}
