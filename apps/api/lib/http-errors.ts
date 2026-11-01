import { ApplicationError, type ApplicationErrorCode, ChoiceInvalid, ItemInvalid, PeriodsInvalid, RulesInvalid, TeacherListInvalid, TemplateInvalid } from './errors.ts'

/** Every new application code must choose its HTTP status at compile time. */
export const APPLICATION_ERROR_STATUS = {
  already_blocked: 409,
  already_bound: 409,
  already_exempted: 409,
  already_granted: 409,
  already_placed: 409,
  already_revoked: 409,
  batch_not_pending: 409,
  batch_superseded: 409,
  below_minimum: 422,
  campaign_state: 409,
  cancelled_mismatch: 409,
  cannot_block_self: 409,
  cannot_revoke_self: 409,
  category_exists: 409,
  category_in_use: 409,
  category_unknown: 422,
  class_unknown: 404,
  coverage_lost: 422,
  csv_invalid: 422,
  csv_file_invalid: 422,
  daily_minimum_missing: 422,
  duplicate_group: 422,
  fills_nothing: 422,
  fixed_items_overlap: 422,
  forbidden: 403,
  fully_placed: 409,
  grace_order: 422,
  group_label_incomplete: 422,
  invalid_date: 422,
  invalid_instant: 422,
  invalid_item_transition: 409,
  invalid_school_year: 422,
  invalid_transition: 409,
  item_full: 409,
  item_state: 409,
  last_admin: 409,
  leaves_fixed: 422,
  mail_off: 409,
  no_address: 409,
  no_change: 422,
  no_groups: 409,
  no_roster: 422,
  no_students: 422,
  not_a_student: 403,
  not_assigned: 422,
  not_blocked: 409,
  not_due: 409,
  not_found: 404,
  not_offered: 422,
  not_placed: 422,
  not_published: 409,
  overlap: 422,
  project_day_twice: 422,
  retention_not_reached: 409,
  run_in_progress: 409,
  run_not_publishable: 409,
  rule_lost: 422,
  run_stale: 409,
  sessions_outside_days: 409,
  solver_off: 409,
  swap_closed: 409,
  swap_order: 422,
  teacher_unknown: 422,
  too_many_categories: 409,
  transition_not_available: 409,
  validation_failed: 400,
  window_order: 422,
} as const satisfies Record<ApplicationErrorCode, 400 | 403 | 404 | 409 | 422>

/** Expected application refusals; unexpected errors retain the sanitized 500 handler. */
export function applicationFailure(error: unknown): { status: number, body: object } | undefined {
  if (error instanceof ItemInvalid) return { status: 422, body: { error: 'item_invalid', problems: error.problems, unknownTeachers: error.unknownTeachers } }
  if (error instanceof ChoiceInvalid) return { status: 422, body: { error: 'ranking_invalid', problems: error.problems } }
  if (error instanceof RulesInvalid) return { status: 422, body: { error: 'rules_invalid', problems: error.problems } }
  if (error instanceof PeriodsInvalid) return { status: 422, body: { error: 'period_grid_invalid', problems: error.problems } }
  if (error instanceof TeacherListInvalid) return { status: 422, body: { error: 'teacher_list_invalid', problems: error.problems } }
  if (error instanceof TemplateInvalid) return { status: 422, body: { error: 'template_invalid', problems: error.problems } }
  if (!(error instanceof ApplicationError)) return undefined
  const status = APPLICATION_ERROR_STATUS[error.code]
  return { status, body: { error: error.code, ...(error.detail === undefined ? {} : { message: error.detail }) } }
}
