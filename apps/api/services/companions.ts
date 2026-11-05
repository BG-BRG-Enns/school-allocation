// Companions sought (the school's wish 6, decided 2026-11-04): an activity's
// lead says how many teachers they want beside them; what is still sought
// is that number less the companions named. A teacher of the roster joins
// an activity that still seeks one from a list per project day, as long as
// the activity may still take place and the registration is not archived,
// unless it overlaps one they lead or accompany or they are unavailable on
// a day of it ("nur wenn nötig" passes); they leave it again until the
// registration opens. The lead and an organizer set the companions and the
// number wanted at any time until the archive, the activity's state
// untouched. A joined companion is a teacher of the activity like a named
// one. Every change is in the campaign's audit chain; no mail goes out.

import type { CompanionProblemCode, CompanionsBody, CompanionsResponse } from '@school-allocation/api-contracts/companions'
import { mayTakePlace, overlaps, type CampaignState } from '@school-allocation/school-core'
import { actorOf, type Caller } from '../lib/actor.ts'
import { appendAudit, lockScope } from '../lib/audit.ts'
import { readPublishedRun } from '../lib/dao/allocation.ts'
import { lockedCampaign } from '../lib/dao/campaigns.ts'
import * as store from '../lib/dao/items.ts'
import { limitedDays } from '../lib/dao/planning.ts'
import { readDetails } from '../lib/dao/teacher-detail.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError, ItemInvalid, requireFound } from '../lib/errors.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item } from '../lib/models/items.ts'
import { isOrganizer, isTeacher, mayPropose } from '../lib/policies.ts'
import { datesOfSpan } from '../lib/time.ts'
import { plannedItems } from './planning.ts'

/** A companion leaves on their own until the registration opens; after that the lead or an organizer takes them out. */
const LEAVING_STATES: readonly CampaignState[] = ['draft', 'catalogue', 'published']

/** How many companions an activity still seeks: the number wanted less the teachers beside the lead, never below zero. */
export function soughtOf(item: Pick<Item, 'companionsWanted' | 'teachers'>): number {
  return Math.max(0, item.companionsWanted - item.teachers.filter((teacher) => !teacher.lead).length)
}

function spansOf(item: Pick<Item, 'sessions'>): { startMs: number, endMs: number }[] {
  return item.sessions.map((s) => ({ startMs: Date.parse(s.startsAt), endMs: Date.parse(s.endsAt) }))
}

function itemsOverlap(a: Pick<Item, 'sessions'>, b: Pick<Item, 'sessions'>): boolean {
  return spansOf(a).some((x) => spansOf(b).some((y) => overlaps(x, y)))
}

/** The dates an activity touches, in order. */
function datesOf(item: Pick<Item, 'sessions'>): string[] {
  return [...new Set(item.sessions.flatMap((s) => datesOfSpan(Date.parse(s.startsAt), Date.parse(s.endsAt))))].sort((a, b) => a.localeCompare(b, 'en'))
}

/** The caller's own person, when they are a teacher of the roster in force. */
function teacherOf(caller: Caller): string {
  if (!isTeacher(caller) || caller.person === null) throw new ApplicationError('forbidden')
  return caller.person.id
}

/** Why a teacher may not join an activity, or null: it seeks nobody, it overlaps one of theirs, they are unavailable on a day of it. */
function joinProblem(item: Item, mine: readonly Item[], unavailable: ReadonlySet<string>): CompanionProblemCode | null {
  if (soughtOf(item) === 0) return 'none_sought'
  if (mine.some((other) => other.id !== item.id && itemsOverlap(other, item))) return 'overlap'
  if (datesOf(item).some((date) => unavailable.has(date))) return 'unavailable'
  return null
}

/** The activities that may still take place with a teacher among their people. */
function itemsOf(planned: readonly Item[], personId: string | null): Item[] {
  return personId === null ? [] : planned.filter((item) => item.teachers.some((teacher) => teacher.personId === personId))
}

/**
 * The list a teacher joins from: per project day the caller's own
 * availability and the submitted and approved activities of the day that
 * still seek a companion or that the caller accompanies, each with what the
 * caller may do about it. Teachers and organizers; a submitted activity
 * shows here before its approval, by the school's decision, with a word
 * that it is not approved yet.
 */
export async function companionsList(db: Database, campaign: Campaign, caller: Caller): Promise<CompanionsResponse> {
  if (!mayPropose(caller)) throw new ApplicationError('forbidden')
  const personId = isTeacher(caller) ? (caller.person?.id ?? null) : null
  const planned = await plannedItems(db, campaign)
  const offered = planned.filter((item) => item.state === 'proposed' || item.state === 'approved')
  const mine = itemsOf(planned, personId)
  const status = new Map((personId === null ? [] : await limitedDays(db, campaign.projectDays, [personId])).map((d) => [d.date, d.status]))
  const unavailable = new Set([...status].filter(([, s]) => s === 'unavailable').map(([date]) => date))
  const leads = new Map(offered.map((item) => [item.id, item.teachers.find((teacher) => teacher.lead) ?? null]))
  const details = await readDetails(db, [...new Set([...leads.values()].flatMap((lead) => (lead ? [lead.personId] : [])))])
  const closed = campaign.state === 'archived'
  const byStart = (a: Item, b: Item) => (a.sessions[0]?.startsAt ?? '').localeCompare(b.sessions[0]?.startsAt ?? '', 'en') || a.title.localeCompare(b.title, 'de')
  return {
    mayJoin: personId !== null,
    days: campaign.projectDays.map((date) => ({
      date,
      myStatus: status.get(date) ?? 'available',
      items: offered
        .filter((item) => datesOf(item).includes(date))
        .map((item) => {
          const lead = leads.get(item.id) ?? null
          const leading = lead !== null && lead.personId === personId
          const accompanying = !leading && personId !== null && item.teachers.some((teacher) => teacher.personId === personId)
          const problem = closed ? 'campaign_state' : joinProblem(item, mine, unavailable)
          return {
            id: item.id,
            number: item.number,
            title: item.title,
            state: item.state,
            // The sessions of this day alone: a trip over two days stands under each with its own.
            sessions: item.sessions.filter((s) => datesOf({ sessions: [s] }).includes(date)).map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt })),
            lead: { displayName: lead?.displayName ?? '', shortName: lead === null ? null : (details.get(lead.personId)?.shortName ?? null) },
            wanted: item.companionsWanted,
            named: item.teachers.filter((teacher) => !teacher.lead).length,
            sought: soughtOf(item),
            leading,
            accompanying,
            join: personId !== null && !leading && !accompanying && problem === null ? { ok: true } : { ok: false, ...(problem === null ? {} : { problem }) },
            mayLeave: accompanying && LEAVING_STATES.includes(campaign.state),
          }
        })
        .filter((entry) => entry.sought > 0 || entry.accompanying)
        .sort((a, b) => byStart(offered.find((item) => item.id === a.id) as Item, offered.find((item) => item.id === b.id) as Item)),
    })),
  }
}

/** The item and its campaign under the campaign's lock, the item read again after it. */
async function locked(client: Queryable, id: string): Promise<{ current: Item, campaign: Campaign }> {
  const seen = await store.readItem(client, id)
  if (!seen) throw new ApplicationError('not_found')
  await lockScope(client, seen.campaignId)
  const current = await store.readItem(client, id)
  const campaign = current === undefined ? undefined : await lockedCampaign(client, current.campaignId)
  if (!current || !campaign) throw new ApplicationError('not_found')
  return { current, campaign }
}

/**
 * A teacher joins an activity that still seeks a companion. Under the
 * campaign's lock, so two teachers cannot take the last place: the
 * activity must be submitted or approved and able to take place, the
 * registration not archived; refused when nobody is sought any more
 * (`companions_full`), when it overlaps one of the teacher's own
 * (`teacher_overlap`) or when they are unavailable on a day of it
 * (`teacher_unavailable`). Joining one they are in already changes nothing.
 */
export async function joinItem(db: Database, id: string, caller: Caller): Promise<Item> {
  const personId = teacherOf(caller)
  await db.tx(async (client) => {
    const { current, campaign } = await locked(client, id)
    if (campaign.state === 'archived') throw new ApplicationError('campaign_state')
    if (!(current.state === 'proposed' || current.state === 'approved') || !mayTakePlace(current.state, campaign.state)) throw new ApplicationError('item_state')
    const cancelled = (await readPublishedRun(client, campaign.id))?.cancelledItemIds ?? []
    if (cancelled.includes(current.id)) throw new ApplicationError('item_state')
    if (current.teachers.some((teacher) => teacher.personId === personId)) return
    if (soughtOf(current) === 0) throw new ApplicationError('companions_full')
    const mine = itemsOf(await plannedItems(client, campaign), personId)
    if (mine.some((other) => other.id !== current.id && itemsOverlap(other, current))) throw new ApplicationError('teacher_overlap')
    const unavailable = (await limitedDays(client, datesOf(current), [personId])).some((d) => d.status === 'unavailable')
    if (unavailable) throw new ApplicationError('teacher_unavailable')
    await store.addTeacher(client, current.id, personId, current.teachers.length)
    await appendAudit(client, { scopeId: campaign.id, actor: actorOf(caller), action: 'item.companion-joined', metadata: { itemId: current.id, personId } })
  })
  return requireFound(await store.readItem(db, id))
}

/** A companion leaves an activity of their own accord, until the registration opens; the lead does not leave this way. */
export async function leaveItem(db: Database, id: string, caller: Caller): Promise<Item> {
  const personId = teacherOf(caller)
  await db.tx(async (client) => {
    const { current, campaign } = await locked(client, id)
    const me = current.teachers.find((teacher) => teacher.personId === personId)
    if (!me || me.lead) throw new ApplicationError('forbidden')
    if (!LEAVING_STATES.includes(campaign.state)) throw new ApplicationError('campaign_state')
    await store.removeTeacher(client, current.id, personId)
    await appendAudit(client, { scopeId: campaign.id, actor: actorOf(caller), action: 'item.companion-left', metadata: { itemId: current.id, personId } })
  })
  return requireFound(await store.readItem(db, id))
}

/**
 * The lead or an organizer sets the companions and the number wanted, and
 * nothing else of the activity: in every state but withdrawn, until the
 * archive; the lead stays, a companion must be a teacher of the roster in
 * force (422 `item_invalid` names the others). The activity's state does
 * not change: no approval is asked again for its people.
 */
export async function setCompanions(db: Database, id: string, body: CompanionsBody, caller: Caller): Promise<Item> {
  await db.tx(async (client) => {
    const { current, campaign } = await locked(client, id)
    const lead = current.teachers.find((teacher) => teacher.lead) ?? null
    // The lead as the roster in force knows them: someone who left the roster keeps their person but not their say.
    const asLead = isTeacher(caller) && caller.person !== null && lead !== null && lead.personId === caller.person.id
    if (!asLead && !isOrganizer(caller)) throw new ApplicationError('forbidden')
    if (current.state === 'withdrawn') throw new ApplicationError('item_state')
    if (campaign.state === 'archived') throw new ApplicationError('campaign_state')
    // Ids as PostgreSQL returns them, each once, the lead left out of the companions.
    const companions = [...new Set(body.companions.map((personId) => personId.toLowerCase()))].filter((personId) => personId !== lead?.personId)
    const known = new Set((await store.findItemTeachers(client, { teachers: companions })).map((row) => row.personId))
    const unknown = companions.filter((personId) => !known.has(personId))
    if (unknown.length > 0) throw new ItemInvalid([], unknown)
    const before = current.teachers.filter((teacher) => !teacher.lead).map((teacher) => teacher.personId)
    await store.replaceTeachers(client, current.id, lead === null ? companions : [lead.personId, ...companions], body.wanted)
    await appendAudit(client, { scopeId: campaign.id, actor: actorOf(caller), action: 'item.companions-changed', metadata: { itemId: current.id, before, after: companions, wanted: body.wanted } })
  })
  return requireFound(await store.readItem(db, id))
}
