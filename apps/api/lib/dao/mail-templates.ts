import { type MailKind } from '@school-allocation/api-contracts/mail'
import { type Actor } from '../actor.ts'
import type { Queryable } from '../db.ts'

export async function listTemplates(db: Queryable) {
  const { rows } = await db.query<{ kind: MailKind, subject: string, body: string, updated_at: Date, updated_by: string | null }>(
    'select kind, subject, body, updated_at, updated_by from mail_template order by kind',
  )
  return rows.map((row) => ({ kind: row.kind, subject: row.subject, body: row.body, updatedAt: row.updated_at, updatedBy: row.updated_by }))
}

export async function updateTemplate(db: Queryable, kind: string, subject: string, body: string, actor: Actor) {
  await db.query('update mail_template set subject = $2, body = $3, updated_at = now(), updated_by = $4 where kind = $1', [kind, subject, body, actor.id])
}
