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
  // Teachers and sessions of an item are replaced as a whole when it is edited.
  item_teacher: { table: ['SELECT', 'INSERT', 'DELETE'] },
  item_session: { table: ['SELECT', 'INSERT', 'DELETE'] },
  // The period grid is replaced as a whole by an administrator, audited.
  period_grid: { table: ['SELECT', 'INSERT', 'DELETE'] },
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
  // Templates are seeded by a migration and edited in the app; a kind a
  // later release adds is inserted by its migration.
  mail_template: { table: ['SELECT'], updateColumns: ['subject', 'body', 'updated_at', 'updated_by'] },
  // A mail is queued and moved through its states by the sender; never removed.
  outbox_mail: { table: ['SELECT', 'INSERT'], updateColumns: ['state', 'attempts', 'detail', 'message_id', 'next_attempt_at', 'updated_at', 'sent_at'] },
}

/** Functions the runtime role may execute, by their signature as PostgreSQL prints a regprocedure: argument types without spaces between them. */
export const RUNTIME_FUNCTIONS: readonly string[] = []

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/
const SIGNATURE = /^[a-z_][a-z0-9_]*\((?:[a-z_][a-z0-9_ ]*(?:,[a-z_][a-z0-9_ ]*)*)?\)$/

/**
 * The GRANT statements for `role`, for the tables and functions that exist.
 * Names come from this file only, and are checked to be plain identifiers,
 * so they need no quoting.
 */
export function grantStatements(role: string, existing: { tables: ReadonlySet<string>, functions: ReadonlySet<string> }): string[] {
  const names = Object.entries(RUNTIME_TABLES).flatMap(([table, grant]) => [table, ...(grant.updateColumns ?? [])])
  const unsafe = [...names.filter((name) => !IDENTIFIER.test(name)), ...RUNTIME_FUNCTIONS.filter((signature) => !SIGNATURE.test(signature))]
  if (unsafe.length > 0) throw new Error(`runtime privileges: not a plain identifier or function signature: ${unsafe.join(', ')}`)
  return [
    ...Object.entries(RUNTIME_TABLES)
      .filter(([table]) => existing.tables.has(table))
      .flatMap(([table, grant]) => tableGrants(role, table, grant)),
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
