// The Entra groups an administrator has labelled for the Graph import
// (docs/data-sources.md §3 A): student groups with their class and grade,
// teacher groups. The list is replaced as a whole and the change audited;
// the import reads it.

import { type Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import * as store from '../lib/dao/roster-groups.ts'
import { readGroups } from '../lib/dao/roster-groups.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { RosterGroup } from '../lib/models/roster-groups.ts'

/** Replaces the labelled groups with `groups`, audited. */
export async function replaceGroups(db: Database, groups: readonly RosterGroup[], actor: Actor): Promise<RosterGroup[]> {
  const seen = new Set<string>()
  for (const group of groups) {
    const id = group.groupId.toLowerCase()
    if (seen.has(id)) throw new ApplicationError('duplicate_group')
    seen.add(id)
    const complete = group.className !== undefined && group.grade !== undefined
    if (group.kind === 'student' ? !complete : (group.className !== undefined || group.grade !== undefined)) {
      throw new ApplicationError('group_label_incomplete')
    }
  }

  groups = groups.map((group) => ({ ...group, groupId: group.groupId.toLowerCase() }))
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    await store.deleteGroups(client)
    for (const group of groups) {
      await store.insertGroup(client, group, actor)
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
