import type { ItemBody } from '@school-allocation/api-contracts/catalogue'
import type { Static } from 'typebox'
import type { Caller } from '../lib/actor.ts'
import { ApplicationError } from '../lib/errors.ts'
import type { ItemInput } from '../lib/models/items.ts'
import { isTeacher } from '../lib/policies.ts'

/**
 * An item as students see it when the school keeps the teachers out of the
 * catalogue (D-13): no teachers, and no proposer's name either, since the
 * proposer usually teaches it. Teachers and organizers always see both.
 */
/**
 * The body as the library takes it, defaults filled in. On creation the
 * proposing teacher is among the teachers when they are one and left
 * themselves out, unless the body names another teacher as the lead (an
 * activity created for a colleague); an edit keeps the list as sent, so an organizer who is
 * also a teacher does not become a teacher of an item they corrected.
 * The lead is the one the body names; a new activity that names none is
 * led by its creator when among the teachers, else by the first named; an
 * edit that names none leaves it to the service, which keeps the lead the
 * activity has.
 */
export function itemInput(body: Static<typeof ItemBody>, caller: Caller, creating: boolean): ItemInput {
  // Ids as PostgreSQL returns them, so a spelling in upper case is the same teacher.
  const teachers = body.teachers.map((id) => id.toLowerCase())
  // Not when the body names another teacher as the lead: whoever creates an activity for a colleague and leaves themselves out stays out.
  const named = body.lead?.toLowerCase()
  if (creating && isTeacher(caller) && caller.person && !teachers.includes(caller.person.id) && (named === undefined || named === caller.person.id)) teachers.unshift(caller.person.id)
  // The lead and up to eight companions, the proposer put in front counted: the schema's bound is on the list as sent.
  if (teachers.length > 9) throw new ApplicationError('validation_failed')
  const own = isTeacher(caller) && caller.person && teachers.includes(caller.person.id) ? caller.person.id : null
  const lead = named ?? (creating ? (own ?? teachers[0] ?? null) : null)
  return {
    title: body.title,
    description: body.description ?? '',
    location: body.location ?? '',
    feeCents: body.feeCents ?? 0,
    feeNote: body.feeNote ?? '',
    places: body.places,
    minParticipants: body.minParticipants ?? 0,
    cancellableBelowMin: body.cancellableBelowMin ?? (body.fixedClasses ?? []).length === 0,
    fixedClasses: uniqueSorted(body.fixedClasses ?? []),
    eligibleGrades: [...new Set(body.eligibleGrades ?? [])].sort((a, b) => a - b),
    eligibleClasses: uniqueSorted(body.eligibleClasses ?? []),
    teachers,
    lead,
    companionsWanted: body.companionsWanted ?? 0,
    // What a session credits is derived when it is written (services/items.ts credited): a client sends none.
    sessions: body.sessions.map((session) => ({ startsAt: session.startsAt, endsAt: session.endsAt, location: session.location ?? '', credits: [] })),
    ...(body.categories === undefined ? {} : { categories: uniqueSorted(body.categories.map((id) => id.toLowerCase())) }),
  }
}

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'de'))
}

/**
 * The project days as the campaign keeps them: calendar dates that exist
 * (the schema checks the shape, not that 31 February is a day), each once,
 * in order. Otherwise throws an application validation error.
 */
export function projectDays(values: readonly string[]): string[] {
  for (const day of values) {
    const ms = Date.parse(`${day}T00:00:00Z`)
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== day) throw new ApplicationError('invalid_date')
  }
  // YYYY-MM-DD sorts chronologically by its characters; the comparator says
  // so, since sort() without one is sort by code unit only by convention.
  const days = [...new Set(values)].sort((a, b) => Number(a > b) - Number(a < b))
  if (days.length !== values.length) throw new ApplicationError('project_day_twice')
  return days
}
