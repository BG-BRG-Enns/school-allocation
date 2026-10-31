import type { Caller } from '../lib/actor.ts'
import { campaignCounts, readCampaign, rosterClasses, rosterTeachers } from '../lib/dao/campaigns.ts'
import { listCategories } from '../lib/dao/categories.ts'
import { campaignStudents } from '../lib/dao/choices.ts'
import type { Database } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import { type StudentChoiceState } from '../lib/models/choices.ts'
import { canSee, isOrganizer, isTeacher, mayPropose, maySeeDemand, withoutTeachers } from '../lib/policies.ts'
import { campaignDemand, requireCampaign } from './campaigns.ts'
import { choiceStates } from './choices.ts'
import { catalogueItems, listItems } from './items.ts'
import { classPlacements, type ClassPlacement } from './publication.ts'

/** A campaign outside the caller's scope is indistinguishable from a missing one. */
export async function visibleCampaign(db: Database, caller: Caller, id: string): Promise<Campaign> {
  const campaign = await readCampaign(db, id)
  if (!campaign || !canSee(caller, campaign.state)) throw new ApplicationError('not_found')
  return campaign
}

export async function campaignView(db: Database, campaign: Campaign, caller: Caller) {
  return {
    campaign,
    counts: isOrganizer(caller) ? await campaignCounts(db, campaign.id) : null,
    may: {
      propose: mayPropose(caller) && campaign.state === 'catalogue',
      organize: isOrganizer(caller),
      seeDemand: maySeeDemand(caller, campaign),
      /** The classes the caller may open the class page of: their own as class teacher. Organizers open any from the class list. */
      classTeacherOf: caller.classTeacherOf,
    },
  }
}

export async function demandView(db: Database, campaign: Campaign, caller: Caller) {
  if (!maySeeDemand(caller, campaign)) throw new ApplicationError('forbidden')
  return campaignDemand(db, campaign)
}

export async function classStatus(db: Database, campaign: Campaign, caller: Caller, className: string) {
  if (!isOrganizer(caller) && !caller.classTeacherOf.includes(className)) throw new ApplicationError('forbidden')
  // The campaign's roster: the one frozen at its close, else the one in force, as the lists and notices go by it.
  const students = await campaignStudents(db, campaign, className)
  if (students.length === 0) throw new ApplicationError('not_found')
  const items = (await listItems(db, campaign, caller, true))
    .filter((item) => item.fixedClasses.includes(className) && (item.state === 'approved' || item.state === 'proposed'))
    .map((item) => ({ id: item.id, title: item.title, state: item.state, sessions: item.sessions.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt })) }))
    // Once the window has opened, who has chosen; before, nobody has a list to speak of.
  const windowOpened = !['draft', 'catalogue', 'published'].includes(campaign.state)
  const states = windowOpened ? new Map((await choiceStates(db, campaign, className)).map((s) => [s.personId, s])) : new Map<string, StudentChoiceState>()
  // From publication on, where each student is, what they miss and what would fill the gap.
  const published = campaign.state === 'results' || campaign.state === 'archived'
  const placements = published ? await classPlacements(db, campaign, className) : new Map<string, ClassPlacement>()
  return {
    className,
    students: students.map((s) => ({
      ...s,
      choice: windowOpened ? (states.get(s.personId)?.state ?? 'none') : null,
      window: states.get(s.personId)?.window ?? null,
      placement: published ? (placements.get(s.personId) ?? { items: [], deficit: 0, offers: [], rules: [] }) : null,
    })),
    classActivities: items,
  }
}

export async function itemsView(db: Database, campaign: Campaign, caller: Caller) {
  const items = await listItems(db, campaign, caller, isOrganizer(caller))
  return { items: campaign.showTeachers || mayPropose(caller) ? items : items.map(withoutTeachers) }
}

export async function catalogueView(db: Database, campaign: Campaign, caller: Caller) {
  // Before publication the catalogue is the organizers' and the teachers' work in progress.
  if (campaign.state === 'draft' || campaign.state === 'catalogue') {
    if (!isOrganizer(caller) && !isTeacher(caller)) throw new ApplicationError('not_found')
  }
  const items = await catalogueItems(db, campaign.id)
  return { campaign, items: campaign.showTeachers || mayPropose(caller) ? items : items.map(withoutTeachers) }
}

export async function classOptions(db: Database, campaign: Campaign, caller: Caller) {
  if (!mayPropose(caller)) throw new ApplicationError('forbidden')
  return { classes: await rosterClasses(db) }
}

export async function teacherOptions(db: Database, campaign: Campaign, caller: Caller, q: string) {
  if (!mayPropose(caller)) throw new ApplicationError('forbidden')
  return { teachers: await rosterTeachers(db, q) }
}

/** The organizer/auditor export includes the complete approved catalogue, with the names of the categories it names. */
export async function catalogueExport(db: Database, id: string) {
  const campaign = await requireCampaign(db, id)
  return { campaign, items: await catalogueItems(db, campaign.id), categories: await listCategories(db) }
}
