// The German words for the API's codes. One place, so a code the API adds
// without a label is noticed in review and a test can check coverage.

/** The privileged roles (apps/api/lib/roles.ts), as the account page names them. */
export const ROLE_LABELS: Readonly<Record<string, string>> = {
  school_admin: 'Administration',
  campaign_organizer: 'Organisation einer Wahl',
  read_only_auditor: 'Einsicht (nur lesen)',
}

/** Student or teacher (school-core PERSON_KINDS). */
export const KIND_LABELS: Readonly<Record<string, string>> = {
  student: 'Schüler/in',
  teacher: 'Lehrkraft',
}

/** Where a batch came from (apps/api/lib/models/roster.ts BATCH_SOURCES). */
export const SOURCE_LABELS: Readonly<Record<string, string>> = {
  'graph:groups': 'Entra-Gruppen',
  'csv': 'CSV-Datei',
}

/** What became of a batch (BATCH_STATES). */
export const BATCH_STATE_LABELS: Readonly<Record<string, string>> = {
  pending: 'Zur Prüfung',
  committed: 'Übernommen',
  discarded: 'Verworfen',
  rejected: 'Abgelehnt',
}

/** Why a batch or a row was refused (school-core ROSTER_PROBLEM_CODES). */
export const PROBLEM_LABELS: Readonly<Record<string, string>> = {
  empty_roster: 'Die Liste enthält niemanden',
  no_key: 'Weder Objekt-ID noch E-Mail-Adresse',
  duplicate_key: 'Dieselbe Person kommt zweimal vor',
  duplicate_address: 'Dieselbe E-Mail-Adresse bei zwei Personen',
  both_kinds: 'Dieselbe Person als Schüler/in und als Lehrkraft',
  student_without_class: 'Schüler/in ohne Klasse oder Schulstufe',
  teacher_with_class: 'Lehrkraft mit Klasse oder Schulstufe',
  invalid_class_name: 'Ungültige Klassenbezeichnung',
  invalid_grade: 'Ungültige Schulstufe (1 bis 13)',
  invalid_address: 'Ungültige E-Mail-Adresse',
  invalid_name: 'Ungültiger Name',
  invalid_kind: 'Ungültige Art (student oder teacher)',
}

/** What an accepted batch should be looked at for (apps/api/lib/models/roster.ts RosterWarning). */
export const WARNING_LABELS: Readonly<Record<string, string>> = {
  no_address: 'Ohne E-Mail-Adresse: Benachrichtigungen erreichen diese Person nicht',
}

/** The fields a diff names (school-core ChangedField). */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  kind: 'Art',
  displayName: 'Name',
  className: 'Klasse',
  grade: 'Schulstufe',
  mail: 'E-Mail',
  classTeacherMail: 'Klassenvorstand',
}

/** A campaign's lifecycle state (school-core CAMPAIGN_STATES). */
export const CAMPAIGN_STATE_LABELS: Readonly<Record<string, string>> = {
  draft: 'In Vorbereitung',
  catalogue: 'Aktivitäten werden gesammelt',
  published: 'Katalog veröffentlicht',
  open: 'Wahl läuft',
  grace: 'Nachfrist',
  closed: 'Wahl beendet',
  allocating: 'Zuteilung läuft',
  review: 'Zuteilung in Prüfung',
  results: 'Ergebnis veröffentlicht',
  archived: 'Abgeschlossen',
}

/** An activity's state (school-core ITEM_STATES). */
export const ITEM_STATE_LABELS: Readonly<Record<string, string>> = {
  draft: 'Entwurf',
  proposed: 'Eingereicht',
  approved: 'Genehmigt',
  withdrawn: 'Zurückgezogen',
}

/** Why an activity was refused (school-core CATALOGUE_PROBLEM_CODES). */
export const CATALOGUE_PROBLEM_LABELS: Readonly<Record<string, string>> = {
  no_sessions: 'Mindestens ein Termin ist nötig',
  session_ends_before_start: 'Ein Termin endet vor seinem Beginn',
  session_outside_project_days: 'Ein Termin liegt außerhalb der Projekttage',
  sessions_overlap: 'Zwei Termine der Aktivität überschneiden sich',
  credit_date_outside_session: 'Angerechnete Minuten für einen Tag, an dem der Termin nicht stattfindet',
  credit_date_twice: 'Ein Tag ist bei einem Termin zweimal angerechnet',
  credit_minutes_invalid: 'Angerechnete Minuten müssen eine ganze Zahl zwischen 0 und 1440 sein',
  no_credit: 'Ein Termin rechnet keine Minuten an',
  min_above_places: 'Die Mindestteilnehmerzahl ist größer als die Plätze',
  fixed_item_cancellable: 'Eine Aktivität für fixe Klassen findet immer statt und kann nicht abgesagt werden',
  fixed_class_unknown: 'Eine fixe Klasse gibt es in der Personenliste nicht',
  eligible_class_unknown: 'Eine wählbare Klasse gibt es in der Personenliste nicht',
  fixed_class_also_eligible: 'Eine Klasse ist fix zugeteilt und zugleich als wählbar eingetragen',
  no_teacher: 'Mindestens eine Lehrkraft ist nötig',
  teacher_twice: 'Eine Lehrkraft ist zweimal eingetragen',
}

/** Why a ranking was refused (school-core RANKING_PROBLEM_CODES). */
export const RANKING_PROBLEM_LABELS: Readonly<Record<string, string>> = {
  unknown_group: 'Eine Zeitgruppe steht nicht zur Wahl',
  unknown_item: 'Eine Aktivität steht in dieser Zeitgruppe nicht zur Wahl',
  item_twice: 'Eine Aktivität ist zweimal gereiht',
  too_many_wishes: 'Mehr Wünsche als erlaubt',
}

/** The state of a student's list (packages/api-contracts/src/choices.ts ChoiceState). */
export const CHOICE_STATE_LABELS: Readonly<Record<string, string>> = {
  none: 'keine Wünsche',
  incomplete: 'unvollständig',
  complete: 'vollständig',
}

/** The window a list was saved in. */
export const WINDOW_LABELS: Readonly<Record<string, string>> = {
  first: 'Anmeldefenster',
  late: 'Nachfrist',
}

/** The kinds of mail the window sends (packages/api-contracts/src/mail.ts MAIL_KINDS). */
export const MAIL_KIND_LABELS: Readonly<Record<string, string>> = {
  choice_invitation: 'Einladung zur Wahl',
  choice_reminder: 'Erinnerung vor Ende der Wahl',
  grace_invitation: 'Einladung zur Nachfrist',
  grace_reminder: 'Erinnerung vor Ende der Nachfrist',
  missed_deadline: 'Frist versäumt',
  class_missing: 'Fehlende Wünsche an den Klassenvorstand',
  result_published: 'Ergebnis veröffentlicht',
  class_unplaced: 'Nicht vollständig zugeteilte Schüler/innen an den Klassenvorstand',
  item_cancelled: 'Aktivität abgesagt (an die Lehrkräfte)',
  swap_confirmed: 'Tausch bestätigt',
  assignment_changed: 'Zuteilung geändert (durch Klassenvorstand oder Organisation)',
}

/** What became of an allocation run (packages/api-contracts/src/allocation.ts RUN_STATUSES). */
export const RUN_STATUS_LABELS: Readonly<Record<string, string>> = {
  running: 'läuft',
  succeeded: 'fertig',
  failed: 'fehlgeschlagen',
  interrupted: 'unterbrochen',
}

/** Why a run failed (RUN_FAILURE_CODES). */
export const RUN_FAILURE_LABELS: Readonly<Record<string, string>> = {
  solver_unreachable: 'Der Solver war nicht erreichbar',
  solver_answer_invalid: 'Die Antwort des Solvers entsprach nicht dem Vertrag',
  solver_infeasible: 'Keine Zuteilung erfüllt alle harten Regeln (meist eine Mindestteilnehmerzahl, die nicht absagbar ist)',
  solver_unknown: 'Der Solver fand im Zeitlimit keine Lösung',
  model_invalid: 'Das Modell war für den Solver nicht verwendbar',
  validation_failed: 'Die Prüfung des Ergebnisses ist fehlgeschlagen; es wurde verworfen',
  internal_error: 'Ein interner Fehler; die Protokolle des Servers sagen mehr',
}

/** The solver's answer per pass (school-core SOLVE_STATUSES). */
export const SOLVE_STATUS_LABELS: Readonly<Record<string, string>> = {
  OPTIMAL: 'optimal',
  FEASIBLE: 'gültig, nicht bewiesen',
  INFEASIBLE: 'unlösbar',
  UNKNOWN: 'keine Lösung im Zeitlimit',
  MODEL_INVALID: 'Modell ungültig',
}

/** A level of the lexicographic objective (school-core levelNames); a threshold level is labelled by its number. */
export function levelLabel(name: string): string {
  if (name === 'students_with_deficit') return 'Schüler/innen mit fehlenden Minuten'
  if (name === 'deficit_minutes') return 'Fehlende Minuten insgesamt'
  if (name === 'total_cost') return 'Gesamtkosten (gewichtete Wunschnummern)'
  if (name === 'tiebreak') return 'Los'
  if (name.startsWith('over:')) return `Schüler/innen mit Durchschnittswunsch über ${Number(name.slice(5)) / 1000}`
  return name
}

/** Why the validator refused a result (school-core ALLOCATION_PROBLEM_CODES). */
export const ALLOCATION_PROBLEM_LABELS: Readonly<Record<string, string>> = {
  pass_not_solved: 'Ein Durchgang wurde nicht gelöst',
  status_inconsistent: 'Der gemeldete Status passt nicht zu den Stufen',
  levels_unexpected: 'Die Stufen der Antwort passen nicht zur Anfrage',
  cancelled_twice: 'Eine Aktivität ist zweimal abgesagt',
  level_mismatch: 'Ein Stufenwert stimmt mit der Nachrechnung nicht überein',
  not_in_pass: 'Zuteilung an jemanden, der in diesem Durchgang nicht vorkommt',
  unknown_item: 'Eine Aktivität, die es in der Anfrage nicht gibt',
  assigned_twice: 'Eine Zuteilung kommt zweimal vor',
  not_an_option: 'Eine Aktivität, die weder gewünscht noch Ersatz war',
  paid_fallback: 'Eine Aktivität mit Beitrag als Ersatzplatz',
  cancelled_not_cancellable: 'Eine Aktivität abgesagt, die nicht abgesagt werden darf',
  assigned_to_cancelled: 'Zuteilung an eine abgesagte Aktivität',
  capacity_exceeded: 'Mehr Zuteilungen als Plätze',
  below_minimum: 'Weniger Zuteilungen als das Minimum',
  overlap: 'Zwei Aktivitäten überschneiden sich',
  overlaps_fixed: 'Eine Aktivität überschneidet sich mit einer Klassenaktivität',
  first_pass_changed: 'Der zweite Durchgang hat den ersten verändert',
  pre_assignment_missing: 'Eine Klassenzuteilung fehlt',
  pre_assignment_changed: 'Eine Klassenzuteilung wurde verändert',
  assignment_mismatch: 'Die gespeicherten Zeilen passen nicht zum Ergebnis',
}

/** The source of a student's place (school-core ASSIGNMENT_SOURCES). */
export const ASSIGNMENT_SOURCE_LABELS: Readonly<Record<string, string>> = {
  fixed: 'Klassenaktivität',
  wish: 'Wunsch',
  fallback: 'Ersatzplatz',
  swap: 'Tausch',
  manual: 'händisch',
}

/** A change of the published run (packages/api-contracts/src/publication.ts CHANGE_KINDS). */
export const CHANGE_KIND_LABELS: Readonly<Record<string, string>> = {
  swap: 'Tausch',
  place: 'Zuteilung',
  move: 'Umsetzung',
  remove: 'Herausnahme',
}

/** Why a move after publication is refused (school-core MOVE_PROBLEM_CODES), as the pages say it next to the item. */
export const MOVE_PROBLEM_LABELS: Readonly<Record<string, string>> = {
  not_offered: 'steht nicht zur Wahl',
  already_placed: 'schon zugeteilt',
  item_full: 'voll',
  not_placed: 'nicht zugeteilt',
  leaves_fixed: 'Klassenaktivität bleibt',
  below_minimum: 'die bisherige Aktivität käme unter ihr Minimum',
  overlap: 'überschneidet sich',
  coverage_lost: 'es würden Minuten fehlen',
  fills_nothing: 'füllt keine Lücke',
}

/** What was recorded for a student in a session (packages/api-contracts/src/attendance.ts ATTENDANCE_STATUSES). */
export const ATTENDANCE_STATUS_LABELS: Readonly<Record<string, string>> = {
  present: 'anwesend',
  absent: 'abwesend',
  excused: 'entschuldigt',
}

/** The state of a mail in the outbox (apps/api/lib/mail/outbox.ts MAIL_STATES). */
export const MAIL_STATE_LABELS: Readonly<Record<string, string>> = {
  queued: 'in der Warteschlange',
  sending: 'wird gesendet',
  sent: 'gesendet',
  failed: 'fehlgeschlagen',
}

/** Why a template was refused (apps/api/lib/models/mail-templates.ts TemplateProblem). */
export const TEMPLATE_PROBLEM_LABELS: Readonly<Record<string, string>> = {
  subject_syntax: 'Betreff: Fehler in einem Platzhalter',
  body_syntax: 'Text: Fehler in einem Platzhalter',
  unknown_placeholder: 'Unbekannter Platzhalter',
  subject_empty: 'Der Betreff darf nicht leer werden',
}

/** Why a period grid was refused (school-core PERIOD_PROBLEM_CODES). */
export const PERIOD_PROBLEM_LABELS: Readonly<Record<string, string>> = {
  no_periods: 'Mindestens eine Einheit ist nötig',
  period_numbering: 'Die Einheiten sind ohne Lücke von 1 an zu nummerieren',
  period_time_invalid: 'Eine Uhrzeit ist keine (HH:MM)',
  period_ends_before_start: 'Eine Einheit endet nicht nach ihrem Beginn',
  periods_overlap: 'Eine Einheit beginnt, bevor die vorige endet',
}

/** What went wrong with a roster refresh from Entra groups, as the callback reports it in the page's query. */
export const REFRESH_ERROR_LABELS: Readonly<Record<string, string>> = {
  state_mismatch: 'Die Rückkehr von Microsoft passte nicht zu diesem Browser. Bitte noch einmal starten.',
  no_pending_refresh: 'Es war keine Aktualisierung gestartet, oder sie ist abgelaufen. Bitte noch einmal starten.',
  graph_authorization_failed: 'Die Berechtigung für Microsoft Graph wurde nicht erteilt oder passt nicht zu Ihrem Konto.',
  graph_unauthorized: 'Microsoft Graph hat das Token nicht angenommen.',
  graph_forbidden: 'Microsoft Graph verweigert das Lesen der Gruppen. Fehlen die Berechtigungen (GroupMember.Read.All, User.ReadBasic.All) oder die Zustimmung der IT?',
  graph_not_found: 'Eine der Gruppen gibt es in Entra nicht (mehr). Bitte die Gruppen-IDs prüfen.',
  graph_failed: 'Microsoft Graph hat nicht geantwortet. Bitte später noch einmal versuchen.',
  import_failed: 'Der Import ist fehlgeschlagen.',
}
