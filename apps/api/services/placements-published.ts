// Direct placement and leaving a class activity once the result is
// published (the project lead's decisions of 2026-11-06): the same acts on
// the same pages as before the window closes (services/placements.ts), now
// as changes to the published run. A teacher of an activity places a
// student into it or takes them off it; the teachers of a class activity,
// the class teacher and organizers take a student of its classes out of it
// (who does not come after all) and bring them back, which is also how a
// student placed elsewhere is reclaimed. A direct placement still beats a
// class placement: instead of the class activities it overlaps (the
// default) the student leaves them in the same change; beside them, the
// student stays. Whatever else of the student's the activity overlaps is
// left too: the later claim stands, and the answer names what was left, so
// the page can say whom to tell.
//
// Every act is one change of the run (services/assignment-changes.ts
// teacherChange): rows superseded and added, the student told, audited. No
// reason is asked. This module also decides, for every placement endpoint,
// which of the two times it is: the routes call it alone.

import type { OtherActivity, PlacementsResponse } from '@school-allocation/api-contracts'
import type { Assignment, Move } from '@school-allocation/school-core'
import type { Caller } from '../lib/actor.ts'
import { lockScope } from '../lib/audit.ts'
import { readCampaign } from '../lib/dao/campaigns.ts'
import { campaignStudents } from '../lib/dao/choices.ts'
import { listCampaignItems, readItem } from '../lib/dao/items.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { CampaignStudent } from '../lib/models/choices.ts'
import type { Item } from '../lib/models/items.ts'
import type { WindowContext } from '../lib/models/window.ts'
import { publishedRows, teacherChange, type TeacherAct } from './assignment-changes.ts'
import * as before from './placements.ts'
import { byClassAndName, classesToTakeOutOf, classMember, itemsOverlap, mayPlaceInto, otherOf, studentOf } from './placements.ts'

/** Whether the campaign's placements are its published run's: from publication on. */
function published(campaign: Pick<Campaign, 'state'>): boolean {
  return campaign.state === 'results' || campaign.state === 'archived'
}

/** The activity and its campaign as they are. */
async function found(db: Queryable, id: string): Promise<{ item: Item, campaign: Campaign }> {
  const item = await readItem(db, id)
  const campaign = item === undefined ? undefined : await readCampaign(db, item.campaignId)
  if (!item || !campaign) throw new ApplicationError('not_found')
  return { item, campaign }
}

/** What the published run says of a campaign: the rows as they stand, the students, the activities that take place. */
interface Published {
  rows: Assignment[]
  students: Map<string, CampaignStudent>
  /** The activities that take place: approved, and not cancelled by the run. */
  items: Map<string, Item>
}

async function readPublished(client: Queryable, campaign: Campaign): Promise<Published> {
  const run = await publishedRows(client, campaign.id)
  if (!run) throw new ApplicationError('not_published')
  return {
    rows: run.rows,
    students: new Map((await campaignStudents(client, campaign)).map((s) => [s.personId, s])),
    items: new Map((await listCampaignItems(client, campaign.id)).filter((item) => !run.unavailable.has(item.id)).map((item) => [item.id, item])),
  }
}

/** The class activities of a student's class that overlap an activity and take place. */
function classActivitiesBeside(state: Published, student: CampaignStudent, item: Item): Item[] {
  return [...state.items.values()].filter((other) => other.id !== item.id && other.fixedClasses.includes(student.className) && itemsOverlap(other, item))
}

/** The student's rows that overlap an activity, other than the one in it. */
function rowsOverlapping(state: Published, personId: string, item: Item): Assignment[] {
  return state.rows.filter((row) => row.personId === personId && row.itemId !== item.id && state.items.has(row.itemId) && itemsOverlap(state.items.get(row.itemId) as Item, item))
}

/** The placements of an activity as the published run has them, with what the caller may do about them now. */
async function viewOf(client: Queryable, campaign: Campaign, item: Item, caller: Caller, tell: readonly OtherActivity[] = []): Promise<PlacementsResponse> {
  const takeOut = await classesToTakeOutOf(client, campaign, caller, item)
  if (!mayPlaceInto(caller, item) && takeOut.length === 0 && !caller.roles.includes('read_only_auditor')) throw new ApplicationError('forbidden')
  const state = await readPublished(client, campaign)
  const inIt = (personId: string, itemId: string) => state.rows.some((row) => row.personId === personId && row.itemId === itemId)
  // Placed directly: in it by a teacher's hand, before publication (a fixed row of someone whose class it is not) or after.
  const placed = state.rows
    .filter((row) => row.itemId === item.id && (row.source === 'fixed' || row.source === 'manual') && state.students.has(row.personId) && !item.fixedClasses.includes((state.students.get(row.personId) as CampaignStudent).className))
    .map((row) => {
      const student = state.students.get(row.personId) as CampaignStudent
      const left = classActivitiesBeside(state, student, item).filter((other) => !inIt(student.personId, other.id))
      const beside = classActivitiesBeside(state, student, item).some((other) => inIt(student.personId, other.id))
      return { personId: student.personId, displayName: student.displayName, className: student.className, leavesClass: !beside, leaves: left.map(otherOf) }
    })
    .sort(byClassAndName)
  const absent = [...state.students.values()]
    .filter((student) => item.fixedClasses.includes(student.className) && !inIt(student.personId, item.id))
    .map((student) => {
      // Where they are instead, whatever brought them there; "placed" when a hand did (a direct placement before or after publication).
      const rows = rowsOverlapping(state, student.personId, item)
      const elsewhere = rows.map((row) => otherOf(state.items.get(row.itemId) as Item))
      const byHand = rows.some((row) => row.source === 'manual' || row.source === 'fixed')
      return { personId: student.personId, displayName: student.displayName, className: student.className, by: byHand ? 'placed' as const : 'list' as const, elsewhere }
    })
    .sort(byClassAndName)
  const open = campaign.state === 'results' && state.items.has(item.id)
  return { mayPlace: open && mayPlaceInto(caller, item), mayTakeOut: open && takeOut.length > 0, classActivity: item.fixedClasses.length > 0, placed, absent, tell: [...tell] }
}

/** One change of the published run by a teacher, and the placements after it. Under the campaign's lock from the start, so the rows the move was shaped from are the rows it is checked against. */
async function change(db: Database, context: WindowContext, id: string, caller: Caller, shape: (client: Queryable, item: Item, campaign: Campaign, state: Published) => Promise<{ move: Move, act: TeacherAct, besideClass: boolean }[]>): Promise<PlacementsResponse> {
  return db.tx(async (client) => {
    const seen = await found(client, id)
    await lockScope(client, seen.campaign.id)
    const { item, campaign } = await found(client, id)
    if (campaign.state !== 'results') throw new ApplicationError('campaign_state')
    const state = await readPublished(client, campaign)
    if (!state.items.has(item.id)) throw new ApplicationError('item_state')
    const left: Item[] = []
    for (const { move, act, besideClass } of await shape(client, item, campaign, state)) left.push(...await teacherChange(client, context, campaign.id, caller, move, act, besideClass))
    return viewOf(client, campaign, item, caller, left.filter((other) => other.id !== item.id).map(otherOf))
  })
}

/**
 * Places a student into the activity, or changes whether an existing
 * placement stands instead of the student's class activities or beside
 * them. Placing leaves whatever of the student's overlaps the activity:
 * the class activities when it stands instead of them, and anything else
 * in every case. Changing the say of a placement takes the student out of
 * the class activities it overlaps, or brings them back into them.
 */
async function placePublished(db: Database, context: WindowContext, id: string, personId: string, leavesClass: boolean, caller: Caller): Promise<PlacementsResponse> {
  return change(db, context, id, caller, async (client, item, campaign, state) => {
    if (!mayPlaceInto(caller, item)) throw new ApplicationError('forbidden')
    const student = await studentOf(client, campaign, personId)
    if (item.fixedClasses.includes(student.className)) throw new ApplicationError('class_member')
    const classItems = new Set(classActivitiesBeside(state, student, item).map((other) => other.id))
    const overlapping = rowsOverlapping(state, student.personId, item)
    const own = state.rows.find((row) => row.personId === student.personId && row.itemId === item.id)
    // Not placed into it by a hand: in it by a wish, a fallback, a swap or the organizer's hand, or not at all. The placement supersedes
    // such a row with a fixed one, which the student cannot swap out of, and leaves what overlaps.
    if (own === undefined || own.source !== 'fixed') {
      const leaves = [...overlapping.filter((row) => leavesClass || !classItems.has(row.itemId)).map((row) => row.itemId), ...(own === undefined ? [] : [item.id])]
      return [{ move: { personId: student.personId, toItemId: item.id, leaves }, act: 'placed', besideClass: !leavesClass }]
    }
    // Placed already: the box alone. Out of the class activities it overlaps, or back into those the student is not in, which leaves
    // whatever else of theirs those overlap (what the run gave them for the time they were out), this placement excepted. Two class
    // activities brought back in one go may overlap the same row: it is left once, by the first.
    const inClass = overlapping.filter((row) => classItems.has(row.itemId)).map((row) => row.itemId)
    if (leavesClass) return inClass.length === 0 ? [] : [{ move: { personId: student.personId, toItemId: null, leaves: inClass }, act: 'takenOut', besideClass: false }]
    const gone = new Set<string>()
    return [...classItems].filter((itemId) => !inClass.includes(itemId)).map((itemId) => {
      const leaves = rowsOverlapping(state, student.personId, state.items.get(itemId) as Item).filter((row) => row.itemId !== item.id && !classItems.has(row.itemId) && !gone.has(row.itemId)).map((row) => row.itemId)
      for (const left of leaves) gone.add(left)
      return { move: { personId: student.personId, toItemId: itemId, leaves }, act: 'returned' as const, besideClass: true }
    })
  })
}

/** Takes a student off the activity they were placed into; its own teachers and organizers. */
async function removePublished(db: Database, context: WindowContext, id: string, personId: string, caller: Caller): Promise<PlacementsResponse> {
  return change(db, context, id, caller, async (client, item, campaign, state) => {
    if (!mayPlaceInto(caller, item)) throw new ApplicationError('forbidden')
    const student = await studentOf(client, campaign, personId)
    if (!state.rows.some((row) => row.personId === student.personId && row.itemId === item.id)) throw new ApplicationError('not_found')
    return [{ move: { personId: student.personId, toItemId: null, leaves: [item.id] }, act: 'removed', besideClass: false }]
  })
}

/** A student of the class activity's classes does not take part after all: out of it, without a reason. One who is out already stays out. */
async function takeOutPublished(db: Database, context: WindowContext, id: string, personId: string, caller: Caller): Promise<PlacementsResponse> {
  return change(db, context, id, caller, async (client, item, campaign, state) => {
    const student = await classMember(client, campaign, item, personId, caller)
    if (!state.rows.some((row) => row.personId === student.personId && row.itemId === item.id)) return []
    return [{ move: { personId: student.personId, toItemId: null, leaves: [item.id] }, act: 'takenOut', besideClass: false }]
  })
}

/** A student of the class activity's classes is in it again: brought back, or reclaimed from where they were placed instead, which they leave. */
async function returnPublished(db: Database, context: WindowContext, id: string, personId: string, caller: Caller): Promise<PlacementsResponse> {
  return change(db, context, id, caller, async (client, item, campaign, state) => {
    const student = await classMember(client, campaign, item, personId, caller)
    if (state.rows.some((row) => row.personId === student.personId && row.itemId === item.id)) throw new ApplicationError('not_found')
    return [{ move: { personId: student.personId, toItemId: item.id, leaves: rowsOverlapping(state, student.personId, item).map((row) => row.itemId) }, act: 'returned', besideClass: false }]
  })
}

/** Which of the two times it is for the activity. */
async function isPublished(db: Database, id: string): Promise<boolean> {
  return published((await found(db, id)).campaign)
}

/** An activity's placements: before publication the placements as they are kept, from it on the published run's. */
export async function placementsOf(db: Database, id: string, caller: Caller): Promise<PlacementsResponse> {
  const { item, campaign } = await found(db, id)
  return published(campaign) ? viewOf(db, campaign, item, caller) : before.placementsOf(db, id, caller)
}

export async function placeStudent(db: Database, context: WindowContext, id: string, personId: string, leavesClass: boolean, caller: Caller): Promise<PlacementsResponse> {
  return await isPublished(db, id) ? placePublished(db, context, id, personId, leavesClass, caller) : before.placeStudent(db, id, personId, leavesClass, caller)
}

export async function removePlacement(db: Database, context: WindowContext, id: string, personId: string, caller: Caller): Promise<PlacementsResponse> {
  return await isPublished(db, id) ? removePublished(db, context, id, personId, caller) : before.removePlacement(db, id, personId, caller)
}

export async function reclaimStudent(db: Database, context: WindowContext, id: string, personId: string, caller: Caller): Promise<PlacementsResponse> {
  return await isPublished(db, id) ? returnPublished(db, context, id, personId, caller) : before.reclaimStudent(db, id, personId, caller)
}

export async function takeOut(db: Database, context: WindowContext, id: string, personId: string, caller: Caller): Promise<PlacementsResponse> {
  return await isPublished(db, id) ? takeOutPublished(db, context, id, personId, caller) : before.takeOut(db, id, personId, caller)
}

export async function bringBack(db: Database, context: WindowContext, id: string, personId: string, caller: Caller): Promise<PlacementsResponse> {
  return await isPublished(db, id) ? returnPublished(db, context, id, personId, caller) : before.bringBack(db, id, personId, caller)
}
