import type { AttendanceStatus } from '@school-allocation/api-contracts/attendance'

export type { AttendanceRow, AttendanceStatus, ClassAttendanceResponse } from '@school-allocation/api-contracts/attendance'

/** What was recorded for one student in one session. */
export interface AttendanceRecord {
  sessionId: string
  personId: string
  status: AttendanceStatus
  note: string
  recordedBy: { id: string, displayName: string }
  recordedAt: string
}

/** A session as the attendance needs it: whose item, whose campaign, when. */
export interface SessionOfCampaign {
  id: string
  itemId: string
  campaignId: string
  itemState: string
}
