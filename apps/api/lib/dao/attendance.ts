import type { Queryable } from '../db.ts'
import type { AttendanceRecord, AttendanceStatus, SessionOfCampaign } from '../models/attendance.ts'

/** The session with its item and campaign; undefined when there is none. */
export async function sessionOf(db: Queryable, sessionId: string): Promise<SessionOfCampaign | undefined> {
  const { rows: [row] } = await db.query<{ id: string, item_id: string, campaign_id: string, item_state: string }>(
    'select s.id, s.item_id, i.campaign_id, i.state as item_state from item_session s join catalog_item i on i.id = s.item_id where s.id = $1',
    [sessionId],
  )
  return row === undefined ? undefined : { id: row.id, itemId: row.item_id, campaignId: row.campaign_id, itemState: row.item_state }
}

/** Every record of a campaign's sessions. */
export async function listAttendance(db: Queryable, campaignId: string): Promise<AttendanceRecord[]> {
  const { rows } = await db.query<{ session_id: string, person_id: string, status: AttendanceStatus, note: string, recorded_by: string, recorded_by_name: string, recorded_at: Date }>(
    `select a.session_id, a.person_id, a.status, a.note, a.recorded_by, u.display_name as recorded_by_name, a.recorded_at
       from attendance a join item_session s on s.id = a.session_id join catalog_item i on i.id = s.item_id join app_user u on u.id = a.recorded_by
      where i.campaign_id = $1 order by a.session_id, a.person_id`,
    [campaignId],
  )
  return rows.map((row) => ({ sessionId: row.session_id, personId: row.person_id, status: row.status, note: row.note, recordedBy: { id: row.recorded_by, displayName: row.recorded_by_name }, recordedAt: row.recorded_at.toISOString() }))
}

/** Records or corrects one student's attendance in a session. */
export async function upsertAttendance(client: Queryable, sessionId: string, personId: string, status: AttendanceStatus, note: string, recordedBy: string): Promise<void> {
  await client.query(
    `insert into attendance (session_id, person_id, status, note, recorded_by) values ($1, $2, $3, $4, $5)
     on conflict (session_id, person_id) do update set status = excluded.status, note = excluded.note, recorded_by = excluded.recorded_by, recorded_at = now()`,
    [sessionId, personId, status, note, recordedBy],
  )
}
