// A student's wishes (docs/domain-and-api.md §3, D-05): the items offered
// to them fall into time groups by the span their sessions occupy; the
// student ranks up to the campaign's cap in each group, and a list is
// complete when every group has its wishes. Pure: the API computes the
// spans from the sessions and hands them over.

import { isEligible, overlaps, type ItemRules, type Span, type StudentOf } from './catalogue.ts'

export interface GroupableItem {
  id: string
  sessions: Pick<Span, 'startMs' | 'endMs'>[]
}

/** Items whose sessions occupy the same spans, in order of their first session. */
export interface TimeGroup {
  /** The spans, as "start-end" in epoch milliseconds, sorted and joined with "+": the same spans give the same key. */
  key: string
  /** The first span's start, for ordering and the day. */
  startMs: number
  /** The last span's end. */
  endMs: number
  itemIds: string[]
}

/** The group key of an item: its spans, sorted and joined. */
export function groupKeyOf(item: GroupableItem): string {
  return item.sessions.map((s) => `${s.startMs}-${s.endMs}`).sort((a, b) => a.localeCompare(b, 'en')).join('+')
}

/** The time groups of `items`, each item in the one its spans make, groups in order of their start. */
export function timeGroupsOf(items: readonly GroupableItem[]): TimeGroup[] {
  const groups = new Map<string, TimeGroup>()
  for (const item of items) {
    if (item.sessions.length === 0) continue
    const key = groupKeyOf(item)
    const group = groups.get(key) ?? {
      key,
      startMs: Math.min(...item.sessions.map((s) => s.startMs)),
      endMs: Math.max(...item.sessions.map((s) => s.endMs)),
      itemIds: [],
    }
    group.itemIds.push(item.id)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.key.localeCompare(b.key, 'en'))
}

export interface OfferableItem extends GroupableItem {
  rules: ItemRules
}

/**
 * The items a student may rank: eligible for them (D-24: not fixed for
 * their class, places to rank, grade and class within the rules) and not
 * overlapping any session of the items they are fixed into.
 */
export function offeredTo(student: StudentOf, items: readonly OfferableItem[], fixedSessions: readonly Pick<Span, 'startMs' | 'endMs'>[]): OfferableItem[] {
  return items.filter((item) => isEligible(student, item.rules) && !item.sessions.some((s) => fixedSessions.some((f) => overlaps(s, f))))
}

/** Group key → the ranked item ids, first wish first. */
export type Ranking = Record<string, string[]>

export const RANKING_PROBLEM_CODES = ['unknown_group', 'unknown_item', 'item_twice', 'too_many_wishes'] as const
export type RankingProblemCode = typeof RANKING_PROBLEM_CODES[number]

export interface RankingProblem {
  code: RankingProblemCode
  group?: string
}

/** How many wishes a group asks for: the cap, or every item when there are fewer. */
export function wishesRequired(group: Pick<TimeGroup, 'itemIds'>, cap: number): number {
  return Math.min(cap, group.itemIds.length)
}

/**
 * The problems of a ranking against the groups offered and the cap: a
 * group that is not offered, an item that is not in its group, an item
 * ranked twice in a group, more wishes than the cap. A missing group is no
 * problem here: the list is then incomplete, which isComplete says.
 */
export function checkRanking(ranking: Ranking, groups: readonly TimeGroup[], cap: number): RankingProblem[] {
  const problems: RankingProblem[] = []
  const byKey = new Map(groups.map((group) => [group.key, group]))
  for (const [key, itemIds] of Object.entries(ranking)) {
    const group = byKey.get(key)
    if (!group) {
      problems.push({ code: 'unknown_group', group: key })
      continue
    }
    if (itemIds.some((id) => !group.itemIds.includes(id))) problems.push({ code: 'unknown_item', group: key })
    if (new Set(itemIds).size !== itemIds.length) problems.push({ code: 'item_twice', group: key })
    if (itemIds.length > cap) problems.push({ code: 'too_many_wishes', group: key })
  }
  return problems
}

/** Whether every group has its wishes (wishesRequired); a student with no groups is complete. */
export function isComplete(ranking: Ranking, groups: readonly TimeGroup[], cap: number): boolean {
  return groups.every((group) => (ranking[group.key]?.length ?? 0) >= wishesRequired(group, cap))
}
