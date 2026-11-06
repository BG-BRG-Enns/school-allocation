// The order of a list of activities by when they take place: under the
// project day an activity starts on, inside by its start, then by its
// title. A teacher finds the one just created under its day, and whoever
// looks at a day sees what it has already. Pure: the day of an instant is
// the school's (format.ts localDateOf).

import { localDateOf } from './format.ts'

/** What the order reads of an activity. */
export interface Timed {
  title: string
  sessions: readonly { startsAt: string }[]
}

/** The start of an activity's earliest session, as its ISO instant; '' for one without sessions. */
export function firstStart(item: Timed): string {
  return item.sessions.reduce((first, s) => (first === '' || s.startsAt < first ? s.startsAt : first), '')
}

/** By the first start, the earliest first, one without sessions last; then by title. */
export function byStart<T extends Timed>(items: readonly T[]): T[] {
  const key = (item: T) => firstStart(item) || '￿'
  return [...items].sort((a, b) => key(a).localeCompare(key(b), 'en') || a.title.localeCompare(b.title, 'de'))
}

/** The activities of one day: the local date they start on, null for those without a session. */
export interface DayGroup<T> {
  day: string | null
  items: T[]
}

/** The activities under the day each starts on, the days in order, each day's by start and title; those without a session last. */
export function groupByStartDay<T extends Timed>(items: readonly T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const item of byStart(items)) {
    const start = firstStart(item)
    const day = start === '' ? null : localDateOf(start)
    const last = groups.at(-1)
    if (last && last.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}
