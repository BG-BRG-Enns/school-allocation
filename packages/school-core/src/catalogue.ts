// The catalogue of a project week (docs/domain-and-api.md §1, §3, D-24): an
// activity with its sessions, the credit each session earns per project
// day, the places students may rank, the classes it is fixed for, and who
// may rank it. The rules an activity must satisfy before it is stored, and
// the time arithmetic the choice rules and the allocation build on, are
// here, pure. Instants are epoch milliseconds and local dates are
// YYYY-MM-DD strings, both supplied by the caller: this module reads no
// clock and knows no time zone.

export const ITEM_STATES = ['draft', 'proposed', 'approved', 'withdrawn'] as const
export type ItemState = typeof ITEM_STATES[number]

/**
 * What may follow a state: a teacher proposes a draft; an organizer
 * approves a proposal or returns it to draft with a note, and may return an
 * approved item too; a withdrawn item is the end.
 */
export const ITEM_TRANSITIONS: Readonly<Record<ItemState, readonly ItemState[]>> = {
  draft: ['proposed', 'withdrawn'],
  proposed: ['approved', 'draft', 'withdrawn'],
  approved: ['draft', 'withdrawn'],
  withdrawn: [],
}

export type ItemTransitionResult = { ok: true, state: ItemState } | { ok: false, code: 'invalid_item_transition', from: ItemState, to: ItemState }

export function itemTransition(from: ItemState, to: ItemState): ItemTransitionResult {
  return ITEM_TRANSITIONS[from].includes(to) ? { ok: true, state: to } : { ok: false, code: 'invalid_item_transition', from, to }
}

export function isItemState(value: unknown): value is ItemState {
  return typeof value === 'string' && (ITEM_STATES as readonly string[]).includes(value)
}

/** The campaign states in which activities are proposed and reviewed. */
export function acceptsProposals(campaignState: string): boolean {
  return campaignState === 'catalogue'
}

/** A day has this many minutes; no credit is above it. */
const MINUTES_PER_DAY = 24 * 60

/** A local date, YYYY-MM-DD. */
export const LOCAL_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** A span of time with the local dates it touches, as the caller computed them in the school's time zone. */
export interface Span {
  startMs: number
  endMs: number
  /** Every local date from the one `startMs` falls on to the one `endMs` falls on (an end at midnight belongs to the day before). */
  dates: string[]
}

/** The minutes a session earns on one project day: derived from the school's periods it covers (creditsOf), so breaks and what lies outside the timetable do not count. */
export interface Credit {
  date: string
  minutes: number
}

/** A local date a session touches, as the caller computed it in the school's zone: the day's own span and the spans of the grid's periods on it. */
export interface CreditDay {
  date: string
  startMs: number
  endMs: number
  periods: readonly Pick<Span, 'startMs' | 'endMs'>[]
}

const MINUTE_MS = 60_000

/** The whole minutes two spans share. */
function sharedMinutes(a: Pick<Span, 'startMs' | 'endMs'>, b: Pick<Span, 'startMs' | 'endMs'>): number {
  return Math.max(0, Math.round((Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs)) / MINUTE_MS))
}

/**
 * What a session credits on each date it touches: the minutes it shares
 * with the periods of the school's grid on that date. A session of two
 * periods credits their two lengths, the break between them not; a trip
 * by the clock credits the periods it covers, so the minimum a day asks
 * for means the same however the day is cut into activities. A session
 * that shares nothing with the grid on any of its dates (a school without
 * a grid, an evening) credits its clock minutes on each date instead, so
 * every session credits something. One entry per date, in the days'
 * order; never more than a day has minutes.
 */
export function creditsOf(span: Pick<Span, 'startMs' | 'endMs'>, days: readonly CreditDay[]): Credit[] {
  const onGrid = days.map((day) => day.periods.reduce((sum, period) => sum + sharedMinutes(span, period), 0))
  const minutes = onGrid.some((m) => m > 0) ? onGrid : days.map((day) => sharedMinutes(span, day))
  return days.map((day, index) => ({ date: day.date, minutes: Math.min(MINUTES_PER_DAY, minutes[index] ?? 0) }))
}

export interface SessionInput extends Span {
  credits: Credit[]
}

/** Who may rank an activity and who is placed into it without ranking. */
export interface ItemRules {
  /** Classes whose students are pre-assigned; nobody ranks the item for them. */
  fixedClasses: string[]
  /** Grades (Schulstufen) whose students may rank it; empty means every grade. */
  eligibleGrades: number[]
  /** Classes whose students may rank it; empty means every class. */
  eligibleClasses: string[]
  /** Places for students who rank it: the capacity of a choosable activity, the extra places of a class activity. */
  places: number
  /** Below this many ranked participants the activity may be cancelled, if cancellable. */
  minParticipants: number
  cancellableBelowMin: boolean
}

export interface ItemInput {
  sessions: SessionInput[]
  rules: ItemRules
  /** Person ids of the teachers. */
  teachers: string[]
  /** The teacher who leads; the others accompany. Null when none is named; left out where the lead is not what is checked. */
  lead?: string | null
}

export interface ItemContext {
  /** The campaign's project days, local dates. */
  projectDays: string[]
  /** The class names of the roster in force. */
  classes: string[]
  /** The minimum length of an activity per project day, in credited minutes; a day left out asks for none. */
  activityMinimum: Record<string, number>
}

export const CATALOGUE_PROBLEM_CODES = [
  'no_sessions',
  'session_ends_before_start',
  'session_outside_project_days',
  'sessions_overlap',
  'credit_date_outside_session',
  'credit_date_twice',
  'credit_minutes_invalid',
  'no_credit',
  'below_minimum_length',
  'min_above_places',
  'fixed_item_cancellable',
  'fixed_class_unknown',
  'eligible_class_unknown',
  'fixed_class_also_eligible',
  'no_teacher',
  'teacher_twice',
  'no_lead',
  'lead_not_teacher',
] as const
export type CatalogueProblemCode = typeof CATALOGUE_PROBLEM_CODES[number]

export interface CatalogueProblem {
  code: CatalogueProblemCode
  /** The session the problem is about, counted from 0. */
  session?: number
  /** The project day the problem is about (below_minimum_length). */
  date?: string
}

/** How an activity stands against a day's minimum length. */
export interface LengthStanding {
  date: string
  /** The day's minimum, in credited minutes. */
  minimum: number
  /** What the activity credits that day over all its sessions. */
  credited: number
  met: boolean
}

/**
 * The activity against the minimum length of each project day it touches
 * that has one: what its sessions credit on the day together (an
 * interruption is two sessions of one activity) must reach the minimum.
 * Exempt: an activity of its teachers alone, which offers nothing; and the
 * days of a session over a night, which a trip returning in the morning
 * meets by the night away. In the days' order.
 */
export function lengthStandings(item: { sessions: readonly Pick<SessionInput, 'dates' | 'credits'>[], rules: { fixedClasses: readonly string[], places: number } }, activityMinimum: Readonly<Record<string, number>>, projectDays: readonly string[]): LengthStanding[] {
  if (isStaffOnly(item.rules)) return []
  const credited = new Map<string, number>()
  const overnight = new Set<string>()
  for (const session of item.sessions) {
    for (const credit of session.credits) credited.set(credit.date, (credited.get(credit.date) ?? 0) + credit.minutes)
    if (session.dates.length > 1) for (const date of session.dates) overnight.add(date)
  }
  const touched = new Set(item.sessions.flatMap((session) => session.dates))
  return projectDays
    .filter((date) => touched.has(date) && (activityMinimum[date] ?? 0) > 0)
    .map((date) => {
      const minimum = activityMinimum[date] as number
      const minutes = credited.get(date) ?? 0
      return { date, minimum, credited: minutes, met: overnight.has(date) || minutes >= minimum }
    })
}

/**
 * The problems of an activity as proposed, against its campaign's project
 * days and the roster's classes. Shapes (a title's length, a grade's range)
 * are the API schema's; these are the rules.
 */
export function checkItem(item: ItemInput, context: ItemContext): CatalogueProblem[] {
  const problems: CatalogueProblem[] = []
  const projectDays = new Set(context.projectDays)
  const classes = new Set(context.classes)
  if (item.sessions.length === 0) problems.push({ code: 'no_sessions' })
  item.sessions.forEach((session, index) => {
    if (!(session.endMs > session.startMs)) problems.push({ code: 'session_ends_before_start', session: index })
    if (session.dates.some((date) => !projectDays.has(date))) problems.push({ code: 'session_outside_project_days', session: index })
    const dates = new Set(session.dates)
    const seen = new Set<string>()
    for (const credit of session.credits) {
      if (!dates.has(credit.date)) problems.push({ code: 'credit_date_outside_session', session: index })
      if (seen.has(credit.date)) problems.push({ code: 'credit_date_twice', session: index })
      seen.add(credit.date)
      if (!Number.isInteger(credit.minutes) || credit.minutes < 0 || credit.minutes > MINUTES_PER_DAY) problems.push({ code: 'credit_minutes_invalid', session: index })
    }
    // A span that is none has its own problem and no credit to speak of.
    if (session.endMs > session.startMs && session.credits.every((credit) => credit.minutes <= 0)) problems.push({ code: 'no_credit', session: index })
  })
  for (let i = 0; i < item.sessions.length; i++) {
    for (let j = i + 1; j < item.sessions.length; j++) {
      if (overlaps(item.sessions[i] as Span, item.sessions[j] as Span)) problems.push({ code: 'sessions_overlap', session: j })
    }
  }
  for (const standing of lengthStandings(item, context.activityMinimum, context.projectDays)) {
    if (!standing.met) problems.push({ code: 'below_minimum_length', date: standing.date })
  }
  const { rules } = item
  if (rules.minParticipants > rules.places) problems.push({ code: 'min_above_places' })
  if (rules.fixedClasses.length > 0 && rules.cancellableBelowMin) problems.push({ code: 'fixed_item_cancellable' })
  if (rules.fixedClasses.some((name) => !classes.has(name))) problems.push({ code: 'fixed_class_unknown' })
  if (rules.eligibleClasses.some((name) => !classes.has(name))) problems.push({ code: 'eligible_class_unknown' })
  if (rules.eligibleClasses.some((name) => rules.fixedClasses.includes(name))) problems.push({ code: 'fixed_class_also_eligible' })
  if (item.teachers.length === 0) problems.push({ code: 'no_teacher' })
  if (new Set(item.teachers).size !== item.teachers.length) problems.push({ code: 'teacher_twice' })
  // One of the teachers leads: an activity with teachers names its lead, and names one of them.
  if (item.lead !== undefined && item.teachers.length > 0) {
    if (item.lead === null) problems.push({ code: 'no_lead' })
    else if (!item.teachers.includes(item.lead)) problems.push({ code: 'lead_not_teacher' })
  }
  return problems
}

/** Whether two spans share any instant; touching end points (11:00–11:00) do not. */
export function overlaps(a: Pick<Span, 'startMs' | 'endMs'>, b: Pick<Span, 'startMs' | 'endMs'>): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs
}

/** The minutes an activity's sessions earn per date, summed. */
export function creditedMinutesByDate(sessions: readonly { credits: readonly Credit[] }[]): Map<string, number> {
  const minutes = new Map<string, number>()
  for (const session of sessions) {
    for (const credit of session.credits) minutes.set(credit.date, (minutes.get(credit.date) ?? 0) + credit.minutes)
  }
  return minutes
}

/** Whether an activity includes a night: a session of it touches more than one local date. Nobody is placed into such an activity who did not ask for it, or whose class it is not. */
export function isOvernight(sessions: readonly { dates: readonly string[] }[]): boolean {
  return sessions.some((session) => session.dates.length > 1)
}

/** A student as the eligibility rules see them. */
export interface StudentOf {
  className: string
  grade: number
}

/** Whether the student is placed into the activity without ranking: their class is one it is fixed for. */
export function isPreAssigned(student: StudentOf, rules: Pick<ItemRules, 'fixedClasses'>): boolean {
  return rules.fixedClasses.includes(student.className)
}

/**
 * Whether an activity is its teachers' alone: no class is fixed for it and
 * it has no places, so nobody is placed into it and nobody ranks it (a
 * supervision, a duty). It counts for its teachers in the planning, offers
 * nothing, and is not in the catalogue students choose from.
 */
export function isStaffOnly(rules: { fixedClasses: readonly string[], places: number }): boolean {
  return rules.fixedClasses.length === 0 && rules.places <= 0
}

/**
 * Whether the student may rank the activity: they are not pre-assigned to
 * it, there are places to rank, and their grade and class pass the rules
 * (an empty list restricts nothing).
 */
export function isEligible(student: StudentOf, rules: ItemRules): boolean {
  if (isPreAssigned(student, rules) || rules.places <= 0) return false
  if (rules.eligibleGrades.length > 0 && !rules.eligibleGrades.includes(student.grade)) return false
  if (rules.eligibleClasses.length > 0 && !rules.eligibleClasses.includes(student.className)) return false
  return true
}
