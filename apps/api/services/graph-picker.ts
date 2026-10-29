import { isSchoolYear } from '@school-allocation/school-core'
import { readGroups } from '../lib/dao/roster-groups.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { searchClassGroups, searchGroups } from '../lib/graph.ts'

/** Refuse a refresh before the browser starts the authorization journey. */
export async function prepareGraphImport(db: Database, schoolYear: string): Promise<void> {
  if (!isSchoolYear(schoolYear)) throw new ApplicationError('invalid_school_year')
  if ((await readGroups(db)).length === 0) throw new ApplicationError('no_groups')
}

export async function findGraphGroups(baseUrl: string, accessToken: string, query: { q?: string, classes?: 'true' }) {
  const q = query.q?.trim() ?? ''
  if (query.classes !== 'true' && q === '') throw new ApplicationError('validation_failed')
  return { groups: query.classes === 'true' ? await searchClassGroups(baseUrl, accessToken) : await searchGroups(baseUrl, accessToken, q) }
}
