// Jobs: work that runs for a while and must not be interrupted by the
// nightly update or a restart (an allocation run, a roster import, an
// outbox flush). A job is a row; while it is unfinished the health check
// says "busy" and deploy/not-busy.sh keeps podman-auto-update away. The
// process is the only one that runs jobs, so a job still unfinished when
// the process starts was interrupted: it is marked so, and its work is
// re-run from its frozen input, never resumed half-written.

import type { Queryable } from './db.ts'

export type JobOutcome = 'succeeded' | 'failed' | 'interrupted'

/** Whether a job is executing: what the health check reports as busy. */
export async function isBusy(db: Queryable): Promise<boolean> {
  const { rows } = await db.query<{ busy: boolean }>('select exists (select 1 from job where finished_at is null) as busy')
  return rows[0]?.busy === true
}

/** Starts a job; `startedBy` is the app_user who asked for it, or null for the scheduler. */
export async function startJob(db: Queryable, kind: string, startedBy: string | null): Promise<string> {
  const { rows } = await db.query<{ id: string }>('insert into job (kind, started_by) values ($1, $2) returning id', [kind, startedBy])
  const id = rows[0]?.id
  if (id === undefined) throw new Error('job insert returned no row')
  return id
}

export async function finishJob(db: Queryable, id: string, outcome: Exclude<JobOutcome, 'interrupted'>): Promise<void> {
  await db.query('update job set finished_at = now(), outcome = $2 where id = $1 and finished_at is null', [id, outcome])
}

/** Runs `fn` as a job: started before, finished after, failed when it throws. */
export async function runJob<T>(db: Queryable, kind: string, startedBy: string | null, fn: () => Promise<T>): Promise<T> {
  const id = await startJob(db, kind, startedBy)
  try {
    const result = await fn()
    await finishJob(db, id, 'succeeded')
    return result
  } catch (err) {
    await finishJob(db, id, 'failed').catch(() => {})
    throw err
  }
}

/** At startup: every job left unfinished by a previous process is marked interrupted. Returns how many. */
export async function interruptStaleJobs(db: Queryable): Promise<number> {
  const { rowCount } = await db.query('update job set finished_at = now(), outcome = \'interrupted\' where finished_at is null')
  return rowCount ?? 0
}
