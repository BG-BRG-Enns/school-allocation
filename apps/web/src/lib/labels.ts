// The words for the API's codes, by the names the pages know them: views
// onto the catalogue's `labels` (packages/messages), so a code the API adds
// without a label is noticed in review and a test can check coverage.

import { t } from './i18n.ts'

/** The privileged roles (apps/api/lib/roles.ts), as the account page names them. */
export const ROLE_LABELS: Readonly<Record<string, string>> = t.labels.role

/** Student or teacher (school-core PERSON_KINDS). */
export const KIND_LABELS: Readonly<Record<string, string>> = t.labels.kind

/** Where a batch came from (apps/api/lib/models/roster.ts BATCH_SOURCES). */
export const SOURCE_LABELS: Readonly<Record<string, string>> = t.labels.batchSource

/** What became of a batch (BATCH_STATES). */
export const BATCH_STATE_LABELS: Readonly<Record<string, string>> = t.labels.batchState

/** Why a batch or a row was refused (school-core ROSTER_PROBLEM_CODES). */
export const PROBLEM_LABELS: Readonly<Record<string, string>> = t.labels.rosterProblem

/** What an accepted batch should be looked at for (apps/api/lib/models/roster.ts RosterWarning). */
export const WARNING_LABELS: Readonly<Record<string, string>> = t.labels.rosterWarning

/** The fields a diff names (school-core ChangedField). */
export const FIELD_LABELS: Readonly<Record<string, string>> = t.labels.field

/** A campaign's lifecycle state (school-core CAMPAIGN_STATES). */
export const CAMPAIGN_STATE_LABELS: Readonly<Record<string, string>> = t.labels.campaignState

/** An activity's state (school-core ITEM_STATES). */
export const ITEM_STATE_LABELS: Readonly<Record<string, string>> = t.labels.itemState

/** Why an activity was refused (school-core CATALOGUE_PROBLEM_CODES). */
export const CATALOGUE_PROBLEM_LABELS: Readonly<Record<string, string>> = t.labels.catalogueProblem

/** Why a ranking was refused (school-core RANKING_PROBLEM_CODES). */
export const RANKING_PROBLEM_LABELS: Readonly<Record<string, string>> = t.labels.rankingProblem

/** The state of a student's list (packages/api-contracts/src/choices.ts ChoiceState). */
export const CHOICE_STATE_LABELS: Readonly<Record<string, string>> = t.labels.choiceState

/** The window a list was saved in. */
export const WINDOW_LABELS: Readonly<Record<string, string>> = t.labels.window

/** The kinds of mail the window sends (packages/api-contracts/src/mail.ts MAIL_KINDS). */
export const MAIL_KIND_LABELS: Readonly<Record<string, string>> = t.labels.mailKind

/** What became of an allocation run (packages/api-contracts/src/allocation.ts RUN_STATUSES). */
export const RUN_STATUS_LABELS: Readonly<Record<string, string>> = t.labels.runStatus

/** Why a run failed (RUN_FAILURE_CODES). */
export const RUN_FAILURE_LABELS: Readonly<Record<string, string>> = t.labels.runFailure

/** The solver's answer per pass (school-core SOLVE_STATUSES). */
export const SOLVE_STATUS_LABELS: Readonly<Record<string, string>> = t.labels.solveStatus

/** A level of the lexicographic objective (school-core levelNames); a threshold level is labelled by its number. */
export function levelLabel(name: string): string {
  const level = t.labels.level
  if (name === 'students_with_deficit') return level.students_with_deficit
  if (name === 'deficit_minutes') return level.deficit_minutes
  if (name === 'students_missing_rule') return level.students_missing_rule
  if (name === 'rule_missing_items') return level.rule_missing_items
  if (name === 'rule_missing_minutes') return level.rule_missing_minutes
  if (name === 'total_cost') return level.total_cost
  if (name === 'tiebreak') return level.tiebreak
  if (name.startsWith('over:')) return level.over(Number(name.slice(5)) / 1000)
  return name
}

/** Why the validator refused a result (school-core ALLOCATION_PROBLEM_CODES). */
export const ALLOCATION_PROBLEM_LABELS: Readonly<Record<string, string>> = t.labels.allocationProblem

/** The source of a student's place (school-core ASSIGNMENT_SOURCES). */
export const ASSIGNMENT_SOURCE_LABELS: Readonly<Record<string, string>> = t.labels.assignmentSource

/** A change of the published run (packages/api-contracts/src/publication.ts CHANGE_KINDS). */
export const CHANGE_KIND_LABELS: Readonly<Record<string, string>> = t.labels.changeKind

/** Why a move after publication is refused (school-core MOVE_PROBLEM_CODES), as the pages say it next to the item. */
export const MOVE_PROBLEM_LABELS: Readonly<Record<string, string>> = t.labels.moveProblem

/** What was recorded for a student in a session (packages/api-contracts/src/attendance.ts ATTENDANCE_STATUSES). */
export const ATTENDANCE_STATUS_LABELS: Readonly<Record<string, string>> = t.labels.attendanceStatus

/** A teacher on a project day (school-core AVAILABILITY_STATUSES). */
export const AVAILABILITY_LABELS: Readonly<Record<string, string>> = t.labels.availability

/** The state of a mail in the outbox (apps/api/lib/mail/outbox.ts MAIL_STATES). */
export const MAIL_STATE_LABELS: Readonly<Record<string, string>> = t.labels.mailState

/** Why a template was refused (apps/api/lib/models/mail-templates.ts TemplateProblem). */
export const TEMPLATE_PROBLEM_LABELS: Readonly<Record<string, string>> = t.labels.templateProblem

/** Why a registration's rules were refused (school-core RULE_PROBLEM_CODES). */
export const RULE_PROBLEM_LABELS: Readonly<Record<string, string>> = t.labels.ruleProblem

/** What a rule counts (school-core RULE_UNITS). */
export const RULE_UNIT_LABELS: Readonly<Record<string, string>> = t.labels.ruleUnit

/** Why a period grid was refused (school-core PERIOD_PROBLEM_CODES). */
export const PERIOD_PROBLEM_LABELS: Readonly<Record<string, string>> = t.labels.periodProblem

/** What went wrong with a roster refresh from Entra groups, as the callback reports it in the page's query. */
export const REFRESH_ERROR_LABELS: Readonly<Record<string, string>> = t.labels.refreshError
