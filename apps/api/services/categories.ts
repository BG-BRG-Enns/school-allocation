// The school's categories (school-core rules.ts): one list for every
// registration, kept by organizers and administrators, audited in the
// school scope. A name is the category's only content, so a rename changes
// how every registration words it, which is the point of one list. A
// category an activity or a rule names stays: removing it would change
// what those count.

import { MAX_CATEGORIES } from '@school-allocation/school-core'
import { type Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import * as store from '../lib/dao/categories.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { SQLSTATE, sqlState } from '../lib/pg-errors.ts'
import type { Category, CategoryUsage } from '../lib/models/categories.ts'

/** The categories, for everyone signed in. */
export async function categories(db: Queryable): Promise<{ categories: Category[] }> {
  return { categories: await store.listCategories(db) }
}

/** The categories with what names each, for the page that keeps them. */
export async function categoryOverview(db: Queryable): Promise<{ categories: CategoryUsage[] }> {
  return { categories: await store.categoryUsage(db) }
}

/** Adds a category; its name is unique in any case, and the school has at most MAX_CATEGORIES. */
export async function createCategory(db: Database, rawName: string, actor: Actor): Promise<{ categories: CategoryUsage[] }> {
  const name = rawName.trim()
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    if (await store.countCategories(client) >= MAX_CATEGORIES) throw new ApplicationError('too_many_categories')
    const id = await store.insertCategory(client, name)
    if (id === undefined) throw new ApplicationError('category_exists')
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'category.created', metadata: { categoryId: id, name } })
  })
  return categoryOverview(db)
}

/** Renames a category, in use or not; the same name changes nothing and records nothing. */
export async function renameCategory(db: Database, rawId: string, rawName: string, actor: Actor): Promise<{ categories: CategoryUsage[] }> {
  const id = rawId.toLowerCase()
  const name = rawName.trim()
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const current = await store.lockCategory(client, id)
    if (!current) throw new ApplicationError('not_found')
    if (current.name === name) return
    if (await store.nameTaken(client, name, id)) throw new ApplicationError('category_exists')
    await store.renameCategory(client, id, name)
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'category.changed', metadata: { categoryId: id, from: current.name, to: name } })
  })
  return categoryOverview(db)
}

/**
 * Removes a category nothing names. An activity or a rule naming it holds
 * its row (knownCategories, and the foreign key), so a removal racing one
 * waits for it and is refused like one that came after.
 */
export async function removeCategory(db: Database, rawId: string, actor: Actor): Promise<{ categories: CategoryUsage[] }> {
  const id = rawId.toLowerCase()
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const current = await store.lockCategory(client, id)
    if (!current) throw new ApplicationError('not_found')
    if (await store.categoryInUse(client, id)) throw new ApplicationError('category_in_use')
    try {
      await store.deleteCategory(client, id)
    } catch (err) {
      // An activity or a rule that took it up after the check, its transaction committed while this one waited.
      if (sqlState(err) === SQLSTATE.foreignKeyViolation) throw new ApplicationError('category_in_use')
      throw err
    }
    await appendAudit(client, { scopeId: SCHOOL_SCOPE, actor: auditActor(actor), action: 'category.removed', metadata: { categoryId: id, name: current.name } })
  })
  return categoryOverview(db)
}

function auditActor(actor: Actor) {
  return { tid: actor.tid, oid: actor.oid, name: actor.name }
}
