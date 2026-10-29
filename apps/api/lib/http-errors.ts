import { ApplicationError, ChoiceInvalid, ItemInvalid, PeriodsInvalid, TemplateInvalid } from './errors.ts'

/** Expected application refusals; unexpected errors retain the sanitized 500 handler. */
export function applicationFailure(error: unknown): { status: number, body: object } | undefined {
  if (error instanceof ItemInvalid) return { status: 422, body: { error: 'item_invalid', problems: error.problems, unknownTeachers: error.unknownTeachers } }
  if (error instanceof ChoiceInvalid) return { status: 422, body: { error: 'ranking_invalid', problems: error.problems } }
  if (error instanceof PeriodsInvalid) return { status: 422, body: { error: 'period_grid_invalid', problems: error.problems } }
  if (error instanceof TemplateInvalid) return { status: 422, body: { error: 'template_invalid', problems: error.problems } }
  if (!(error instanceof ApplicationError)) return undefined
  const status = error.code === 'validation_failed'
    ? 400
    : error.code === 'not_found'
      ? 404
      : error.code === 'forbidden' || error.code === 'not_a_student'
        ? 403
        : ['duplicate_group', 'group_label_incomplete', 'invalid_instant', 'window_order', 'grace_order', 'swap_order', 'invalid_date', 'project_day_twice', 'invalid_school_year', 'csv_invalid'].includes(error.code) ? 422 : 409
  return { status, body: { error: error.code, ...(error.detail === undefined ? {} : { message: error.detail }) } }
}
