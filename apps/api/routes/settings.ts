// The school's settings and its classes:
//
//   GET  /api/settings/periods                  the period grid, for everyone who places or reads a session
//   PUT  /api/admin/settings/periods            replace it (administrators), audited
//   GET  /api/settings/language                 the school's language, for everyone signed in
//   PUT  /api/admin/settings/language           set it (administrators), audited
//   GET  /api/admin/classes                     the roster's classes with their class teachers (administrators, organizers)
//   GET  /api/admin/classes/teachers?q=         the roster's teachers, for assigning one (administrators, organizers)
//   PUT  /api/admin/classes/:className/teachers set the class teachers assigned in the app, audited

import { classDirectory, teacherDirectory } from '../services/class-teachers.ts'
import { languageSetting, periodSettings } from '../services/settings.ts'

import * as endpoints from '@school-allocation/api-contracts/settings-endpoints'
import { registerEndpoint } from '../lib/endpoint.ts'

import type { FastifyInstance } from 'fastify'
import { actorOf } from '../lib/actor.ts'
import type { Guards } from '../lib/auth.ts'
import { callerOf } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { replaceClassTeachers } from '../services/class-teachers.ts'
import { schoolWords } from '../lib/i18n.ts'
import { applyTeacherList, previewTeacherList } from '../services/teacher-list.ts'
import { teacherListTemplate } from '../services/teacher-list-template.ts'
import { replaceLanguage, replacePeriods } from '../services/settings.ts'

export interface SettingsRoutesOptions {
  db: Database
  guards: Guards
}

/** The JSON around a CSV of CSV_LIMITS.rows rows of long fields. */
const CSV_BODY_LIMIT = 12 * 1024 * 1024

export async function settingsRoutes(app: FastifyInstance, { db, guards }: SettingsRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }
  const admin = { preHandler: guards.requireRole('school_admin') }
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }

  registerEndpoint(app, endpoints.getSettingsPeriods, { ...signedIn }, async () => {
    return periodSettings(db)
  })

  registerEndpoint(app, endpoints.putAdminSettingsPeriods, { ...admin }, async (request) => {
    return { periods: await replacePeriods(db, request.body.periods, actorOf(callerOf(request))) }
  })

  registerEndpoint(app, endpoints.getSettingsLanguage, { ...signedIn }, async () => {
    return languageSetting(db)
  })

  registerEndpoint(app, endpoints.putAdminSettingsLanguage, { ...admin }, async (request) => {
    return replaceLanguage(db, request.body.locale, actorOf(callerOf(request)))
  })

  registerEndpoint(app, endpoints.getAdminClasses, { ...organizer }, async () => {
    return classDirectory(db)
  })

  registerEndpoint(app, endpoints.getAdminClassesTeachers, { ...organizer }, async (request) => {
    return teacherDirectory(db, request.query.q)
  })

  registerEndpoint(app, endpoints.putAdminClassesByClassNameTeachers, { ...organizer }, async (request) => {
    // Ids as PostgreSQL returns them, so a spelling in upper case is the same teacher.
    await replaceClassTeachers(db, request.params.className, request.body.teachers.map((id) => id.toLowerCase()), actorOf(callerOf(request)))
    return classDirectory(db)
  })

  // The teacher list: read and matched, shown as what it would change, applied in one go; the template is today's state.
  registerEndpoint(app, endpoints.postAdminClassesImportPreview, { ...organizer, bodyLimit: CSV_BODY_LIMIT }, async (request) => {
    return previewTeacherList(db, request.body.csv)
  })

  registerEndpoint(app, endpoints.postAdminClassesImport, { ...organizer, bodyLimit: CSV_BODY_LIMIT }, async (request) => {
    return applyTeacherList(db, request.body.csv, actorOf(callerOf(request)))
  })

  registerEndpoint(app, endpoints.getAdminClassesImportTemplate, { ...organizer, exposeHeadRoute: false }, async (_request, reply) => {
    const { t } = await schoolWords(db)
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${t.files.teacherListTemplate}"`)
      .send(await teacherListTemplate(db))
  })
}
