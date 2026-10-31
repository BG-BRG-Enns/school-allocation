import type { Queryable } from '../db.ts'
import type { Category, CategoryUsage } from '../models/categories.ts'

/** The school's categories, by name. */
export async function listCategories(db: Queryable): Promise<Category[]> {
  const { rows } = await db.query<{ id: string, name: string }>('select id, name from category order by lower(name), id')
  return rows
}

/** The categories with how many activities and rules name each, in any registration. */
export async function categoryUsage(db: Queryable): Promise<CategoryUsage[]> {
  const { rows } = await db.query<{ id: string, name: string, items: string, rules: string }>(
    `select c.id, c.name,
            (select count(*) from item_category i where i.category_id = c.id)::text as items,
            (select count(*) from campaign_rule r where r.category_id = c.id)::text as rules
       from category c order by lower(c.name), c.id`,
  )
  return rows.map((row) => ({ id: row.id, name: row.name, items: Number(row.items), rules: Number(row.rules) }))
}

/** Adds a category; undefined when one of that name (in any case) exists. */
export async function insertCategory(db: Queryable, name: string): Promise<string | undefined> {
  const { rows: [row] } = await db.query<{ id: string }>('insert into category (name) values ($1) on conflict (lower(name)) do nothing returning id', [name])
  return row?.id
}

/** The category locked for a change; undefined when there is none. */
export async function lockCategory(db: Queryable, id: string): Promise<Category | undefined> {
  const { rows: [row] } = await db.query<{ id: string, name: string }>('select id, name from category where id = $1 for update', [id])
  return row
}

/** Whether another category has this name, in any case. */
export async function nameTaken(db: Queryable, name: string, except: string): Promise<boolean> {
  const { rows } = await db.query('select 1 from category where lower(name) = lower($1) and id <> $2', [name, except])
  return rows.length > 0
}

export async function renameCategory(db: Queryable, id: string, name: string): Promise<void> {
  await db.query('update category set name = $2, updated_at = app_now() where id = $1', [id, name])
}

/** Whether an activity or a rule names the category. */
export async function categoryInUse(db: Queryable, id: string): Promise<boolean> {
  const { rows } = await db.query('select 1 from item_category where category_id = $1 union all select 1 from campaign_rule where category_id = $1 limit 1', [id])
  return rows.length > 0
}

export async function deleteCategory(db: Queryable, id: string): Promise<void> {
  await db.query('delete from category where id = $1', [id])
}

/** The ids among `ids` that are categories of the school, held against removal until the caller's transaction ends. */
export async function knownCategories(db: Queryable, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { rows } = await db.query<{ id: string }>('select id::text from category where id = any($1::uuid[]) for key share', [ids])
  return new Set(rows.map((row) => row.id))
}

export async function countCategories(db: Queryable): Promise<number> {
  const { rows: [row] } = await db.query<{ n: string }>('select count(*)::text as n from category')
  return Number(row?.n ?? 0)
}
