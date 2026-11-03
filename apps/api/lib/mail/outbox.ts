// The outbox (docs/domain-and-api.md §4, D-18): a notice is a row written
// in the same transaction as what triggered it, once per dedupe key; the
// sender claims rows one at a time and records what the server said. The
// states follow an internal mail service by the same author: queued,
// sending while a session is open, sent on the server's acceptance, failed
// after the attempts a transient error gets or at once on a permanent one;
// and expired, for a reminder whose window ended before its turn came.
//
// The pace: a claim takes the mail whose turn it is, by
// priority, then age, never sooner than the spacing after the last claim
// the database holds, and nothing while sending is paused.

import type { MailKind, QueueMail } from '@school-allocation/api-contracts/mail'
import type { Database, Queryable } from '../db.ts'
import { truncateDetail } from './transport.ts'

export const MAIL_STATES = ['queued', 'sending', 'sent', 'failed', 'expired'] as const
export type MailState = typeof MAIL_STATES[number]

/**
 * A mail's turn, set when it is queued; claims go by priority, then age.
 * 1: someone waits for it (a swap's confirmation, a change by hand, the
 * test mail). 2: staff, who see a result or a list before the students do
 * and are the ones who report mistakes. 3: students in bulk (invitations,
 * reminders, the missed deadline, the result).
 */
export type MailPriority = 1 | 2 | 3

const PRIORITY: Readonly<Record<MailKind, MailPriority>> = {
  swap_confirmed: 1,
  assignment_changed: 1,
  class_missing: 2,
  class_unplaced: 2,
  item_cancelled: 2,
  choice_invitation: 3,
  choice_reminder: 3,
  grace_invitation: 3,
  grace_reminder: 3,
  missed_deadline: 3,
  result_published: 3,
}

export interface NewMail {
  kind: MailKind
  campaignId: string | null
  personId: string | null
  to: string
  subject: string
  body: string
  /** Unique per notice, e.g. `reminder:<campaign>:<person>:<close>`; a second write with the same key is dropped. */
  dedupeKey: string
  /** The kind's priority unless given: the test mail of any kind is someone's to wait for. */
  priority?: MailPriority
  /** When it is no longer worth sending (a reminder: the end of the window it reminds of); still queued then, it expires. */
  expiresAt?: string | null
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
    `insert into outbox_mail (kind, campaign_id, person_id, to_address, subject, body, dedupe_key, priority, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (dedupe_key) do nothing`,
    [mail.kind, mail.campaignId, mail.personId, mail.to, mail.subject, mail.body, mail.dedupeKey, mail.priority ?? PRIORITY[mail.kind], mail.expiresAt ?? null],
  )
  return rowCount === 1
}

/** The least time between two claims at `perHour` mails an hour (MAIL_PER_HOUR): evenly spaced, never a burst. */
export function spacingOf(perHour: number): number {
  return 3_600_000 / perHour
}

/** What a claim found: the mail whose turn it is, or how long until one may be (null: not until something changes, an empty queue or sending paused). */
export type Claim = { mail: OutboxMail } | { mail: undefined, retryInMs: number | null }

/**
 * Takes the queued mail whose turn it is as `sending`, counting the attempt
 * and recording the claim: the highest priority first, then the oldest,
 * among those whose time has come. Nothing while sending is paused, and
 * nothing sooner than `spacingMs` after the last claim the database holds,
 * so a restart sends no burst; the claims take one lock, one after the
 * other. The server runs as one process (docs/architecture-decision.md):
 * what a process that died left in `sending` is failed at the next start
 * (recoverInterruptedMails). Mails past their expiry expire on the way.
 */
export async function claimNextMail(db: Database, spacingMs: number): Promise<Claim> {
  return db.tx(async (client) => {
    // The outbox's claims, one at a time; the first key is the lock's
    // namespace (1 is the audit scopes', lib/audit.ts lockScope).
    await client.query('select pg_advisory_xact_lock(2, 0)')
    await expireMails(client)
    const { rows: [setting] } = await client.query<{ paused: boolean }>('select mail_paused as paused from school_setting')
    if (setting?.paused === true) return { mail: undefined, retryInMs: null }
    const { rows: [last] } = await client.query<{ wait: number | null }>(
      `select (extract(epoch from max(claimed_at) + ($1::text || ' milliseconds')::interval - app_now()) * 1000)::float8 as wait
         from outbox_mail where claimed_at is not null`,
      [String(Math.max(0, Math.round(spacingMs)))],
    )
    const spacing = Math.max(0, Math.ceil(last?.wait ?? 0))
    if (spacing > 0) return { mail: undefined, retryInMs: spacing }
    const { rows } = await client.query<MailRow>(
      `update outbox_mail set state = 'sending', attempts = attempts + 1, claimed_at = app_now(), updated_at = app_now()
        where id = (select id from outbox_mail where state = 'queued' and next_attempt_at <= app_now() order by priority, created_at limit 1 for update skip locked)
        returning ${COLUMNS}`,
    )
    if (rows[0] !== undefined) return { mail: toMail(rows[0]) }
    const { rows: [next] } = await client.query<{ wait: number | null }>(
      'select (extract(epoch from min(next_attempt_at) - app_now()) * 1000)::float8 as wait from outbox_mail where state = \'queued\'',
    )
    return { mail: undefined, retryInMs: next?.wait == null ? null : Math.max(0, Math.ceil(next.wait)) }
  })
}

/** Queued mails past their expiry become `expired` and are never sent; returns how many. */
export async function expireMails(db: Queryable): Promise<number> {
  const { rowCount } = await db.query('update outbox_mail set state = \'expired\', updated_at = app_now() where state = \'queued\' and expires_at <= app_now()')
  return rowCount ?? 0
}

/**
 * A campaign's queued mails of `kinds` expire now: the window they remind
 * of has ended, perhaps early; returns how many. One in a session gets the
 * same end: sent, it stays sent, but a transient failure that puts it back
 * in the queue lets it expire there instead of going out later. One
 * statement for both states: a retry committed while it runs is read again
 * as queued and expires, and none slips between the two.
 */
export async function expireCampaignMails(db: Queryable, campaignId: string, kinds: readonly MailKind[]): Promise<number> {
  const { rows } = await db.query<{ state: MailState }>(
    `update outbox_mail
        set state = case when state = 'queued' then 'expired' else state end,
            expires_at = case when expires_at is null or expires_at > app_now() then app_now() else expires_at end,
            updated_at = app_now()
      where state in ('queued', 'sending') and campaign_id = $1 and kind = any($2::text[])
      returning state`,
    [campaignId, kinds],
  )
  return rows.filter((row) => row.state === 'expired').length
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

/** What the queue page asks for: by state, kind, registration, or one mail by id. */
export interface MailFilter {
  id?: string
  ids?: readonly string[]
  state?: MailState
  kind?: MailKind
  campaignId?: string
}

function filterSql(filter: MailFilter): { where: string, params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []
  const add = (sql: string, value: unknown) => {
    params.push(value)
    clauses.push(sql.replace('?', `$${params.length}`))
  }
  if (filter.id !== undefined) add('m.id = ?', filter.id)
  if (filter.ids !== undefined) add('m.id = any(?::uuid[])', filter.ids)
  if (filter.state !== undefined) add('m.state = ?', filter.state)
  if (filter.kind !== undefined) add('m.kind = ?', filter.kind)
  if (filter.campaignId !== undefined) add('m.campaign_id = ?', filter.campaignId)
  return { where: clauses.length === 0 ? '' : ` where ${clauses.join(' and ')}`, params }
}

/** The mails matching the filter, newest first, as the queue page lists them: never the subject or the text. */
export async function listMails(db: Queryable, filter: MailFilter, limit: number): Promise<QueueMail[]> {
  const { where, params } = filterSql(filter)
  const { rows } = await db.query<QueueRow>(
    `select ${QUEUE_COLUMNS} from outbox_mail m left join campaign c on c.id = m.campaign_id${where} order by m.created_at desc, m.id limit $${params.length + 1}`,
    [...params, limit],
  )
  return rows.map(toQueueMail)
}

/** How many mails match the filter, the list's limit aside. */
export async function countMails(db: Queryable, filter: MailFilter): Promise<number> {
  const { where, params } = filterSql(filter)
  const { rows: [row] } = await db.query<{ n: number }>(`select count(*)::int as n from outbox_mail m${where}`, params)
  return row?.n ?? 0
}

/** What an organizer takes out of the queue: the mails named, or a registration's (of some kinds, else all). */
export type DiscardSelection = { ids: readonly string[] } | { campaignId: string, kinds?: readonly MailKind[] }

/**
 * Takes waiting mails out of the queue: queued ones become `expired` with
 * the detail `discarded`, their own expiry untouched (a copy sent again
 * keeps it: none for an invitation, the window's end for a reminder); one
 * in a session gets its expiry set to now, so a transient failure lets it
 * expire instead of going out later (the expireCampaignMails pattern, one
 * statement for both states). Returns how many expired, by kind, and how
 * many in a session were given that expiry; a repeat of the same selection
 * touches nothing, as the queued ones are expired and the in-flight ones
 * already have it.
 */
export async function discardMails(db: Queryable, selection: DiscardSelection): Promise<{ discarded: number, inFlight: number, byKind: Record<string, number> }> {
  const [selectSql, params]: [string, unknown[]] = 'ids' in selection
    ? ['id = any($1::uuid[])', [selection.ids]]
    : selection.kinds === undefined ? ['campaign_id = $1', [selection.campaignId]] : ['campaign_id = $1 and kind = any($2::text[])', [selection.campaignId, selection.kinds]]
  const { rows } = await db.query<{ state: MailState, kind: string }>(
    `update outbox_mail
        set state = case when state = 'queued' then 'expired' else state end,
            detail = case when state = 'queued' then 'discarded' else detail end,
            expires_at = case when state = 'sending' and (expires_at is null or expires_at > app_now()) then app_now() else expires_at end,
            updated_at = app_now()
      where (state = 'queued' or (state = 'sending' and (expires_at is null or expires_at > app_now()))) and ${selectSql}
      returning state, kind`,
    params,
  )
  const byKind: Record<string, number> = {}
  let discarded = 0
  for (const row of rows) {
    if (row.state !== 'expired') continue
    discarded++
    byKind[row.kind] = (byKind[row.kind] ?? 0) + 1
  }
  return { discarded, inFlight: rows.length - discarded, byKind }
}

/**
 * Queues a failed or discarded mail again as a copy under a new dedupe
 * key: the original's rows are immutable, and a state once final stays
 * so. The copy carries no expiry of its own: the original's may be the
 * cutoff a discard gave it in a session, and a reminder's window is
 * judged by the caller before the copy and expires the copy at its end
 * like every queued reminder. Returns the copy's id, or nothing when the
 * mail is neither failed nor discarded.
 */
export async function copyMailForRetry(db: Queryable, id: string, dedupeKey: string): Promise<string | undefined> {
  // The key is the original's, once: a second copy of the same mail is dropped, as any second write of a key is.
  const { rows: [row] } = await db.query<{ id: string }>(
    `insert into outbox_mail (kind, campaign_id, person_id, to_address, subject, body, dedupe_key, priority)
     select kind, campaign_id, person_id, to_address, subject, body, $2, priority from outbox_mail
      where id = $1 and (state = 'failed' or (state = 'expired' and detail = 'discarded'))
     on conflict (dedupe_key) do nothing
     returning id`,
    [id, dedupeKey],
  )
  return row?.id
}

const QUEUE_COLUMNS = 'm.id, m.kind, m.campaign_id, c.name as campaign_name, m.person_id, m.to_address, m.state, m.priority, m.attempts, m.detail, m.created_at, m.sent_at, m.next_attempt_at, m.expires_at'

interface QueueRow {
  id: string
  kind: string
  campaign_id: string | null
  campaign_name: string | null
  person_id: string | null
  to_address: string
  state: MailState
  priority: number
  attempts: number
  detail: string | null
  created_at: Date
  sent_at: Date | null
  next_attempt_at: Date | null
  expires_at: Date | null
}

function toQueueMail(row: QueueRow): QueueMail {
  return {
    id: row.id,
    kind: row.kind,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    personId: row.person_id,
    to: row.to_address,
    state: row.state,
    priority: Number(row.priority),
    attempts: Number(row.attempts),
    detail: row.detail,
    createdAt: row.created_at.toISOString(),
    sentAt: row.sent_at?.toISOString() ?? null,
    nextAttemptAt: row.next_attempt_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
  }
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

/** What the outbox holds for the mail status: the mails waiting, by priority, one in a session, the last claim, the latest time a waiting mail is due, and whether sending is paused. */
export interface QueueStatus {
  waiting: Record<MailPriority, number>
  sending: number
  lastClaimAt: Date | null
  /** A retry waits until its `next_attempt_at`, which may lie beyond the pace. */
  lastDueAt: Date | null
  paused: boolean
}

export async function queueStatus(db: Queryable): Promise<QueueStatus> {
  const { rows } = await db.query<{ priority: MailPriority, state: MailState, n: number }>(
    'select priority, state, count(*)::int as n from outbox_mail where state in (\'queued\', \'sending\') group by priority, state',
  )
  const { rows: [last] } = await db.query<{ claimed: Date | null, due: Date | null }>(
    'select (select max(claimed_at) from outbox_mail) as claimed, (select max(next_attempt_at) from outbox_mail where state = \'queued\') as due',
  )
  const { rows: [setting] } = await db.query<{ paused: boolean }>('select mail_paused as paused from school_setting')
  const waiting: Record<MailPriority, number> = { 1: 0, 2: 0, 3: 0 }
  let sending = 0
  for (const row of rows) {
    if (row.state === 'queued') waiting[row.priority] += row.n
    else sending += row.n
  }
  return { waiting, sending, lastClaimAt: last?.claimed ?? null, lastDueAt: last?.due ?? null, paused: setting?.paused === true }
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
