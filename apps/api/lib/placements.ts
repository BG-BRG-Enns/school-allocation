// The placements of a campaign as its readers take them (school-core
// placements.ts says what holds): per student for the choice and the run,
// and per activity for the demand, where a directly placed student takes a
// place and needs none, and a student out of a class activity needs places
// like a class without it. Pure: the rows, the classes and the spans are
// the caller's.

import { effectivePlacements, rankablePlaces, type AwayOf, type OfferedItem, type PlacedOf, type PlacementRow } from '@school-allocation/school-core'
import type { PlacementRecord } from './dao/pre-assignments.ts'

/**
 * A student's rows as every reader takes them: a direct row of an activity
 * that takes the student's class as a whole is a class placement (the row
 * stayed when the class was added, in the class placement's place), and
 * takes no place, leaves nothing and is beside nothing. The one projection
 * the choice, the run, the demand and the pages read.
 */
export function asPlacementRows(rows: readonly PlacementRecord[], className: string, fixedClassesOf: ReadonlyMap<string, readonly string[]>): PlacementRow[] {
  return rows.map((row) => {
    const byClass = row.source === 'class' || (fixedClassesOf.get(row.itemId) ?? []).includes(className)
    return { itemId: row.itemId, source: byClass ? 'class' : 'direct', exempted: byClass && row.exempted, leavesClass: byClass ? true : row.leavesClass }
  })
}

/** The rows of each student, by person id. */
export function placementsByPerson(rows: readonly PlacementRecord[]): Map<string, PlacementRecord[]> {
  const byPerson = new Map<string, PlacementRecord[]>()
  for (const row of rows) byPerson.set(row.personId, [...(byPerson.get(row.personId) ?? []), row])
  return byPerson
}

/**
 * Per activity, how many of the campaign's students are placed into it
 * directly and so take one of its places. Not a student whose class the
 * activity takes as a whole (`fixedClassesOf`): placed into it before
 * their class became one of its classes, they are in it with their class,
 * which takes no place. The same count as the choice's (dao directCounts)
 * and the demand's (withPlacements).
 */
export function directlyPlaced(rows: readonly PlacementRecord[], classOf: ReadonlyMap<string, string>, fixedClassesOf: ReadonlyMap<string, readonly string[]>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const className = classOf.get(row.personId)
    if (row.source !== 'direct' || className === undefined || (fixedClassesOf.get(row.itemId) ?? []).includes(className)) continue
    counts.set(row.itemId, (counts.get(row.itemId) ?? 0) + 1)
  }
  return counts
}

/**
 * The demand's activities with what the placements change: an activity's
 * places less the students placed into it directly, those students (they
 * need no place where it is), and for a class activity the students of its
 * classes who are not in it. Who is in what is what holds for each student
 * (school-core effectivePlacements), over these activities: a class
 * placement is the student's class being one of the activity's classes,
 * whether its row is written yet or not, unless they were taken out of it
 * by hand; a direct placement beside a class activity counts as beside it
 * only while that class placement holds. `classOf` knows the campaign's
 * students; rows of others and of activities not in `items` count for
 * nothing.
 */
export function withPlacements(items: ReadonlyMap<string, OfferedItem>, rows: readonly PlacementRecord[], classOf: ReadonlyMap<string, string>): Map<string, OfferedItem> {
  const spans = new Map([...items].map(([id, item]) => [id, { id, sessions: item.sessions }]))
  const fixedClassesOf = new Map([...items].map(([id, item]) => [id, item.fixedClasses]))
  const byPerson = placementsByPerson(rows.filter((row) => items.has(row.itemId) && classOf.has(row.personId)))
  const placed = new Map<string, PlacedOf[]>()
  const away = new Map<string, AwayOf[]>()
  // Every student with a row, in a stable order: the others are in their class activities and nowhere else.
  for (const [personId, own] of [...byPerson].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const className = classOf.get(personId) as string
    const normalized = asPlacementRows(own, className, fixedClassesOf)
    const exempted = new Set(normalized.filter((row) => row.source === 'class' && row.exempted).map((row) => row.itemId))
    const byClass: PlacementRow[] = [...items].filter(([, item]) => item.fixedClasses.includes(className)).map(([itemId]) => ({ itemId, source: 'class', exempted: exempted.has(itemId), leavesClass: true }))
    const direct: PlacementRow[] = normalized.filter((row) => row.source === 'direct')
    const held = effectivePlacements([...byClass, ...direct], spans)
    for (const row of direct) placed.set(row.itemId, [...(placed.get(row.itemId) ?? []), { className, personId, beside: held.besideClassItemIds.includes(row.itemId) }])
    for (const left of held.left) away.set(left.itemId, [...(away.get(left.itemId) ?? []), { className, personId }])
  }
  const result = new Map<string, OfferedItem>()
  for (const [id, item] of items) {
    const own = placed.get(id) ?? []
    const out = away.get(id) ?? []
    result.set(id, { ...item, places: rankablePlaces(item.places, own.length), ...(own.length > 0 ? { placed: own } : {}), ...(out.length > 0 ? { away: out } : {}) })
  }
  return result
}
