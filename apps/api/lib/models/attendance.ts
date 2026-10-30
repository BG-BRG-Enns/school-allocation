import type { AttendanceStatus } from '@school-allocation/api-contracts/attendance'

export type { AttendanceRow, AttendanceStatus, ClassAttendanceResponse } from '@school-allocation/api-contracts/attendance'

/** What was recorded for one student in one session, the session as it is now. */
export interface AttendanceRecord {
  sessionId: string
  itemId: string
  position: number
  personId: string
  status: AttendanceStatus
  note: string
  recordedBy: { id: string, displayName: string }
  recordedAt: string
}

/** A session as the attendance needs it: whose item and which of its sessions, whose campaign. */
export interface SessionOfCampaign {
  id: string
  itemId: string
  position: number
  campaignId: string
  itemState: string
}
