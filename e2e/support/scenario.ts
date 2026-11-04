// The school around the test people: the scenario of e2e/scenario, in the
// journeys' language. The harness's Graph stand-in holds its tenant from
// the start; the rest the harness loads when a journey gets there, stage
// by stage, around what the journeys did through the pages:
//
// - groups: every class's group labelled but 5A's (02, before the import);
// - staff: the class teachers but 5A's, and the scenario's organizer (02,
//   after the import);
// - catalogue: the other categories, the teachers' availability and the
//   school's activities, proposed and approved at their moments, into the
//   journeys' project week taking proposals (03); the clock ends in February;
// - choices: every student's list saved before `until`, but Sara's and
//   Tim's (05, 06).
//
// A stage moves the clock forward, so it runs while nobody is signed in;
// the browser's clock follows it.

import type { Page } from '@playwright/test'
import { DEFAULT_PERIODS, demandByDay, demandCells, placeTarget, type DemandDay } from '@school-allocation/school-core'
import { inEnglish } from '../scenario/english.ts'
import { MONDAY, scenario, scenarioInstant, scenarioOffer, wholeDay } from '../scenario/school.ts'
import { control, followClock } from './clock.ts'
import { LOCALE } from './messages.ts'

export type Stage = 'groups' | 'staff' | 'catalogue' | 'choices'

/** The scenario, with its texts in the journeys' language. */
export const SCHOOL = LOCALE === 'en' ? inEnglish(scenario()) : scenario()

/** The students of the school, in its 25 classes. */
export const STUDENTS = SCHOOL.classes.reduce((sum, c) => sum + c.students.length, 0)

/** The class the organizer takes out of the journeys' registration (03-katalog): its students see no registration and are invited to nothing. */
export const LEFT_OUT = '4D'

/** The classes taking part in the journeys' registration, and their students. */
export const PARTICIPATING_CLASSES = SCHOOL.classes.filter((c) => c.name !== LEFT_OUT)
export const PARTICIPATING = PARTICIPATING_CLASSES.reduce((sum, c) => sum + c.students.length, 0)

/** Everyone in the tenant's labelled groups: the students and the teachers. */
export const PEOPLE = STUDENTS + SCHOOL.teachers.length

/** The students of class `name`. */
export function classSize(name: string): number {
  const found = SCHOOL.classes.find((c) => c.name === name)
  if (!found) throw new Error(`the school has no class ${name}`)
  return found.students.length
}

/** The journeys' own activity in the project week (03-katalog): Bernd's climbing, Monday 08:30 – 12:15, for the 9th and 10th grade. */
export const CLIMBING = { date: MONDAY, startsAt: `${MONDAY}T08:30:00+02:00`, endsAt: `${MONDAY}T12:15:00+02:00`, places: 12, grades: [9, 10] } as const

/**
 * What the demand shows for `grade` on `date` with the school's activities
 * and the journeys' climbing: needing, target, offered. The day counted
 * whole, or, with `period`, the cell of that period under the scenario's
 * frame for the day (the seeded grid, which the journeys shorten by its last
 * period only).
 */
export function demandOf(date: string, grade: number, period: number | null = null): [needing: number, target: number, offered: number] {
  const offered = [
    ...scenarioOffer(SCHOOL.items),
    { fixedClasses: [], eligibleGrades: [...CLIMBING.grades], eligibleClasses: [], places: CLIMBING.places, sessions: [{ startMs: Date.parse(CLIMBING.startsAt), endMs: Date.parse(CLIMBING.endsAt) }] },
  ]
  const sizes = PARTICIPATING_CLASSES.map((c) => ({ className: c.name, grade: c.grade, students: c.students.length }))
  const frame = SCHOOL.campaign.frames[date] ?? null
  const whole = wholeDay(date)
  const day: DemandDay = period === null || frame === null ? whole : { date, frame, cells: demandCells(frame, DEFAULT_PERIODS, (time) => scenarioInstant(date, time), whole.cells[0] as { startMs: number, endMs: number }) }
  const found = demandByDay([day], sizes, offered)[0]?.grades.find((g) => g.grade === grade)?.cells.find((c) => c.period === period)
  if (!found) throw new Error(`no demand for grade ${grade} on ${date}, period ${period}`)
  // The registration's headroom is the default, 20%.
  return [found.needing, placeTarget(found.needing, 20), found.offered]
}

/** The number the catalogue gives climbing, called `title`: activities by their first session, then by title. */
export function climbingNumber(title: string): number {
  const starts = Date.parse(CLIMBING.startsAt)
  const before = SCHOOL.items.filter((item) => {
    const first = Math.min(...item.sessions.map((s) => Date.parse(`${s.date}T${s.from}:00+02:00`)))
    return first < starts || (first === starts && item.title < title)
  })
  return before.length + 1
}

/** What the choices stage did: the lists saved, and how many of them are complete. */
export interface Saves {
  saved: number
  complete: number
}

/** Loads `stage` in the harness and sets the browser's clock in `page` to where it left the harness's. */
export async function loadStage(page: Page, stage: 'choices', until: string): Promise<Saves>
export async function loadStage(page: Page, stage: Exclude<Stage, 'choices'>): Promise<object>
export async function loadStage(page: Page, stage: Stage, until?: string): Promise<object> {
  const outcome = await control<object>('POST', '/scenario', { stage, until })
  await followClock(page.context())
  return outcome
}
