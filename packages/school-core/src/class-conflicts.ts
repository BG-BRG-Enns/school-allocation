// A class is in one class activity at a time (the school's wish 3): two
// class activities naming the same class with overlapping sessions cannot
// both take place, and the allocation would refuse the run. Found here,
// pure, over the spans the caller computed; the service refuses the
// submission, the approval and the organizer's change that would make one,
// and the pages show it on a draft and before publication.

import { overlaps } from './catalogue.ts'

/** A class activity as the check sees it. */
export interface ClassActivity {
  id: string
  fixedClasses: readonly string[]
  sessions: readonly { startMs: number, endMs: number }[]
}

/** One conflict: a class named by both, and the span they share. */
export interface ClassConflict {
  className: string
  /** The other activity. */
  itemId: string
  startMs: number
  endMs: number
}

/**
 * Every conflict of `candidate` with `others`: per class both name and per
 * pair of overlapping sessions, the span shared, in the others' order. An
 * activity without fixed classes conflicts with nothing; the candidate is
 * never compared with itself.
 */
export function classConflicts(candidate: ClassActivity, others: readonly ClassActivity[]): ClassConflict[] {
  if (candidate.fixedClasses.length === 0) return []
  const conflicts: ClassConflict[] = []
  for (const other of others) {
    if (other.id === candidate.id) continue
    const shared = other.fixedClasses.filter((name) => candidate.fixedClasses.includes(name))
    if (shared.length === 0) continue
    for (const a of candidate.sessions) {
      for (const b of other.sessions) {
        if (!overlaps(a, b)) continue
        for (const className of shared) conflicts.push({ className, itemId: other.id, startMs: Math.max(a.startMs, b.startMs), endMs: Math.min(a.endMs, b.endMs) })
      }
    }
  }
  return conflicts
}

/** Every conflict among `activities`, each pair once (the earlier in the list as the candidate). */
export function allClassConflicts(activities: readonly ClassActivity[]): ClassConflict[] {
  return activities.flatMap((candidate, index) => classConflicts(candidate, activities.slice(index + 1)))
}
