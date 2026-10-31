// The school's categories:
//   GET    /api/categories             the list, for everyone signed in
//   GET    /api/admin/categories       the list with what names each (organizers, administrators)
//   POST   /api/admin/categories       { name }: add one, audited
//   PATCH  /api/admin/categories/:id   { name }: rename it, audited
//   DELETE /api/admin/categories/:id   remove one nothing names, audited
// Every change answers with the list as it is then.

import * as endpoints from '@school-allocation/api-contracts/categories-endpoints'
import type { FastifyInstance } from 'fastify'
import { actorOf } from '../lib/actor.ts'
import { callerOf, type Guards } from '../lib/auth.ts'
import type { Database } from '../lib/db.ts'
import { registerEndpoint } from '../lib/endpoint.ts'
import { categories, categoryOverview, createCategory, removeCategory, renameCategory } from '../services/categories.ts'

export interface CategoryRoutesOptions {
  db: Database
  guards: Guards
}

export async function categoryRoutes(app: FastifyInstance, { db, guards }: CategoryRoutesOptions): Promise<void> {
  const signedIn = { preHandler: guards.requireSession }
  const organizer = { preHandler: guards.requireRole('campaign_organizer', 'school_admin') }

  registerEndpoint(app, endpoints.getCategories, { ...signedIn }, async () => {
    return categories(db)
  })

  registerEndpoint(app, endpoints.getAdminCategories, { ...organizer }, async () => {
    return categoryOverview(db)
  })

  registerEndpoint(app, endpoints.postAdminCategories, { ...organizer }, async (request) => {
    return createCategory(db, request.body.name, actorOf(callerOf(request)))
  })

  registerEndpoint(app, endpoints.patchAdminCategoriesById, { ...organizer }, async (request) => {
    return renameCategory(db, request.params.id, request.body.name, actorOf(callerOf(request)))
  })

  registerEndpoint(app, endpoints.deleteAdminCategoriesById, { ...organizer }, async (request) => {
    return removeCategory(db, request.params.id, actorOf(callerOf(request)))
  })
}
