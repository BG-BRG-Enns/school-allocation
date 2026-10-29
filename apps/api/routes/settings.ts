// The school's settings and its classes:
//
//   GET  /api/settings/periods                  the period grid, for everyone who places or reads a session
//   PUT  /api/admin/settings/periods            replace it (administrators), audited
//   GET  /api/admin/classes                     the roster's classes with their class teachers (administrators, organizers)
//   PUT  /api/admin/classes/:className/teachers set the class teachers assigned in the app, audited

import type { FastifyInstance } from 'fastify'
import type { Static } from 'typebox'
import type { Guards } from '../lib/auth.ts'
import { listClasses, replaceClassTeachers } from '../lib/class-teachers.ts'
import type { Database } from '../lib/db.ts'
import { RosterConflict } from '../lib/roster.ts'
import { ClassParams, ClassTeachersBody, PeriodsBody, PeriodsInvalidResponse } from '../lib/schemas/catalogue.ts'
import { ErrorResponse } from '../lib/schemas/common.ts'
import { PeriodsInvalid, readPeriods, replacePeriods } from '../lib/settings.ts'
import { actorOf } from './admin-roster.ts'

export interface SettingsRoutesOptions {
  db: Database
  guards: Guards
}

export async function settingsRoutes(app: FastifyInstance, { db, guards }: SettingsRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }
  const admin = { preHandler: guards.requireRole('school_admin') }
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }

  app.get('/api/settings/periods', { ...signedIn, schema: { response: { '4xx': ErrorResponse } } }, async () => {
    return { periods: await readPeriods(db) }
  })

  app.put<{ Body: Static<typeof PeriodsBody> }>('/api/admin/settings/periods', {
    ...admin,
    schema: { body: PeriodsBody, response: { '422': PeriodsInvalidResponse, '4xx': ErrorResponse } },
  }, async (request, reply) => {
    try {
      return { periods: await replacePeriods(db, request.body.periods, actorOf(request)) }
    } catch (err) {
      if (err instanceof PeriodsInvalid) return reply.code(422).send({ error: 'period_grid_invalid', problems: err.problems })
      throw err
    }
  })

  app.get('/api/admin/classes', { ...organizer, schema: { response: { '4xx': ErrorResponse } } }, async () => {
    return { classes: await listClasses(db) }
  })

  app.put<{ Params: Static<typeof ClassParams>, Body: Static<typeof ClassTeachersBody> }>('/api/admin/classes/:className/teachers', {
    ...organizer,
    schema: { params: ClassParams, body: ClassTeachersBody, response: { '4xx': ErrorResponse } },
  }, async (request, reply) => {
    try {
      // Ids as PostgreSQL returns them, so a spelling in upper case is the same teacher.
      await replaceClassTeachers(db, request.params.className, request.body.teachers.map((id) => id.toLowerCase()), actorOf(request))
    } catch (err) {
      if (err instanceof RosterConflict) return reply.code(err.code === 'class_unknown' ? 404 : 422).send({ error: err.code })
      throw err
    }
    return { classes: await listClasses(db) }
  })
}
