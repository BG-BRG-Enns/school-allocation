import type { CampaignState } from '@school-allocation/school-core'
import type { Caller } from './actor.ts'
import type { Campaign } from './models/campaigns.ts'
import type { ChoiceView } from './models/choices.ts'
import type { Item } from './models/items.ts'

/** Whether the caller organizes: a school-wide organizer or an administrator. */
export function isOrganizer(caller: Pick<Caller, 'roles'>): boolean {
  return caller.roles.includes('campaign_organizer') || caller.roles.includes('school_admin')
}

/** Whether the caller is a teacher of the roster in force. */
export function isTeacher(caller: Pick<Caller, 'person'>): boolean {
  return caller.person?.kind === 'teacher'
}

/**
 * Whether the caller may see a campaign in `state`: organizers see all of
 * them, teachers also one taking proposals, everyone signed in what is
 * published, the archived campaign included (read-only: the result and
 * the attendance stay readable). A campaign that is not visible does not
 * exist for the caller.
 */
export function canSee(caller: Pick<Caller, 'roles' | 'person'>, state: CampaignState): boolean {
  if (isOrganizer(caller)) return true
  if (state === 'catalogue') return isTeacher(caller)
  return state !== 'draft'
}

/** Who may propose: teachers of the roster in force, and organizers on anyone's behalf. They always see the teachers of an item. */
export function mayPropose(caller: Caller): boolean {
  return isTeacher(caller) || isOrganizer(caller)
}

/** Who sees the demand (D-13): organizers always, teachers while proposals are taken. */
export function maySeeDemand(caller: Caller, campaign: Pick<Campaign, 'state'>): boolean {
  return isOrganizer(caller) || (isTeacher(caller) && campaign.state === 'catalogue')
}

/** The item as a student sees it when the campaign keeps the teachers out (D-13): no teachers, no proposer's name. */
export function withoutTeachers(item: Item): Item {
  return { ...item, teachers: [], proposedBy: { id: item.proposedBy.id, displayName: '' } }
}

/** Whether the caller is one of the item's people: its proposer or one of its teachers. */
export function isOwn(caller: Pick<Caller, 'id' | 'person'>, item: Pick<Item, 'proposedBy' | 'teachers'>): boolean {
  return item.proposedBy.id === caller.id || (caller.person !== null && item.teachers.some((teacher) => teacher.personId === caller.person?.id))
}

/** Apply the catalogue's teacher-visibility policy to a student's choices. */
export function redactChoices(campaign: Campaign, caller: Caller, view: ChoiceView): ChoiceView {
  if (campaign.showTeachers || mayPropose(caller)) return view
  return { ...view, fixed: view.fixed.map(withoutTeachers), groups: view.groups.map((group) => ({ ...group, items: group.items.map(withoutTeachers) })) }
}
