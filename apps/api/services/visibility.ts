// Who sees a campaign: by role and state (lib/policies.ts canSee), and a
// student only when a class of theirs takes part, judged against the
// roster the campaign goes by (the batch frozen at its close, else the one
// in force) through the shared roster selector, never against the class the
// caller has today: a class changes with the next school year, and a
// student who moved up must still read last year's result.

import type { Caller } from '../lib/actor.ts'
import { campaignStudent, memberCampaignIds } from '../lib/dao/choices.ts'
import type { Queryable } from '../lib/db.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import { canSee, isOrganizer, isStudent } from '../lib/policies.ts'

/** Whether the membership decides for the caller: a student without a privileged role (a role is granted in the app, never narrowed by the roster's kind). */
function byMembership(caller: Pick<Caller, 'roles' | 'person'>): caller is Caller & { person: NonNullable<Caller['person']> } {
  return isStudent(caller) && caller.person !== null && !isOrganizer(caller)
}

/** Whether the caller sees the campaign. */
export async function mayView(db: Queryable, caller: Caller, campaign: Pick<Campaign, 'id' | 'state' | 'rosterBatchId'>): Promise<boolean> {
  if (!canSee(caller, campaign.state)) return false
  if (!byMembership(caller)) return true
  return (await campaignStudent(db, campaign, caller.person.id)) !== undefined
}

/** The campaigns among `campaigns` the caller sees; for a student, their membership in one query. */
export async function visibleAmong<C extends Pick<Campaign, 'id' | 'state'>>(db: Queryable, caller: Pick<Caller, 'roles' | 'person'>, campaigns: readonly C[]): Promise<C[]> {
  const byState = campaigns.filter((campaign) => canSee(caller, campaign.state))
  if (!byMembership(caller) || byState.length === 0) return byState
  const member = new Set(await memberCampaignIds(db, caller.person.id, byState.map((campaign) => campaign.id)))
  return byState.filter((campaign) => member.has(campaign.id))
}
