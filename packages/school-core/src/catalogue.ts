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

/** A local date, YYYY-MM-DD. */
export const LOCAL_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** A span of time with the local dates it touches, as the caller computed them in the school's time zone. */
export interface Span {
  startMs: number
  endMs: number
  /** Every local date from the one `startMs` falls on to the one `endMs` falls on (an end at midnight belongs to the day before). */
  dates: string[]
}

/** The minutes a session earns on one project day: given by the teacher, not derived from the clock, since travel and breaks do not count. */
export interface Credit {
  date: string
  minutes: number
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
}

export interface ItemContext {
  /** The campaign's project days, local dates. */
  projectDays: string[]
  /** The class names of the roster in force. */
  classes: string[]
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
  'min_above_places',
  'fixed_item_cancellable',
  'fixed_class_unknown',
  'eligible_class_unknown',
  'fixed_class_also_eligible',
  'no_teacher',
  'teacher_twice',
] as const
export type CatalogueProblemCode = typeof CATALOGUE_PROBLEM_CODES[number]

export interface CatalogueProblem {
  code: CatalogueProblemCode
  /** The session the problem is about, counted from 0. */
  session?: number
}

/** A day has this many minutes; a credit above it is a typo. */
const MINUTES_PER_DAY = 24 * 60

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
    if (session.credits.every((credit) => credit.minutes <= 0)) problems.push({ code: 'no_credit', session: index })
  })
  for (let i = 0; i < item.sessions.length; i++) {
    for (let j = i + 1; j < item.sessions.length; j++) {
      if (overlaps(item.sessions[i] as Span, item.sessions[j] as Span)) problems.push({ code: 'sessions_overlap', session: j })
    }
  }
  const { rules } = item
  if (rules.minParticipants > rules.places) problems.push({ code: 'min_above_places' })
  if (rules.fixedClasses.length > 0 && rules.cancellableBelowMin) problems.push({ code: 'fixed_item_cancellable' })
  if (rules.fixedClasses.some((name) => !classes.has(name))) problems.push({ code: 'fixed_class_unknown' })
  if (rules.eligibleClasses.some((name) => !classes.has(name))) problems.push({ code: 'eligible_class_unknown' })
  if (rules.eligibleClasses.some((name) => rules.fixedClasses.includes(name))) problems.push({ code: 'fixed_class_also_eligible' })
  if (item.teachers.length === 0) problems.push({ code: 'no_teacher' })
  if (new Set(item.teachers).size !== item.teachers.length) problems.push({ code: 'teacher_twice' })
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
