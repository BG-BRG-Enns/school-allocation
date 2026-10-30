import type { CatalogueProblem, MoveProblemCode, PeriodProblemCode, RankingProblem } from '@school-allocation/school-core'
import type { TemplateProblem } from './models/mail-templates.ts'

/** Stable refusal codes shared by application operations. HTTP status mapping belongs to the adapter. */
export type ApplicationErrorCode = 'no_groups' | 'validation_failed' | 'duplicate_group' | 'group_label_incomplete' | 'invalid_date' | 'project_day_twice' | 'invalid_school_year' | 'csv_invalid' | 'mail_off' | 'no_address' | 'already_blocked' | 'already_bound' | 'already_exempted' | 'already_granted' | 'already_revoked' | 'batch_not_pending' | 'batch_superseded' | 'campaign_state' | 'cannot_block_self' | 'cannot_revoke_self' | 'class_unknown' | 'forbidden' | 'grace_order' | 'invalid_instant' | 'invalid_item_transition' | 'invalid_transition' | 'item_state' | 'last_admin' | 'no_roster' | 'not_a_student' | 'not_blocked' | 'not_due' | 'not_found' | 'sessions_outside_days' | 'swap_order' | 'teacher_unknown' | 'transition_not_available' | 'window_order'
  | 'solver_off' | 'run_in_progress' | 'daily_minimum_missing' | 'no_students' | 'fixed_items_overlap'
  | 'run_not_publishable' | 'run_stale' | 'cancelled_mismatch' | 'not_published'
  | 'swap_closed' | 'fully_placed' | 'no_change' | MoveProblemCode

/** A change the current state refuses; `code` is the answer's error code. */
export class ApplicationError extends Error {
  override name = 'ApplicationError'
  readonly code: ApplicationErrorCode
  readonly detail?: string
  constructor(code: ApplicationErrorCode, detail?: string) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

/** Why an activity was refused: the rules it breaks, or a teacher who is not one of the roster's. */
export class ItemInvalid extends Error {
  override name = 'ItemInvalid'
  readonly problems: CatalogueProblem[]
  readonly unknownTeachers: string[]
  constructor(problems: CatalogueProblem[], unknownTeachers: string[] = []) {
    super('item_invalid')
    this.problems = problems
    this.unknownTeachers = unknownTeachers
  }
}

/** A ranking breaks the rules; the problems are school-core's. */
export class ChoiceInvalid extends Error {
  override name = 'ChoiceInvalid'
  readonly problems: RankingProblem[]
  constructor(problems: RankingProblem[]) {
    super('ranking_invalid')
    this.problems = problems
  }
}

/** The grid as entered breaks the rules; the codes are school-core's. */
export class PeriodsInvalid extends Error {
  override name = 'PeriodsInvalid'
  readonly problems: PeriodProblemCode[]
  constructor(problems: PeriodProblemCode[]) {
    super('period_grid_invalid')
    this.problems = problems
  }
}

/** The template as entered breaks the rules; the problems say which. */
export class TemplateInvalid extends Error {
  override name = 'TemplateInvalid'
  readonly problems: TemplateProblem[]
  constructor(problems: TemplateProblem[]) {
    super('template_invalid')
    this.problems = problems
  }
}

/** Route-facing operations require a subject; optional DAO lookups remain explicit. */
export function requireFound<T>(value: T | undefined): T {
  if (value === undefined) throw new ApplicationError('not_found')
  return value
}
