// Application work due on a clock tick; timers and shutdown live in lib/scheduler.ts.

import type { Actor } from '../lib/actor.ts'
import { readCampaign } from '../lib/dao/campaigns.ts'
import { lockReminderCampaign, reminderWindow, scheduledCampaignIds } from '../lib/dao/scheduling.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { WindowContext } from '../lib/models/window.ts'
import { dueTransition, transitionCampaign } from './campaigns.ts'
import { choiceStates } from './choices.ts'
import { notifyStudents } from './window.ts'

export interface SchedulingLog {
  error(fields: { err: unknown, campaignId: string }, message: string): void
}

/** The clock as an audit actor: the nil identity, named for what it is. */
export const CLOCK_ACTOR: Actor = { id: '', tid: '00000000-0000-0000-0000-000000000000', oid: '00000000-0000-0000-0000-000000000000', name: 'Zeitsteuerung' }

const DAY_MS = 24 * 60 * 60 * 1000

export interface TickOutcome {
  transitions: number
  reminders: number
}

/** What is due at `now`: transitions and reminders. Each campaign under its own lock, one after another. */
export async function tick(db: Database, context: WindowContext, now = db.now(), log?: SchedulingLog): Promise<TickOutcome> {
  const outcome: TickOutcome = { transitions: 0, reminders: 0 }
  const ids = await scheduledCampaignIds(db)
  for (const id of ids) {
    try {
      // After downtime over several deadlines, every overdue transition in turn, so a campaign never lingers open.
      for (let step = 0; step < 4; step += 1) {
        if (await advance(db, context, id, now) === 0) break
        outcome.transitions += 1
      }
      outcome.reminders += await remind(db, context, id, now)
    } catch (err) {
      log?.error({ err, campaignId: id }, 'the scheduler failed on a campaign')
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
    if (err instanceof ApplicationError && (err.code === 'not_due' || err.code === 'invalid_transition' || err.code === 'not_found')) return 0
    throw err
  }
  return 1
}

/** The reminder a campaign is due for: the configured days before the close of its current window. */
async function remind(db: Database, context: WindowContext, id: string, now: Date): Promise<number> {
  const c = await reminderWindow(db, id)
  if (!c || c.reminderDays <= 0) return 0
  const close = c.state === 'open' ? c.closesAt : c.state === 'grace' ? c.lateUntil : null
  if (close === null || now.getTime() >= close.getTime() || now.getTime() < close.getTime() - c.reminderDays * DAY_MS) return 0
  const kind = c.state === 'open' ? 'choice_reminder' : 'grace_reminder'
  return db.tx(async (client) => {
    if (!await lockReminderCampaign(client, id)) return 0
    const campaign = await readCampaign(client, id)
    if (!campaign || campaign.state !== c.state) return 0
    const incomplete = (await choiceStates(client, campaign)).filter((s) => s.state !== 'complete')
    // Once per window: the dedupe key carries the close the reminder is for.
    return notifyStudents(client, context, campaign, kind, incomplete, `reminder:${close.toISOString()}`)
  })
}
