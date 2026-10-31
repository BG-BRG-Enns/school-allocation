// A clock a test controls, for the database (lib/db.ts), the stand-in for
// Entra ID and the browser journeys' harness. It stands still where it was
// set and moves one millisecond per read: two rows written one after the
// other still have an order, and a run reads the same times on every run,
// so whatever shows minutes shows the same ones.

import type { Clock } from '../../lib/clock.ts'

export class ControlledClock implements Clock {
  private ms: number

  constructor(at: Date) {
    this.ms = at.getTime()
  }

  now(): Date {
    const now = new Date(this.ms)
    this.ms += 1
    return now
  }

  /** Where the clock stands, without moving it. */
  peek(): Date {
    return new Date(this.ms)
  }

  set(at: Date): void {
    if (Number.isNaN(at.getTime())) throw new Error('not a time')
    this.ms = at.getTime()
  }

  advance(ms: number): void {
    this.ms += ms
  }
}
