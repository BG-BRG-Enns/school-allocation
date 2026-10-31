// The outbox (docs/domain-and-api.md §4, D-18): a notice is a row written
// in the same transaction as what triggered it, once per dedupe key; the
// sender claims rows one at a time and records what the server said. The
// states follow an internal mail service by the same author: queued,
// sending while a session is open, sent on the server's acceptance, failed
// after the attempts a transient error gets or at once on a permanent one.

import type { Database, Queryable } from '../db.ts'
import { truncateDetail } from './transport.ts'

export const MAIL_STATES = ['queued', 'sending', 'sent', 'failed'] as const
export type MailState = typeof MAIL_STATES[number]

export interface NewMail {
  kind: string
  campaignId: string | null
  personId: string | null
  to: string
  subject: string
  body: string
  /** Unique per notice, e.g. `reminder:<campaign>:<person>:<close>`; a second write with the same key is dropped. */
  dedupeKey: string
}

export interface OutboxMail {
  id: string
  kind: string
  campaignId: string | null
  personId: string | null
  to: string
  subject: string
  body: string
  dedupeKey: string
  state: MailState
  attempts: number
  detail: string | null
  messageId: string | null
  createdAt: string
  sentAt: string | null
}

/** Queues a mail; false when one with this dedupe key exists already. */
export async function enqueueMail(client: Queryable, mail: NewMail): Promise<boolean> {
  const { rowCount } = await client.query(
    `insert into outbox_mail (kind, campaign_id, person_id, to_address, subject, body, dedupe_key)
     values ($1, $2, $3, $4, $5, $6, $7) on conflict (dedupe_key) do nothing`,
    [mail.kind, mail.campaignId, mail.personId, mail.to, mail.subject, mail.body, mail.dedupeKey],
  )
  return rowCount === 1
}

/** Takes the oldest queued mail whose time has come as `sending`, counting the attempt; undefined when none is due. */
export async function claimNextMail(db: Queryable): Promise<OutboxMail | undefined> {
  const { rows } = await db.query<MailRow>(
    `update outbox_mail set state = 'sending', attempts = attempts + 1, updated_at = app_now()
      where id = (select id from outbox_mail where state = 'queued' and next_attempt_at <= app_now() order by created_at limit 1 for update skip locked)
      returning ${COLUMNS}`,
  )
  return rows[0] === undefined ? undefined : toMail(rows[0])
}

export async function recordSent(db: Queryable, id: string, messageId: string, detail: string): Promise<void> {
  await db.query('update outbox_mail set state = \'sent\', message_id = $2, detail = $3, sent_at = app_now(), updated_at = app_now() where id = $1 and state = \'sending\'', [id, messageId, truncateDetail(detail)])
}

/** A transient failure: back to the queue, tried again after `delayMs`. */
export async function recordRetry(db: Queryable, id: string, detail: string, delayMs: number): Promise<void> {
  await db.query(
    'update outbox_mail set state = \'queued\', detail = $2, next_attempt_at = app_now() + ($3::text || \' milliseconds\')::interval, updated_at = app_now() where id = $1 and state = \'sending\'',
    [id, truncateDetail(detail), String(Math.max(0, Math.round(delayMs)))],
  )
}

export async function recordFailed(db: Queryable, id: string, detail: string): Promise<void> {
  await db.query('update outbox_mail set state = \'failed\', detail = $2, updated_at = app_now() where id = $1 and state = \'sending\'', [id, truncateDetail(detail)])
}

/** At start: mails left in `sending` by the previous process may or may not have left; they are failed with the detail `interrupted`. Returns how many. */
export async function recoverInterruptedMails(db: Queryable): Promise<number> {
  const { rowCount } = await db.query('update outbox_mail set state = \'failed\', detail = \'interrupted\', updated_at = app_now() where state = \'sending\'')
  return rowCount ?? 0
}

/** The mails of a campaign, newest first, for the organizer's protocol. */
export async function listCampaignMails(db: Queryable, campaignId: string, limit = 500): Promise<OutboxMail[]> {
  const { rows } = await db.query<MailRow>(`select ${COLUMNS} from outbox_mail where campaign_id = $1 order by created_at desc limit $2`, [campaignId, limit])
  return rows.map(toMail)
}

/** The state of the latest mail of each kind per person of a campaign, for the non-submitter list. */
export async function mailStatesByPerson(db: Queryable, campaignId: string): Promise<Map<string, { kind: string, state: MailState, createdAt: string }[]>> {
  const { rows } = await db.query<{ person_id: string, kind: string, state: MailState, created_at: Date }>(
    `select distinct on (person_id, kind) person_id, kind, state, created_at from outbox_mail
      where campaign_id = $1 and person_id is not null order by person_id, kind, created_at desc`,
    [campaignId],
  )
  const byPerson = new Map<string, { kind: string, state: MailState, createdAt: string }[]>()
  for (const row of rows) {
    const list = byPerson.get(row.person_id) ?? []
    list.push({ kind: row.kind, state: row.state, createdAt: row.created_at.toISOString() })
    byPerson.set(row.person_id, list)
  }
  return byPerson
}

export async function countQueued(db: Database): Promise<number> {
  const { rows: [row] } = await db.query<{ n: string }>('select count(*)::text as n from outbox_mail where state in (\'queued\', \'sending\')')
  return Number(row?.n ?? 0)
}

const COLUMNS = 'id, kind, campaign_id, person_id, to_address, subject, body, dedupe_key, state, attempts, detail, message_id, created_at, sent_at'

interface MailRow {
  id: string
  kind: string
  campaign_id: string | null
  person_id: string | null
  to_address: string
  subject: string
  body: string
  dedupe_key: string
  state: MailState
  attempts: number
  detail: string | null
  message_id: string | null
  created_at: Date
  sent_at: Date | null
}

function toMail(row: MailRow): OutboxMail {
  return {
    id: row.id,
    kind: row.kind,
    campaignId: row.campaign_id,
    personId: row.person_id,
    to: row.to_address,
    subject: row.subject,
    body: row.body,
    dedupeKey: row.dedupe_key,
    state: row.state,
    attempts: Number(row.attempts),
    detail: row.detail,
    messageId: row.message_id,
    createdAt: row.created_at.toISOString(),
    sentAt: row.sent_at?.toISOString() ?? null,
  }
}
