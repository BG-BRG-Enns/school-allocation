import type { Queryable } from '../db.ts'
import type { Campaign } from '../models/campaigns.ts'

export async function scheduledCampaignIds(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>('select id from campaign where state in (\'published\', \'open\', \'grace\') order by created_at')
  return rows.map((row) => row.id)
}

export async function reminderWindow(db: Queryable, id: string) {
  const { rows: [row] } = await db.query<{ state: Campaign['state'], closes_at: Date | null, late_until: Date | null, reminder_days: number }>(
    'select state, closes_at, late_until, reminder_days from campaign where id = $1', [id],
  )
  return row === undefined ? undefined : { state: row.state, closesAt: row.closes_at, lateUntil: row.late_until, reminderDays: row.reminder_days }
}

export async function lockReminderCampaign(db: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await db.query('select id from campaign where id = $1 for update', [id])
  return (rowCount ?? 0) > 0
}
