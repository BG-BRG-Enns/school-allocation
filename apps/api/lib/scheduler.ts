// What the clock does (docs/domain-and-api.md §2): a campaign opens at
// opens_at, enters its grace week at closes_at and closes at late_until
// (or at closes_at without one); a reminder goes to every student without
// a complete list the configured days before a close. Evaluated by server
// time on a tick every minute and once at start, so a transition missed
// during a restart is applied then. Every transition is the same audited
// move an organizer would make, by the clock as actor.

import type { FastifyBaseLogger } from 'fastify'
import { dueTransition, readCampaign, transitionCampaign, type Campaign } from './campaigns.ts'
import { choiceStates } from './choices.ts'
import type { Database } from './db.ts'
import { RosterConflict, type Actor } from './roster.ts'
import { notifyStudents, type WindowContext } from './window.ts'

/** The clock as an audit actor: the nil identity, named for what it is. */
export const CLOCK_ACTOR: Actor = { id: '', tid: '00000000-0000-0000-0000-000000000000', oid: '00000000-0000-0000-0000-000000000000', name: 'Zeitsteuerung' }

const DAY_MS = 24 * 60 * 60 * 1000

export interface TickOutcome {
  transitions: number
  reminders: number
}

/** What is due at `now`: transitions and reminders. Each campaign under its own lock, one after another. */
export async function tick(db: Database, context: WindowContext, now = new Date(), log?: FastifyBaseLogger): Promise<TickOutcome> {
  const outcome: TickOutcome = { transitions: 0, reminders: 0 }
  const { rows } = await db.query<{ id: string }>('select id from campaign where state in (\'published\', \'open\', \'grace\') order by created_at')
  for (const row of rows) {
    try {
      // After downtime over several deadlines, every overdue transition in turn, so a campaign never lingers open.
      for (let step = 0; step < 4; step += 1) {
        if (await advance(db, context, row.id, now) === 0) break
        outcome.transitions += 1
      }
      outcome.reminders += await remind(db, context, row.id, now)
    } catch (err) {
      log?.error({ err, campaignId: row.id }, 'the scheduler failed on a campaign')
    }
  }
  return outcome
}

/** The transition a campaign is due for, applied; 1 when one was. */
async function advance(db: Database, context: WindowContext, id: string, now: Date): Promise<number> {
  const campaign = await readCampaign(db, id)
  if (!campaign) return 0
  const to = dueTransition(campaign, now)
  if (to === undefined) return 0
  try {
    // transitionCampaign reads the campaign again under its lock and checks
    // the deadline there: a transition an organizer made meanwhile is
    // refused, not repeated, and a window postponed meanwhile stays shut.
    await transitionCampaign(db, id, to, CLOCK_ACTOR, context, { byClock: true, now })
  } catch (err) {
    if (err instanceof RosterConflict && (err.code === 'not_due' || err.code === 'invalid_transition')) return 0
    throw err
  }
  return 1
}

/** The reminder a campaign is due for: the configured days before the close of its current window. */
async function remind(db: Database, context: WindowContext, id: string, now: Date): Promise<number> {
  const { rows: [c] } = await db.query<{ state: Campaign['state'], closes_at: Date | null, late_until: Date | null, reminder_days: number }>(
    'select state, closes_at, late_until, reminder_days from campaign where id = $1', [id],
  )
  if (!c || c.reminder_days <= 0) return 0
  const close = c.state === 'open' ? c.closes_at : c.state === 'grace' ? c.late_until : null
  if (close === null || now.getTime() >= close.getTime() || now.getTime() < close.getTime() - c.reminder_days * DAY_MS) return 0
  const kind = c.state === 'open' ? 'choice_reminder' : 'grace_reminder'
  return db.tx(async (client) => {
    const { rows: [row] } = await client.query<{ id: string }>('select id from campaign where id = $1 for update', [id])
    if (!row) return 0
    const { readCampaign } = await import('./campaigns.ts')
    const campaign = await readCampaign(client, id)
    if (!campaign || campaign.state !== c.state) return 0
    const incomplete = (await choiceStates(client, campaign)).filter((s) => s.state !== 'complete')
    // Once per window: the dedupe key carries the close the reminder is for.
    return notifyStudents(client, context, campaign, kind, incomplete, `reminder:${close.toISOString()}`)
  })
}

/** Ticks every `intervalMs` until stopped; `onWork` is told after a tick that queued mail or moved a campaign. */
export function startScheduler(db: Database, context: WindowContext, log: FastifyBaseLogger, intervalMs = 60_000, onWork?: () => void): { stop: () => void } {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      const outcome = await tick(db, context, new Date(), log)
      if (outcome.transitions > 0 || outcome.reminders > 0) {
        log.info(outcome, 'the scheduler moved campaigns or queued reminders')
        onWork?.()
      }
    } catch (err) {
      log.error({ err }, 'the scheduler tick failed')
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => void run(), intervalMs)
  timer.unref()
  void run()
  return { stop: () => clearInterval(timer) }
}
