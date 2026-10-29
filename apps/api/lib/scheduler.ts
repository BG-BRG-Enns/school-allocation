// Timer lifecycle only. A tick delegates all persistence and decisions to the scheduling service.

import type { FastifyBaseLogger } from 'fastify'
import { tick } from '../services/scheduling.ts'
import type { Database } from './db.ts'
import type { WindowContext } from './models/window.ts'

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
