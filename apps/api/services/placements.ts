// Direct placement and leaving a class activity (the project lead's
// decisions of 2026-11-06, amending D-24). The teachers of an activity and
// organizers place single students into it, from its first save and in
// every state but withdrawn: a direct placement, which takes one of the
// activity's places and beats a class placement. Placed "instead of the
// class activities of that time" (the default), the student is out of
// every class activity that overlaps it, as a whole; placed beside them,
// the student stays in the class activity. The teachers of a class
// activity see who of its classes is taken and may reclaim a student,
// which removes the other placement; they also keep its list of who does
// not take part, without reasons, and take students off it again. A later
// direct placement moves a student out of an earlier one it overlaps.
//
// Nothing here asks for a confirmation or a consent: teachers act
// responsibly, the pages say whom an act concerns (`tell`), and every act
// is in the campaign's audit chain. What holds of the rows for a student
// (school-core placements.ts) is worked out by whoever reads them: the
// choice, the run, the demand. Until the window closes; an organizer until
// a run is computed. After publication the result is changed, not these.

import type { OtherActivity, PlacementsResponse, StudentsResponse } from '@school-allocation/api-contracts'
import { acceptsChoices, acceptsPlacements, overlaps } from '@school-allocation/school-core'
import { actorOf, type Caller } from '../lib/actor.ts'
import { appendAudit, lockScope } from '../lib/audit.ts'
import { lockedCampaign, readCampaign } from '../lib/dao/campaigns.ts'
import { campaignStudent, campaignStudents, searchCampaignStudents } from '../lib/dao/choices.ts'
import { listCampaignItems, readItem } from '../lib/dao/items.ts'
import * as store from '../lib/dao/pre-assignments.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { CampaignStudent } from '../lib/models/choices.ts'
import type { Item } from '../lib/models/items.ts'
import { isOrganizer, isTeacher, mayPropose } from '../lib/policies.ts'
import { instantOf } from '../lib/time.ts'
import { classTeacherOf } from './class-teachers.ts'
import { reconcilePreAssignments } from './pre-assignments.ts'

function spansOf(item: Pick<Item, 'sessions'>): { startMs: number, endMs: number }[] {
  return item.sessions.map((s) => ({ startMs: instantOf(s.startsAt) ?? 0, endMs: instantOf(s.endsAt) ?? 0 }))
}

function itemsOverlap(a: Pick<Item, 'sessions'>, b: Pick<Item, 'sessions'>): boolean {
  return spansOf(a).some((x) => spansOf(b).some((y) => overlaps(x, y)))
}

const otherOf = (item: Item): OtherActivity => ({ itemId: item.id, title: item.title, lead: item.teachers.find((teacher) => teacher.lead)?.displayName ?? null })
const byClassAndName = (a: { className: string, displayName: string }, b: { className: string, displayName: string }) => a.className.localeCompare(b.className, 'de') || a.displayName.localeCompare(b.displayName, 'de')

/** Whether the caller places into the activity: one of its teachers in the roster in force, or an organizer. */
function mayPlaceInto(caller: Caller, item: Pick<Item, 'teachers'>): boolean {
  return isOrganizer(caller) || (isTeacher(caller) && caller.person !== null && item.teachers.some((teacher) => teacher.personId === caller.person?.id))
}

/** The classes of the activity the caller takes students out of: all of them for its teachers and organizers, a class teacher's own otherwise. */
async function classesToTakeOutOf(client: Queryable, campaign: Campaign, caller: Caller, item: Pick<Item, 'teachers' | 'fixedClasses'>): Promise<string[]> {
  if (mayPlaceInto(caller, item)) return [...item.fixedClasses]
  const own = await classTeacherOf(client, campaign, caller)
  return item.fixedClasses.filter((name) => own.includes(name))
}

/** The activities of a campaign that may still mean something to a placement: all but the withdrawn. */
async function liveItems(client: Queryable, campaignId: string): Promise<Item[]> {
  return (await listCampaignItems(client, campaignId)).filter((item) => item.state !== 'withdrawn')
}

/** The placements of an activity as the caller may see them, with what they may do about them now. */
async function viewOf(client: Queryable, campaign: Campaign, item: Item, caller: Caller, tell: readonly OtherActivity[] = []): Promise<PlacementsResponse> {
  const takeOut = await classesToTakeOutOf(client, campaign, caller, item)
  const reads = mayPlaceInto(caller, item) || takeOut.length > 0 || caller.roles.includes('read_only_auditor')
  if (!reads) throw new ApplicationError('forbidden')
  const students = new Map((await campaignStudents(client, campaign)).map((s) => [s.personId, s]))
  const rows = await store.listPlacements(client, campaign.id)
  const items = new Map((await liveItems(client, campaign.id)).map((i) => [i.id, i]))
  const classActivities = [...items.values()].filter((other) => other.fixedClasses.length > 0)
  const placed = rows
    .filter((row) => row.itemId === item.id && row.source === 'direct' && students.has(row.personId))
    .map((row) => {
      const student = students.get(row.personId) as CampaignStudent
      // What the box means for this student: the class activities of their class that overlap this one.
      const leaves = row.leavesClass ? classActivities.filter((other) => other.id !== item.id && other.fixedClasses.includes(student.className) && itemsOverlap(other, item)).map(otherOf) : []
      return { personId: student.personId, displayName: student.displayName, className: student.className, leavesClass: row.leavesClass, leaves }
    })
    .sort(byClassAndName)
  const absent = [...students.values()]
    .filter((student) => item.fixedClasses.includes(student.className))
    .flatMap((student) => {
      const own = rows.filter((row) => row.personId === student.personId)
      const elsewhere = own
        .filter((row) => row.source === 'direct' && row.leavesClass && row.itemId !== item.id && items.has(row.itemId) && itemsOverlap(items.get(row.itemId) as Item, item))
        .map((row) => otherOf(items.get(row.itemId) as Item))
      const listed = own.some((row) => row.itemId === item.id && row.source === 'class' && row.exempted)
      if (!listed && elsewhere.length === 0) return []
      return [{ personId: student.personId, displayName: student.displayName, className: student.className, by: listed ? 'list' as const : 'placed' as const, elsewhere }]
    })
    .sort(byClassAndName)
  const open = item.state !== 'withdrawn' && acceptsPlacements(campaign.state, isOrganizer(caller))
  return { mayPlace: open && mayPlaceInto(caller, item), mayTakeOut: open && takeOut.length > 0, classActivity: item.fixedClasses.length > 0, placed, absent, tell: [...tell] }
}

/**
 * The students a class activity as drafted would not get: those of its
 * classes placed directly, instead of their class activities, into another
 * activity that overlaps its sessions. For the form, before the activity is
 * saved; `exceptItemId` is the activity itself when it is stored.
 */
export async function takenFrom(db: Queryable, campaign: Campaign, shape: { fixedClasses: readonly string[], sessions: readonly { startMs: number, endMs: number }[] }, exceptItemId: string | null): Promise<PlacementsResponse['absent']> {
  if (shape.fixedClasses.length === 0) return []
  const students = new Map((await campaignStudents(db, campaign)).map((s) => [s.personId, s]))
  const items = new Map((await liveItems(db, campaign.id)).filter((i) => i.id !== exceptItemId).map((i) => [i.id, i]))
  const taken = new Map<string, OtherActivity[]>()
  for (const row of await store.listPlacements(db, campaign.id)) {
    const student = students.get(row.personId)
    const other = items.get(row.itemId)
    if (row.source !== 'direct' || !row.leavesClass || !student || !other || !shape.fixedClasses.includes(student.className)) continue
    if (!spansOf(other).some((x) => shape.sessions.some((y) => overlaps(x, y)))) continue
    taken.set(student.personId, [...(taken.get(student.personId) ?? []), otherOf(other)])
  }
  return [...taken].map(([personId, elsewhere]) => {
    const student = students.get(personId) as CampaignStudent
    return { personId, displayName: student.displayName, className: student.className, by: 'placed' as const, elsewhere }
  }).sort(byClassAndName)
}

/** The activity and its campaign as they are, for a read. */
async function found(db: Queryable, id: string): Promise<{ item: Item, campaign: Campaign }> {
  const item = await readItem(db, id)
  const campaign = item === undefined ? undefined : await readCampaign(db, item.campaignId)
  if (!item || !campaign) throw new ApplicationError('not_found')
  return { item, campaign }
}

/** The activity and its campaign under the campaign's lock, the activity read again after it, open for placements to the caller. */
async function lockedForChange(client: Queryable, id: string, caller: Caller): Promise<{ item: Item, campaign: Campaign }> {
  const seen = await readItem(client, id)
  if (!seen) throw new ApplicationError('not_found')
  await lockScope(client, seen.campaignId)
  const item = await readItem(client, id)
  const campaign = item === undefined ? undefined : await lockedCampaign(client, item.campaignId)
  if (!item || !campaign) throw new ApplicationError('not_found')
  if (item.state === 'withdrawn') throw new ApplicationError('item_state')
  if (!acceptsPlacements(campaign.state, isOrganizer(caller))) throw new ApplicationError('campaign_state')
  return { item, campaign }
}

/** The student of the campaign's roster, or `not_found`: a person who is none is nobody to place. */
async function studentOf(client: Queryable, campaign: Campaign, personId: string): Promise<CampaignStudent> {
  const student = await campaignStudent(client, campaign, personId)
  if (!student) throw new ApplicationError('not_found')
  return student
}

/** The students a teacher or an organizer finds by a part of the name or by the class, to place one. */
export async function findStudents(db: Database, campaign: Campaign, caller: Caller, q: string): Promise<StudentsResponse> {
  if (!mayPropose(caller)) throw new ApplicationError('forbidden')
  return { students: await searchCampaignStudents(db, campaign, q.trim()) }
}

/** An activity's placements, for its teachers, organizers, auditors and the class teachers of its classes. */
export async function placementsOf(db: Database, id: string, caller: Caller): Promise<PlacementsResponse> {
  const { item, campaign } = await found(db, id)
  return viewOf(db, campaign, item, caller)
}

/**
 * Places a student directly into an activity, or changes whether the
 * placement takes them out of their class activities of that time. Not a
 * student of a class the activity is fixed for (`class_member`: they are
 * in it, or on its list). A direct placement elsewhere that overlaps this
 * activity goes: the later claim stands, and the answer names those
 * activities so the page can say whom to tell.
 */
export async function placeStudent(db: Database, id: string, personId: string, leavesClass: boolean, caller: Caller): Promise<PlacementsResponse> {
  return db.tx(async (client) => {
    const { item, campaign } = await lockedForChange(client, id, caller)
    if (!mayPlaceInto(caller, item)) throw new ApplicationError('forbidden')
    const student = await studentOf(client, campaign, personId)
    if (item.fixedClasses.includes(student.className)) throw new ApplicationError('class_member')
    const items = new Map((await liveItems(client, campaign.id)).map((i) => [i.id, i]))
    const moved = (await store.listPlacements(client, campaign.id, student.personId))
      .filter((row) => row.source === 'direct' && row.itemId !== item.id && items.has(row.itemId) && itemsOverlap(items.get(row.itemId) as Item, item))
      .map((row) => row.itemId)
    if (moved.length > 0) await store.deleteDirectPlacements(client, campaign.id, moved, student.personId)
    // A class row of this very activity can only be one left behind: the student was taken out of it by hand, and their
    // class is no longer one of its classes. It goes, so the direct placement takes its key.
    if ((await store.lockPlacement(client, campaign.id, item.id, student.personId))?.source === 'class') {
      await store.liftExemption(client, campaign.id, item.id, student.personId)
      await store.deleteClassPlacement(client, campaign.id, item.id, student.personId)
    }
    if (!await store.upsertDirectPlacement(client, campaign.id, item.id, student.personId, leavesClass)) throw new Error('the direct placement was not written')
    await appendAudit(client, { scopeId: campaign.id, actor: actorOf(caller), action: 'preassignment.placed', metadata: { itemId: item.id, personId: student.personId, leavesClass, movedFrom: moved } })
    return viewOf(client, campaign, item, caller, moved.map((itemId) => otherOf(items.get(itemId) as Item)))
  })
}

/** Removes a student's direct placement from an activity; its own teachers and organizers. */
export async function removePlacement(db: Database, id: string, personId: string, caller: Caller): Promise<PlacementsResponse> {
  return db.tx(async (client) => {
    const { item, campaign } = await lockedForChange(client, id, caller)
    if (!mayPlaceInto(caller, item)) throw new ApplicationError('forbidden')
    if (await store.deleteDirectPlacements(client, campaign.id, [item.id], personId.toLowerCase()) === 0) throw new ApplicationError('not_found')
    await appendAudit(client, { scopeId: campaign.id, actor: actorOf(caller), action: 'preassignment.removed', metadata: { itemId: item.id, personId: personId.toLowerCase() } })
    return viewOf(client, campaign, item, caller)
  })
}

/** The student of one of the class activity's classes whom the caller may take out of it or bring back into it. */
async function classMember(client: Queryable, campaign: Campaign, item: Item, personId: string, caller: Caller): Promise<CampaignStudent> {
  const student = await studentOf(client, campaign, personId)
  if (!item.fixedClasses.includes(student.className)) throw new ApplicationError('not_class_member')
  if (!(await classesToTakeOutOf(client, campaign, caller, item)).includes(student.className)) throw new ApplicationError('forbidden')
  return student
}

/**
 * A teacher of a class activity reclaims a student of its classes: every
 * direct placement elsewhere that takes the student out of it is removed,
 * by someone who is no part of those activities. The answer names them:
 * their leads are whom to tell. Nothing keeps their teachers from placing
 * the student again; the two then talk.
 */
export async function reclaimStudent(db: Database, id: string, personId: string, caller: Caller): Promise<PlacementsResponse> {
  return db.tx(async (client) => {
    const { item, campaign } = await lockedForChange(client, id, caller)
    const student = await classMember(client, campaign, item, personId, caller)
    const items = new Map((await liveItems(client, campaign.id)).map((i) => [i.id, i]))
    const taken = (await store.listPlacements(client, campaign.id, student.personId))
      .filter((row) => row.source === 'direct' && row.leavesClass && row.itemId !== item.id && items.has(row.itemId) && itemsOverlap(items.get(row.itemId) as Item, item))
      .map((row) => row.itemId)
    if (taken.length === 0) throw new ApplicationError('not_found')
    await store.deleteDirectPlacements(client, campaign.id, taken, student.personId)
    await appendAudit(client, { scopeId: campaign.id, actor: actorOf(caller), action: 'preassignment.reclaimed', metadata: { itemId: item.id, personId: student.personId, from: taken } })
    return viewOf(client, campaign, item, caller, taken.map((itemId) => otherOf(items.get(itemId) as Item)))
  })
}

/**
 * A student of a class activity's class does not take part: on its
 * teachers' list, without a reason. Before the window opens there is no
 * class placement yet, so the exemption is written as a row of its own,
 * which the opening leaves as it is. Listing one who is listed changes
 * nothing.
 */
export async function takeOut(db: Database, id: string, personId: string, caller: Caller): Promise<PlacementsResponse> {
  return db.tx(async (client) => {
    const { item, campaign } = await lockedForChange(client, id, caller)
    const student = await classMember(client, campaign, item, personId, caller)
    const row = await store.lockPlacement(client, campaign.id, item.id, student.personId)
    if (row?.exempted !== true) {
      if (row === undefined) await store.insertExemptedPlacement(client, campaign.id, item.id, student.personId, caller.id)
      else await store.exemptPlacement(client, campaign.id, item.id, student.personId, caller.id)
      await appendAudit(client, { scopeId: campaign.id, actor: actorOf(caller), action: 'preassignment.exempted', metadata: { itemId: item.id, personId: student.personId } })
    }
    return viewOf(client, campaign, item, caller)
  })
}

/**
 * A student comes along after all: off the list. While the window takes
 * choices the class placements follow the catalogue again (the student is
 * placed if the activity is approved and their class still fixed for it);
 * before it, no row is left behind.
 */
export async function bringBack(db: Database, id: string, personId: string, caller: Caller): Promise<PlacementsResponse> {
  return db.tx(async (client) => {
    const { item, campaign } = await lockedForChange(client, id, caller)
    const student = await classMember(client, campaign, item, personId, caller)
    const row = await store.lockPlacement(client, campaign.id, item.id, student.personId)
    if (row?.exempted !== true) throw new ApplicationError('not_found')
    await store.liftExemption(client, campaign.id, item.id, student.personId)
    if (acceptsChoices(campaign.state) || campaign.state === 'closed') await reconcilePreAssignments(client, campaign.id, item.id)
    else await store.deleteClassPlacement(client, campaign.id, item.id, student.personId)
    await appendAudit(client, { scopeId: campaign.id, actor: actorOf(caller), action: 'preassignment.exemption-lifted', metadata: { itemId: item.id, personId: student.personId } })
    return viewOf(client, campaign, item, caller)
  })
}
