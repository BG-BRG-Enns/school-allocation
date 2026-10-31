// The one place the server reads the time. Everything else asks the
// database's clock (`db.now()` in TypeScript, `app_now()` in SQL), so a test
// that controls the clock moves all of it at once: the times the app
// compares, the times it writes and the defaults of the tables
// (migration 0012). ESLint refuses another time read in apps/api.

/** Where the time comes from. */
export interface Clock {
  now: () => Date
}

/** The system's clock, which the server runs on; no setting changes it. */
export const systemClock: Clock = { now: () => new Date() }
