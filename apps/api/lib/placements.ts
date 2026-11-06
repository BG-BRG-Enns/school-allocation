// The placements of a campaign as its readers take them (school-core
// placements.ts says what holds): per student for the choice and the run,
// and per activity for the demand, where a directly placed student takes a
// place and needs none, and a student out of a class activity needs places
// like a class without it. Pure: the rows, the classes and the spans are
// the caller's.

import { overlaps, rankablePlaces, type OfferedItem } from '@school-allocation/school-core'
import type { PlacementRecord } from './dao/pre-assignments.ts'

function itemsOverlap(a: Pick<OfferedItem, 'sessions'>, b: Pick<OfferedItem, 'sessions'>): boolean {
  return a.sessions.some((s) => b.sessions.some((t) => overlaps(s, t)))
}

/** The rows of each student, by person id. */
export function placementsByPerson(rows: readonly PlacementRecord[]): Map<string, PlacementRecord[]> {
  const byPerson = new Map<string, PlacementRecord[]>()
  for (const row of rows) byPerson.set(row.personId, [...(byPerson.get(row.personId) ?? []), row])
  return byPerson
}

/** Per activity, how many of `rows` are direct placements of the campaign's students into it. */
export function directlyPlaced(rows: readonly PlacementRecord[], classOf: ReadonlyMap<string, string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (row.source === 'direct' && classOf.has(row.personId)) counts.set(row.itemId, (counts.get(row.itemId) ?? 0) + 1)
  }
  return counts
}

/**
 * The demand's activities with what the placements change: an activity's
 * places less the students placed into it directly, those students per
 * class (they need no place where it is), and for a class activity how
 * many of each of its classes are not in it: on its list, or placed
 * directly, instead of it, into another of these activities that overlaps
 * it. `classOf` knows the campaign's students; rows of others and of
 * activities not in `items` count for nothing.
 */
export function withPlacements(items: ReadonlyMap<string, OfferedItem>, rows: readonly PlacementRecord[], classOf: ReadonlyMap<string, string>): Map<string, OfferedItem> {
  const known = rows.filter((row) => items.has(row.itemId) && classOf.has(row.personId))
  const direct = known.filter((row) => row.source === 'direct')
  // A placement beside a class activity the student was taken out of by hand is beside nothing: for the demand it is one
  // instead of it, so the student, counted as out of the class activity, is counted as placed here.
  const offList = (row: PlacementRecord) => known.some((other) => other.personId === row.personId && other.source === 'class' && other.exempted
    && itemsOverlap(items.get(other.itemId) as OfferedItem, items.get(row.itemId) as OfferedItem))
  const leaves = (row: PlacementRecord) => row.leavesClass || offList(row)
  const result = new Map<string, OfferedItem>()
  for (const [id, item] of items) {
    const own = direct.filter((row) => row.itemId === id)
    const placed = [...new Set(own.map((row) => classOf.get(row.personId) as string))].sort((a, b) => a.localeCompare(b, 'de')).map((className) => {
      const ofClass = own.filter((row) => classOf.get(row.personId) === className)
      return { className, leaving: ofClass.filter(leaves).length, beside: ofClass.filter((row) => !leaves(row)).length }
    })
    const away = item.fixedClasses.map((className) => {
      const out = new Set<string>()
      for (const row of known) {
        if (classOf.get(row.personId) !== className) continue
        if (row.source === 'class' && row.itemId === id && row.exempted) out.add(row.personId)
        if (row.source === 'direct' && row.leavesClass && row.itemId !== id && itemsOverlap(items.get(row.itemId) as OfferedItem, item)) out.add(row.personId)
      }
      return { className, students: out.size }
    }).filter((a) => a.students > 0)
    result.set(id, {
      ...item,
      places: rankablePlaces(item.places, own.length),
      ...(placed.length > 0 ? { placed } : {}),
      ...(away.length > 0 ? { away } : {}),
    })
  }
  return result
}
