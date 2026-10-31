// Attendance: a class's sessions per project day with what was recorded, the recording itself, the workbooks.

import * as endpoints from '@school-allocation/api-contracts/attendance-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { t } from '../lib/i18n.ts'
import { attendanceWorkbook } from '../lib/xlsx.ts'
import { attendanceRows, classAttendance, recordAttendance } from '../services/attendance.ts'
import { runCampaign } from '../services/allocation.ts'
import { visibleCampaign } from '../services/catalogue.ts'

export interface AttendanceRoutesOptions {
  db: Database
  guards: Guards
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function attendanceRoutes(app: FastifyInstance, { db, guards }: AttendanceRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }
  const auditor = { preHandler: guards.requireRole('campaign_organizer', 'school_admin', 'read_only_auditor') }

  registerEndpoint(app, endpoints.getCampaignsByIdClassesByClassNameAttendance, { ...signedIn }, async (request) => {
    return classAttendance(db, await visibleCampaign(db, callerOf(request), request.params.id), callerOf(request), request.params.className)
  })

  registerEndpoint(app, endpoints.getCampaignsByIdClassesByClassNameAttendanceXlsx, { ...signedIn, exposeHeadRoute: false }, async (request, reply) => {
    const campaign = await visibleCampaign(db, callerOf(request), request.params.id)
    const bytes = await attendanceWorkbook(await attendanceRows(db, campaign, callerOf(request), request.params.className))
    return reply.header('content-type', XLSX).header('content-disposition', `attachment; filename="${t.files.classAttendance(request.params.className, campaign.schoolYear.replace('/', '-'))}"`).send(bytes)
  })

  registerEndpoint(app, endpoints.putSessionsByIdAttendance, { ...signedIn }, async (request) => {
    return recordAttendance(db, callerOf(request), request.params.id, request.body.entries)
  })

  registerEndpoint(app, endpoints.getAdminCampaignsByIdExportAttendanceXlsx, { ...auditor, exposeHeadRoute: false }, async (request, reply) => {
    const campaign = await runCampaign(db, request.params.id)
    const bytes = await attendanceWorkbook(await attendanceRows(db, campaign, callerOf(request)))
    return reply.header('content-type', XLSX).header('content-disposition', `attachment; filename="${t.files.attendance(campaign.schoolYear.replace('/', '-'))}"`).send(bytes)
  })
}
