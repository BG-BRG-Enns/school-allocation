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

/** Where a batch came from (apps/api/lib/roster.ts BATCH_SOURCES). */
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

/** What an accepted batch should be looked at for (apps/api/lib/roster.ts RosterWarning). */
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

/** What went wrong with a roster refresh from Entra groups, as the callback reports it in the page's query. */
export const REFRESH_ERROR_LABELS: Readonly<Record<string, string>> = {
  state_mismatch: 'Die Rückkehr von Microsoft passte nicht zu diesem Browser. Bitte noch einmal starten.',
  no_pending_refresh: 'Es war keine Aktualisierung gestartet, oder sie ist abgelaufen. Bitte noch einmal starten.',
  graph_authorization_failed: 'Die Berechtigung für Microsoft Graph wurde nicht erteilt oder passt nicht zu Ihrem Konto.',
  graph_unauthorized: 'Microsoft Graph hat das Token nicht angenommen.',
  graph_forbidden: 'Microsoft Graph verweigert das Lesen der Gruppen. Fehlt die Berechtigung (GroupMember.Read.All) oder die Zustimmung der IT?',
  graph_not_found: 'Eine der Gruppen gibt es in Entra nicht (mehr). Bitte die Gruppen-IDs prüfen.',
  graph_failed: 'Microsoft Graph hat nicht geantwortet. Bitte später noch einmal versuchen.',
  import_failed: 'Der Import ist fehlgeschlagen.',
}
