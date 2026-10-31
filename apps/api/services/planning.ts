// Planning with teachers: a teacher's availability on the project days, set
// by the teacher while a registration with that day takes proposals and by
// an organizer for anyone until the registration is archived (audited in
// its chain); the activity form's view of it; and the organizer's overview
// of who leads and accompanies what on each day. Availability belongs to
// the teacher and the date, not to a registration.

import type { CampaignAvailabilityResponse, MyAvailabilityResponse, PlanningResponse } from '@school-allocation/api-contracts/planning'
import type { AvailabilityStatus } from '@school-allocation/school-core'
import type { Actor, Caller } from '../lib/actor.ts'
import { appendAudit, lockScope } from '../lib/audit.ts'
import { lockedCampaign } from '../lib/dao/campaigns.ts'
import { listCampaignItems } from '../lib/dao/items.ts'
import * as store from '../lib/dao/planning.ts'
import { readSnapshot, type Database, type Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import { isTeacher, mayPropose } from '../lib/policies.ts'
import { datesOfSpan } from '../lib/time.ts'
import { canonicalId, requireCampaign } from './campaigns.ts'

/** The caller's own person, when they are a teacher of the roster in force. */
function teacherOf(caller: Caller): string {
  if (!isTeacher(caller) || caller.person === null) throw new ApplicationError('forbidden')
  return caller.person.id
}

/** A teacher's own days: those of every registration taking proposals, each with the teacher's status and the registrations it belongs to. */
export async function myAvailability(db: Database, caller: Caller): Promise<MyAvailabilityResponse> {
  const person = teacherOf(caller)
  return readSnapshot(db, async (client) => {
    const campaigns = await store.campaignsTakingProposals(client)
    const days = [...new Set(campaigns.flatMap((c) => c.projectDays))].sort()
    const limited = new Map((await store.limitedDays(client, days, [person])).map((d) => [d.date, d.status]))
    return {
      days: days.map((date) => ({
        date,
        status: limited.get(date) ?? 'available',
        campaigns: campaigns.filter((c) => c.projectDays.includes(date)).map(({ id, name }) => ({ id, name })),
      })),
    }
  })
}

/** A teacher sets their own status on a day of a registration taking proposals; on any other day it is the organizer's to set. */
export async function setMyAvailability(db: Database, caller: Caller, date: string, status: AvailabilityStatus): Promise<MyAvailabilityResponse> {
  const person = teacherOf(caller)
  await db.tx(async (client) => {
    const campaigns = await store.campaignsTakingProposals(client)
    if (!campaigns.some((c) => c.projectDays.includes(date))) throw new ApplicationError('campaign_state')
    await store.writeAvailability(client, person, date, status)
  })
  return myAvailability(db, caller)
}

/** For the activity form: the teachers not plainly available on the registration's days, to whoever may propose. */
export async function campaignAvailability(db: Database, campaign: Campaign, caller: Caller): Promise<CampaignAvailabilityResponse> {
  if (!mayPropose(caller)) throw new ApplicationError('forbidden')
  return { limited: await store.limitedDays(db, campaign.projectDays) }
}

type PlannedItem = PlanningResponse['teachers'][number]['days'][number]['leads'][number]

async function planningOf(client: Queryable, campaign: Campaign): Promise<PlanningResponse> {
  const teachers = await store.planningTeachers(client, campaign.id)
  const items = (await listCampaignItems(client, campaign.id)).filter((item) => item.state !== 'withdrawn')
  const key = (personId: string, date: string) => `${personId} ${date}`
  const status = new Map((await store.limitedDays(client, campaign.projectDays)).map((d) => [key(d.personId, d.date), d.status]))
  const planned = new Map<string, { leads: PlannedItem[], accompanies: PlannedItem[] }>()
  for (const item of items) {
    const dates = new Set(item.sessions.flatMap((s) => datesOfSpan(Date.parse(s.startsAt), Date.parse(s.endsAt))))
    for (const teacher of item.teachers) {
      for (const date of dates) {
        const entry = planned.get(key(teacher.personId, date)) ?? { leads: [], accompanies: [] }
        ;(teacher.lead ? entry.leads : entry.accompanies).push({ id: item.id, number: item.number, title: item.title })
        planned.set(key(teacher.personId, date), entry)
      }
    }
  }
  return {
    days: campaign.projectDays,
    teachers: teachers.map((teacher) => ({
      ...teacher,
      days: campaign.projectDays.map((date) => ({
        date,
        status: status.get(key(teacher.personId, date)) ?? 'available',
        leads: planned.get(key(teacher.personId, date))?.leads ?? [],
        accompanies: planned.get(key(teacher.personId, date))?.accompanies ?? [],
      })),
    })),
    editable: campaign.state !== 'archived',
  }
}

/** The organizer's overview of a registration: every teacher, per project day their availability and what they lead and accompany. */
export async function planning(db: Database, rawId: string): Promise<{ campaign: Campaign, planning: PlanningResponse }> {
  return readSnapshot(db, async (client) => {
    const campaign = await requireCampaign(client, canonicalId(rawId))
    return { campaign, planning: await planningOf(client, campaign) }
  })
}

/**
 * An organizer sets a teacher's status on one of the registration's days,
 * until it is archived; a change is recorded in the registration's audit
 * chain, the same status again is not.
 */
export async function setAvailabilityFor(db: Database, rawId: string, personId: string, date: string, status: AvailabilityStatus, actor: Actor): Promise<PlanningResponse> {
  const id = canonicalId(rawId)
  const person = personId.toLowerCase()
  await db.tx(async (client) => {
    await lockScope(client, id)
    const campaign = await lockedCampaign(client, id)
    if (!campaign) throw new ApplicationError('not_found')
    if (campaign.state === 'archived') throw new ApplicationError('campaign_state')
    if (!campaign.projectDays.includes(date)) throw new ApplicationError('not_found')
    if (!(await store.planningTeachers(client, id)).some((teacher) => teacher.personId === person)) throw new ApplicationError('teacher_unknown')
    const [current] = await store.limitedDays(client, [date], [person])
    if ((current?.status ?? 'available') === status) return
    await store.writeAvailability(client, person, date, status)
    await appendAudit(client, {
      scopeId: id, actor: { tid: actor.tid, oid: actor.oid, name: actor.name }, action: 'availability.changed',
      metadata: { personId: person, date, status },
    })
  })
  return (await planning(db, id)).planning
}
