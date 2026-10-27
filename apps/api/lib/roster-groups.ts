// The Entra groups an administrator has labelled for the Graph import
// (docs/data-sources.md §3 A): student groups with their class and grade,
// teacher groups. The list is replaced as a whole and the change audited;
// the import reads it.

import type { PersonKind } from '@school-allocation/school-core'
import { appendAudit, lockScope, SCHOOL_SCOPE } from './audit.ts'
import type { Database, Queryable } from './db.ts'
import type { Actor } from './roster.ts'

export interface RosterGroup {
  /** The Entra group's object id. */
  groupId: string
  /** What the administrator calls it, for the list. */
  label: string
  kind: PersonKind
  /** Student groups only. */
  className?: string
  grade?: number
}

export async function readGroups(db: Queryable): Promise<RosterGroup[]> {
  const { rows } = await db.query<{ group_id: string, label: string, kind: PersonKind, class_name: string | null, grade: number | null }>(
    'select group_id::text as group_id, label, kind, class_name, grade from roster_group order by kind, class_name nulls last, label',
  )
  return rows.map((row) => {
    const group: RosterGroup = { groupId: row.group_id, label: row.label, kind: row.kind }
    if (row.class_name !== null) group.className = row.class_name
    if (row.grade !== null) group.grade = row.grade
    return group
  })
}

/** Replaces the labelled groups with `groups`, audited. */
export async function replaceGroups(db: Database, groups: readonly RosterGroup[], actor: Actor): Promise<RosterGroup[]> {
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    await client.query('delete from roster_group')
    for (const group of groups) {
      await client.query(
        'insert into roster_group (group_id, label, kind, class_name, grade, updated_by) values ($1, $2, $3, $4, $5, $6)',
        [group.groupId, group.label, group.kind, group.className ?? null, group.grade ?? null, actor.id],
      )
    }
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'roster.groups-changed',
      metadata: { groups: groups.length, studentGroups: groups.filter((g) => g.kind === 'student').length },
    })
  })
  return readGroups(db)
}
