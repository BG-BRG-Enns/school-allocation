import { type MailKind } from '@school-allocation/api-contracts/mail'
import { type Actor } from '../actor.ts'
import type { Queryable } from '../db.ts'

/** The texts the school saved, one row per kind at most; a kind without a row has the catalogue's default. */
export async function listTemplates(db: Queryable) {
  const { rows } = await db.query<{ kind: MailKind, subject: string, body: string, locale: string, updated_at: Date, updated_by: string }>(
    'select kind, subject, body, locale, updated_at, updated_by from mail_template order by kind',
  )
  return rows.map((row) => ({ kind: row.kind, subject: row.subject, body: row.body, locale: row.locale, updatedAt: row.updated_at, updatedBy: row.updated_by }))
}

/** Stores the school's text of `kind`, written in `locale`, in place of the one before. */
export async function saveTemplate(db: Queryable, kind: MailKind, subject: string, body: string, locale: string, actor: Actor) {
  await db.query(
    `insert into mail_template (kind, subject, body, locale, updated_by) values ($1, $2, $3, $4, $5)
     on conflict (kind) do update set subject = excluded.subject, body = excluded.body, locale = excluded.locale, updated_at = now(), updated_by = excluded.updated_by`,
    [kind, subject, body, locale, actor.id],
  )
}

/** Removes the school's text of `kind`; the language it was written in, or null when there was none. */
export async function deleteTemplate(db: Queryable, kind: MailKind): Promise<{ locale: string } | null> {
  const { rows } = await db.query<{ locale: string }>('delete from mail_template where kind = $1 returning locale', [kind])
  return rows[0] ?? null
}
