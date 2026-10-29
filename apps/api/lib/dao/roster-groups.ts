import type { PersonKind } from '@school-allocation/school-core'
import { type Actor } from '../actor.ts'
import type { Queryable } from '../db.ts'
import type { RosterGroup } from '../models/roster-groups.ts'

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

export function deleteGroups(db: Queryable) {
  return db.query('delete from roster_group')
}

export function insertGroup(db: Queryable, group: RosterGroup, actor: Actor) {
  return db.query(
    'insert into roster_group (group_id, label, kind, class_name, grade, updated_by) values ($1, $2, $3, $4, $5, $6)',
    [group.groupId, group.label, group.kind, group.className ?? null, group.grade ?? null, actor.id],
  )
}
