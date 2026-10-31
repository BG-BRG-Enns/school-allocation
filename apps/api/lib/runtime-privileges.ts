// Everything the runtime role may do with the objects in schema public, in
// one list. The migrator revokes every table, sequence and function privilege
// from PUBLIC and the runtime role and grants exactly this list on every run,
// after the migrations: PostgreSQL's own defaults (every new function is
// executable by PUBLIC), a restored dump or a grant a newer version no longer
// lists do not survive the next deploy. Deny by default: a table or function
// that is not listed gets nothing, and sequences get nothing at all
// (identity columns need no grant).

export type TablePrivilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' | 'REFERENCES' | 'TRIGGER' | 'MAINTAIN'

export interface TableGrant {
  /** Privileges on the whole table. */
  readonly table: readonly TablePrivilege[]
  /** UPDATE on these columns only. */
  readonly updateColumns?: readonly string[]
}

export const RUNTIME_TABLES: Readonly<Record<string, TableGrant>> = {
  // The migrator's own bookkeeping: the server reads which migrations ran and
  // the schema version, and refuses to start on a schema it was not built for
  // (lib/db.ts checkSchema).
  schema_migrations: { table: ['SELECT'] },
  // Sign-in records a person and refreshes their name, address and the time;
  // the identity itself is never rewritten, and nobody is deleted. Blocking
  // is an administrator's action through the application.
  app_user: { table: ['SELECT', 'INSERT'], updateColumns: ['display_name', 'email', 'last_sign_in_at', 'blocked_at', 'blocked_by'] },
  // A grant is added and revoked, never changed otherwise or removed; a
  // trigger keeps it so whoever writes.
  role_grant: { table: ['SELECT', 'INSERT'], updateColumns: ['revoked_at', 'revoked_by'] },
  // Append-only: events are added and read, never changed or removed.
  audit_event: { table: ['SELECT', 'INSERT'] },
  // A job is started and finished; nothing else about it changes.
  job: { table: ['SELECT', 'INSERT'], updateColumns: ['finished_at', 'outcome'] },
  // A person is an id that is created when a batch is committed; nothing
  // about it changes and nobody is removed.
  person: { table: ['SELECT', 'INSERT'] },
  // A batch is written and decided; a trigger keeps the rest.
  import_batch: { table: ['SELECT', 'INSERT'], updateColumns: ['state', 'decided_at', 'decided_by'] },
  // The labelled groups are replaced as a whole by an administrator, audited.
  roster_group: { table: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
  // An entry is written with its batch and resolved to a person once.
  roster_entry: { table: ['SELECT', 'INSERT'], updateColumns: ['person_id'] },
  // A binding is made and closed, never changed otherwise or removed.
  identity_binding: { table: ['SELECT', 'INSERT'], updateColumns: ['unbound_at', 'unbound_by', 'unbind_reason'] },
  // A campaign is set up, changed while it is being set up, and moved through
  // its states; never removed.
  campaign: {
    table: ['SELECT', 'INSERT'],
    updateColumns: [
      'name', 'school_year', 'project_days', 'config', 'state', 'roster_batch_id', 'updated_at',
      'opens_at', 'closes_at', 'late_until', 'swap_from', 'swap_until', 'wishes_per_group', 'daily_minimum', 'show_teachers', 'reminder_days',
      'place_headroom_percent',
    ],
  },
  // An activity is edited while it is a draft or by an organizer, reviewed,
  // numbered and withdrawn; a draft may be removed (the trigger keeps the rest).
  catalog_item: {
    table: ['SELECT', 'INSERT', 'DELETE'],
    updateColumns: [
      'number', 'title', 'description', 'location', 'fee_cents', 'fee_note', 'places', 'min_participants', 'cancellable_below_min',
      'fixed_classes', 'eligible_grades', 'eligible_classes', 'state', 'updated_at', 'review_note', 'approved_at', 'approved_by',
      'withdrawn_at', 'withdrawn_by', 'withdraw_reason',
    ],
  },
  // Teachers of an item are replaced as a whole when it is edited; sessions too when their times change, else a
  // session keeps its id (the attendance refers to it) and only its location is written.
  item_teacher: { table: ['SELECT', 'INSERT', 'DELETE'] },
  item_session: { table: ['SELECT', 'INSERT', 'DELETE'], updateColumns: ['location'] },
  // The period grid is replaced as a whole by an administrator, audited.
  period_grid: { table: ['SELECT', 'INSERT', 'DELETE'] },
  // A teacher's availability on a day: set by the teacher or an organizer (audited), removed when available again or
  // with the school year's records.
  teacher_availability: { table: ['SELECT', 'INSERT', 'DELETE'], updateColumns: ['status', 'updated_at'] },
  // The school's one row of settings: its language changed by an administrator, sending paused and resumed by an
  // organizer or administrator, audited; it is never added or removed.
  school_setting: { table: ['SELECT'], updateColumns: ['locale', 'updated_at', 'updated_by', 'mail_paused'] },
  // A class teacher is assigned and revoked, never changed otherwise or
  // removed; a trigger keeps it so whoever writes.
  class_teacher: { table: ['SELECT', 'INSERT'], updateColumns: ['revoked_at', 'revoked_by'] },
  // A pre-assignment is made when the window opens and exempted by an
  // organizer; a placement by class goes when the class is no longer fixed
  // (the trigger keeps the rest).
  pre_assignment: { table: ['SELECT', 'INSERT', 'DELETE'], updateColumns: ['exempted_at', 'exempted_by', 'exempt_reason'] },
  // A ranking is replaced as a whole on every save; its revisions are
  // appended and never touched.
  choice: { table: ['SELECT', 'INSERT'], updateColumns: ['ranking', 'saved_in', 'version', 'updated_at', 'entered_by'] },
  choice_revision: { table: ['SELECT', 'INSERT'] },
  // A row is the text an organizer saved for a kind, in the language it was written in, replaced by the next save; the
  // reset removes it, and the catalogue's default applies again. Never truncated (the trigger refuses it).
  mail_template: { table: ['SELECT', 'INSERT', 'DELETE'], updateColumns: ['subject', 'body', 'locale', 'updated_at', 'updated_by'] },
  // A mail is queued and moved through its states by the sender; never removed.
  outbox_mail: { table: ['SELECT', 'INSERT'], updateColumns: ['state', 'attempts', 'detail', 'message_id', 'next_attempt_at', 'updated_at', 'sent_at', 'claimed_at', 'expires_at'] },
  allocation_run: {
    table: ['SELECT', 'INSERT'],
    updateColumns: ['status', 'finished_at', 'solver_version', 'ortools_version', 'passes', 'cancelled_items', 'failure', 'detail', 'problems', 'published_at', 'published_by'],
  },
  // A row is added by a run or a change and superseded by a change, once; never removed (the trigger keeps the rest).
  assignment: { table: ['SELECT', 'INSERT'], updateColumns: ['superseded_by'] },
  // A change after publication is written once and read; never changed or removed.
  assignment_change: { table: ['SELECT', 'INSERT'] },
  // Attendance is recorded and corrected in place; never removed (the trigger keeps the rest). It names a session by its
  // item and position, so the previous release's rewrite of an item's sessions keeps it.
  attendance: { table: ['SELECT', 'INSERT'], updateColumns: ['status', 'note', 'recorded_by', 'recorded_at'] },
}

/** Functions the runtime role may execute, by their signature as PostgreSQL prints a regprocedure: argument types without spaces between them. */
export const RUNTIME_FUNCTIONS: readonly string[] = [
  // The application's clock (0012): every time it writes or compares, and the columns' defaults, so every insert needs it.
  'app_now()',
  // The retention purge (0010): a definer function owned by the migrator, the one path through the guards; the service checks the date and the reason and writes the audit event.
  'purge_school_year(text)',
  // The guards' refusal (0001): a trigger runs as the role that writes, so the runtime role meets a guard's rule as SQLSTATE 55000 with
  // its words rather than as a permission error on the function. It raises and returns nothing.
  'refuse(text)',
]

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/
const SIGNATURE = /^[a-z_][a-z0-9_]*\((?:[a-z_][a-z0-9_ ]*(?:,[a-z_][a-z0-9_ ]*)*)?\)$/

/** Every column the list grants UPDATE on, as `table.column`. */
export function listedColumns(): string[] {
  return Object.entries(RUNTIME_TABLES).flatMap(([table, grant]) => (grant.updateColumns ?? []).map((column) => `${table}.${column}`))
}

/**
 * The GRANT statements for `role`, for the tables, columns (`table.column`)
 * and functions that exist. Names come from this file only, and are checked
 * to be plain identifiers, so they need no quoting.
 */
export function grantStatements(role: string, existing: { tables: ReadonlySet<string>, columns: ReadonlySet<string>, functions: ReadonlySet<string> }): string[] {
  const names = Object.entries(RUNTIME_TABLES).flatMap(([table, grant]) => [table, ...(grant.updateColumns ?? [])])
  const unsafe = [...names.filter((name) => !IDENTIFIER.test(name)), ...RUNTIME_FUNCTIONS.filter((signature) => !SIGNATURE.test(signature))]
  if (unsafe.length > 0) throw new Error(`runtime privileges: not a plain identifier or function signature: ${unsafe.join(', ')}`)
  return [
    ...Object.entries(RUNTIME_TABLES)
      .filter(([table]) => existing.tables.has(table))
      .flatMap(([table, grant]) => tableGrants(role, table, { ...grant, updateColumns: grant.updateColumns?.filter((column) => existing.columns.has(`${table}.${column}`)) })),
    ...RUNTIME_FUNCTIONS
      .filter((signature) => existing.functions.has(signature))
      .map((signature) => `grant execute on function ${signature} to ${role}`),
  ]
}

function tableGrants(role: string, table: string, grant: TableGrant): string[] {
  const statements: string[] = []
  if (grant.table.length > 0) statements.push(`grant ${grant.table.join(', ').toLowerCase()} on table ${table} to ${role}`)
  if (grant.updateColumns?.length) statements.push(`grant update (${grant.updateColumns.join(', ')}) on table ${table} to ${role}`)
  return statements
}
