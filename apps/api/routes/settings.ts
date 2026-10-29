// The school's settings and its classes:
//
//   GET  /api/settings/periods                  the period grid, for everyone who places or reads a session
//   PUT  /api/admin/settings/periods            replace it (administrators), audited
//   GET  /api/admin/classes                     the roster's classes with their class teachers (administrators, organizers)
//   GET  /api/admin/classes/teachers?q=         the roster's teachers, for assigning one (administrators, organizers)
//   PUT  /api/admin/classes/:className/teachers set the class teachers assigned in the app, audited

import { ClassesResponse, PeriodsResponse, TeachersResponse } from '@school-allocation/api-contracts'
import { ClassParams, ClassTeachersBody, PeriodsBody, PeriodsInvalidResponse, TeachersQuery } from '@school-allocation/api-contracts/catalogue'
import { ErrorResponse } from '@school-allocation/api-contracts/common'
import type { FastifyInstance } from 'fastify'
import { type Static } from 'typebox'
import { actorOf } from '../lib/actor.ts'
import type { Guards } from '../lib/auth.ts'
import { callerOf } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { rosterTeachers } from '../services/campaigns.ts'
import { listClasses, replaceClassTeachers } from '../services/class-teachers.ts'
import { PeriodsInvalid, readPeriods, replacePeriods } from '../services/settings.ts'

export interface SettingsRoutesOptions {
  db: Database
  guards: Guards
}

export async function settingsRoutes(app: FastifyInstance, { db, guards }: SettingsRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }
  const admin = { preHandler: guards.requireRole('school_admin') }
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }

  app.get('/api/settings/periods', { ...signedIn, schema: { response: { '200': PeriodsResponse, '4xx': ErrorResponse } } }, async () => {
    return { periods: await readPeriods(db) }
  })

  app.put<{ Body: Static<typeof PeriodsBody> }>('/api/admin/settings/periods', {
    ...admin,
    schema: { body: PeriodsBody, response: { '200': PeriodsResponse, '422': PeriodsInvalidResponse, '4xx': ErrorResponse } },
  }, async (request, reply) => {
    try {
      return { periods: await replacePeriods(db, request.body.periods, actorOf(callerOf(request))) }
    } catch (err) {
      if (err instanceof PeriodsInvalid) return reply.code(422).send({ error: 'period_grid_invalid', problems: err.problems })
      throw err
    }
  })

  app.get('/api/admin/classes', { ...organizer, schema: { response: { '200': ClassesResponse, '4xx': ErrorResponse } } }, async () => {
    return { classes: await listClasses(db) }
  })

  app.get<{ Querystring: Static<typeof TeachersQuery> }>('/api/admin/classes/teachers', { ...organizer, schema: { querystring: TeachersQuery, response: { '200': TeachersResponse, '4xx': ErrorResponse } } }, async (request) => {
    return { teachers: await rosterTeachers(db, request.query.q?.trim() ?? '') }
  })

  app.put<{ Params: Static<typeof ClassParams>, Body: Static<typeof ClassTeachersBody> }>('/api/admin/classes/:className/teachers', {
    ...organizer,
    schema: { params: ClassParams, body: ClassTeachersBody, response: { '200': ClassesResponse, '4xx': ErrorResponse } },
  }, async (request, reply) => {
    try {
      // Ids as PostgreSQL returns them, so a spelling in upper case is the same teacher.
      await replaceClassTeachers(db, request.params.className, request.body.teachers.map((id) => id.toLowerCase()), actorOf(callerOf(request)))
    } catch (err) {
      if (err instanceof ApplicationError) return reply.code(err.code === 'class_unknown' ? 404 : 422).send({ error: err.code })
      throw err
    }
    return { classes: await listClasses(db) }
  })
}
