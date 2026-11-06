// Who is placed where without ranking (docs/domain-and-api.md §3, D-24 as
// amended on 2026-11-06). Two ways lead into an activity: a class placement
// (the student's class is fixed for it) and a direct placement (a teacher of
// the activity entered the student). A direct placement beats a class
// placement: placed "instead of the class activities of that time", the
// student is out of every class activity that overlaps it, out of the whole
// of it; placed "beside" them, the student stays in the class activity and
// is only away during the other. A teacher of a class activity may also take
// a student of its classes out themselves (the exemption), and put them
// back. This module says what holds for one student; pure, over the rows
// and the spans the caller hands it.

import { overlaps, type Span } from './catalogue.ts'

export const PLACEMENT_SOURCES = ['class', 'direct'] as const
export type PlacementSource = typeof PLACEMENT_SOURCES[number]

/** One placement of a student as stored or, for a class before its rows are written, as its activity's classes say. */
export interface PlacementRow {
  itemId: string
  source: PlacementSource
  /** A class placement the student was taken out of by hand. */
  exempted: boolean
  /** A direct placement that takes the student out of the class activities overlapping it (the default); false: beside them. */
  leavesClass: boolean
}

/** An activity as the placements see it: its spans. Only activities that count are handed over (approved ones, for the choice and the run). */
export interface PlacedItem {
  id: string
  sessions: readonly Pick<Span, 'startMs' | 'endMs'>[]
}

/** A class activity the student is not in, and why: taken out by hand, or by direct placements that overlap it. */
export interface LeftClassItem {
  itemId: string
  by: 'exempted' | 'direct'
  /** The direct placements that take the student out, for `by: 'direct'`. */
  directItemIds: string[]
}

export interface EffectivePlacements {
  /** The activities the student is in: the direct placements and the class placements that hold, sorted. */
  itemIds: string[]
  /** The direct placements beside a class activity that holds and overlaps them: the one pair of placements that may overlap. */
  besideClassItemIds: string[]
  /** The class activities of the student's class they are not in. */
  left: LeftClassItem[]
}

const byText = (a: string, b: string) => a.localeCompare(b, 'en')

function itemsOverlap(a: PlacedItem, b: PlacedItem): boolean {
  return a.sessions.some((s) => b.sessions.some((t) => overlaps(s, t)))
}

/**
 * What holds of a student's placements. Rows of activities that are not in
 * `items` count for nothing (an activity not approved, withdrawn). A class
 * placement holds unless the student was taken out by hand or a direct
 * placement that leaves the class overlaps its activity; a direct placement
 * always holds.
 */
export function effectivePlacements(rows: readonly PlacementRow[], items: ReadonlyMap<string, PlacedItem>): EffectivePlacements {
  const known = rows.filter((row) => items.has(row.itemId))
  const direct = known.filter((row) => row.source === 'direct')
  const leaving = direct.filter((row) => row.leavesClass).map((row) => items.get(row.itemId) as PlacedItem)
  const held: string[] = []
  const left: LeftClassItem[] = []
  for (const row of known.filter((r) => r.source === 'class')) {
    const item = items.get(row.itemId) as PlacedItem
    const takenBy = leaving.filter((other) => other.id !== item.id && itemsOverlap(other, item)).map((other) => other.id).sort(byText)
    if (row.exempted) left.push({ itemId: row.itemId, by: 'exempted', directItemIds: takenBy })
    else if (takenBy.length > 0) left.push({ itemId: row.itemId, by: 'direct', directItemIds: takenBy })
    else held.push(row.itemId)
  }
  const heldItems = held.map((id) => items.get(id) as PlacedItem)
  const beside = direct
    .filter((row) => !row.leavesClass)
    .map((row) => items.get(row.itemId) as PlacedItem)
    .filter((item) => heldItems.some((other) => other.id !== item.id && itemsOverlap(other, item)))
    .map((item) => item.id)
  return {
    itemIds: [...new Set([...held, ...direct.map((row) => row.itemId)])].sort(byText),
    besideClassItemIds: [...new Set(beside)].sort(byText),
    left: left.sort((a, b) => byText(a.itemId, b.itemId)),
  }
}

/** The places students may still rank: an activity's places less the students placed into it directly, never below zero. A direct placement is not capped by the places; it takes one. */
export function rankablePlaces(places: number, directlyPlaced: number): number {
  return Math.max(0, places - Math.max(0, directlyPlaced))
}
