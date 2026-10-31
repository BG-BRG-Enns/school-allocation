import { isSchoolYear, parseRosterCsv } from '@school-allocation/school-core'
import type { Actor } from '../lib/actor.ts'
import { readGroups } from '../lib/dao/roster-groups.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { listGroupMembers, membersToEntries, type GraphMember } from '../lib/graph.ts'
import { runJob } from '../lib/jobs.ts'
import { createBatch } from './roster.ts'

export async function importCsvRoster(db: Database, csv: string, schoolYear: string, triggeredBy: Actor) {
  if (!isSchoolYear(schoolYear)) throw new ApplicationError('invalid_school_year')
  const parsed = parseRosterCsv(csv)
  if (parsed.fileProblems.length > 0) {
    throw new ApplicationError('csv_invalid', parsed.fileProblems.map(describeFileProblem).join('; '))
  }
  return runJob(db, 'roster_import_csv', triggeredBy.id, () => createBatch(db, {
    source: 'csv', schoolYear, entries: parsed.entries, problems: parsed.problems, triggeredBy,
  }))
}

/** Graph I/O happens before the batch write; no database transaction spans network requests. */
export async function importGraphRoster(db: Database, baseUrl: string, accessToken: string, schoolYear: string, triggeredBy: Actor) {
  return runJob(db, 'roster_import_graph', triggeredBy.id, async () => {
    const groups = await readGroups(db)
    const members = new Map<string, GraphMember[]>()
    for (const group of groups) members.set(group.groupId, await listGroupMembers(baseUrl, accessToken, group.groupId))
    const { entries, warnings } = membersToEntries(groups, members)
    return createBatch(db, { source: 'graph:groups', schoolYear, entries, warnings, triggeredBy })
  })
}

function describeFileProblem(problem: { code: string, line?: number, column?: string }): string {
  const where = problem.line === undefined ? '' : ` (line ${problem.line})`
  const what = problem.column === undefined ? '' : ` (${problem.column})`
  return `${problem.code}${what}${where}`
}
