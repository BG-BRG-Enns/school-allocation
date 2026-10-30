// What the pages know about the API's answers, free of the DOM so that
// node:test can check it: how a refusal is represented, and where a
// signed-out person is sent.

import { getAuthLogin } from '@school-allocation/api-contracts/endpoint-metadata'
import { endpointPath } from '@school-allocation/api-contracts/client-endpoint'

/** A refused request: the API's error code, for a validation error its message, and the whole body for a refusal that says more. */
export class ApiError extends Error {
  override name = 'ApiError'
  readonly status: number
  readonly code: string
  readonly body: Record<string, unknown>

  constructor(status: number, code: string, message?: string, body: Record<string, unknown> = {}) {
    super(message ?? code)
    this.status = status
    this.code = code
    this.body = body
  }
}

/** The API's error body, as every refusal carries it. */
export function problemOf(status: number, payload: unknown): ApiError {
  const body = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
  const code = typeof body.error === 'string' && body.error !== '' ? body.error : 'request_failed'
  const message = typeof body.message === 'string' ? body.message : undefined
  return new ApiError(status, code, message, body)
}

/** A path of this app, or the start page for anything else. */
export function ownPath(returnTo: string): string {
  return returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
}

/** The sign-in page, which comes back to `returnTo` once signed in. */
export function signInUrl(returnTo: string): string {
  return `/anmelden?returnTo=${encodeURIComponent(ownPath(returnTo))}`
}

/** Where the sign-in page sends the browser: Entra, and back to `returnTo`. */
export function loginUrl(returnTo: string): string {
  return endpointPath(getAuthLogin, { query: { returnTo: ownPath(returnTo) } })
}

/** What a person is told when the API refuses, by its code; the validation message names a field, never a value. */
export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  unauthenticated: 'Bitte melden Sie sich an.',
  forbidden: 'Dafür fehlt Ihnen die Berechtigung.',
  not_found: 'Das gibt es nicht, oder Sie haben darauf keinen Zugriff.',
  cross_site_request: 'Die Anfrage kam nicht von dieser Seite.',
  blocked: 'Ihr Zugang wurde gesperrt. Bitte wenden Sie sich an die Schule.',
  invalid_transition: 'Dieser Schritt ist im aktuellen Zustand nicht möglich.',
  rate_limited: 'Zu viele Versuche. Bitte warten Sie einen Moment.',
  FST_ERR_VALIDATION: 'Die Eingabe ist unvollständig oder zu lang.',
  FST_ERR_CTP_BODY_TOO_LARGE: 'Die Datei ist zu groß.',
  request_failed: 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.',
  // The roster
  csv_invalid: 'Die Datei ist keine Personenliste im erwarteten Format. Bitte die Vorlage verwenden.',
  invalid_school_year: 'Das Schuljahr wird als 2026/27 geschrieben.',
  batch_not_pending: 'Über diesen Import wurde schon entschieden.',
  batch_superseded: 'Seit diesem Import wurde ein anderer übernommen. Bitte noch einmal importieren.',
  duplicate_group: 'Eine Gruppe ist zweimal eingetragen.',
  group_label_incomplete: 'Eine Schülergruppe braucht Klasse und Schulstufe; eine Lehrkräftegruppe hat keine.',
  no_groups: 'Es sind noch keine Entra-Gruppen eingetragen.',
  // Accounts and roles
  already_bound: 'Dieses Konto ist dieser Person schon zugeordnet.',
  cannot_block_self: 'Sie können sich nicht selbst sperren.',
  already_blocked: 'Dieses Konto ist schon gesperrt.',
  not_blocked: 'Dieses Konto ist nicht gesperrt.',
  already_granted: 'Diese Rolle hat die Person schon.',
  already_revoked: 'Diese Rolle wurde schon entzogen.',
  cannot_revoke_self: 'Sie können sich die Administration nicht selbst entziehen. Eine andere Administratorin oder ein anderer Administrator kann das.',
  last_admin: 'Das würde die Schule ohne Administration zurücklassen. Erteilen Sie zuerst jemand anderem die Administration.',
  // Campaigns and the catalogue
  campaign_state: 'Das ist im aktuellen Zustand der Wahl nicht möglich.',
  item_state: 'Das ist im aktuellen Zustand der Aktivität nicht möglich.',
  invalid_item_transition: 'Dieser Schritt ist für die Aktivität nicht möglich.',
  transition_not_available: 'Dieser Schritt steht in dieser Version noch nicht zur Verfügung.',
  project_day_twice: 'Ein Projekttag ist zweimal eingetragen.',
  invalid_date: 'Ein Datum gibt es im Kalender nicht.',
  sessions_outside_days: 'An den gestrichenen Tagen finden schon Termine statt. Bitte zuerst die betroffenen Aktivitäten ändern.',
  item_invalid: 'Die Aktivität entspricht nicht den Regeln. Bitte die Hinweise prüfen.',
  window_order: 'Die Wahl muss enden, nachdem sie begonnen hat.',
  grace_order: 'Die Nachfrist endet frühestens mit der Wahl.',
  swap_order: 'Das Ummeldefenster muss enden, nachdem es begonnen hat.',
  // Settings and classes
  period_grid_invalid: 'Das Stundenraster entspricht nicht den Regeln. Bitte die Hinweise prüfen.',
  no_roster: 'Es gilt noch keine Personenliste.',
  class_unknown: 'Diese Klasse gibt es in der Personenliste nicht.',
  teacher_unknown: 'Eine Lehrkraft ist nicht in der Personenliste.',
  graph_not_authorized: 'Für die Gruppensuche ist eine Anmeldung bei Microsoft nötig.',
  graph_forbidden: 'Microsoft Graph verweigert das Lesen der Gruppen. Fehlt die Berechtigung oder die Zustimmung der IT?',
  graph_failed: 'Microsoft Graph hat nicht geantwortet. Bitte später noch einmal versuchen.',
  // The window and mail
  not_a_student: 'Nur Schüler/innen der Personenliste wählen.',
  ranking_invalid: 'Die Wünsche entsprechen nicht den Regeln. Bitte die Hinweise prüfen.',
  already_exempted: 'Diese Befreiung gibt es schon.',
  mail_off: 'Der Mailversand ist auf diesem Server nicht eingerichtet.',
  no_address: 'Ihr Konto hat keine E-Mail-Adresse, an die eine Testmail gehen könnte.',
  template_invalid: 'Die Vorlage entspricht nicht den Regeln. Bitte die Hinweise prüfen.',
  // The allocation
  solver_off: 'Auf diesem Server ist kein Solver eingerichtet; eine Zuteilung kann nicht berechnet werden.',
  run_in_progress: 'Ein Lauf wird gerade berechnet. Bitte warten, bis er fertig ist.',
  daily_minimum_missing: 'Für diese Schulstufen fehlt die Mindestminutenzahl je Tag; sie lässt sich in den Einstellungen der Wahl auch jetzt noch eintragen:',
  fixed_items_overlap: 'Zwei Klassenaktivitäten nehmen dieselbe Klasse zur gleichen Zeit mit. Bitte den Katalog berichtigen.',
  no_students: 'Die Personenliste der Wahl enthält keine Schüler/innen.',
  run_not_publishable: 'Nur ein gelungener Lauf kann veröffentlicht werden.',
  run_stale: 'Seit diesem Lauf hat sich die Wahl geändert; für die Veröffentlichung ist ein neuer Lauf nötig.',
  cancelled_mismatch: 'Die bestätigten Absagen sind nicht die des Laufs. Bitte die Seite neu laden und noch einmal prüfen.',
  not_published: 'Das Ergebnis ist noch nicht veröffentlicht.',
  swap_closed: 'Das Ummeldefenster ist nicht offen.',
  not_offered: 'Diese Aktivität steht nicht zur Wahl: abgesagt, zurückgezogen, nicht für diese Schulstufe oder Klasse, oder zur Zeit einer Klassenaktivität.',
  already_placed: 'Diese Aktivität ist schon zugeteilt.',
  item_full: 'Diese Aktivität ist voll. Jemand war schneller.',
  not_placed: 'Diese Aktivität ist nicht zugeteilt.',
  leaves_fixed: 'Eine Klassenaktivität kann nicht verlassen werden.',
  below_minimum: 'Die bisherige Aktivität käme unter ihre Mindestteilnehmerzahl.',
  overlap: 'Die Aktivität überschneidet sich mit einer, die bleibt.',
  coverage_lost: 'Danach würden an einem Tag Minuten fehlen, die jetzt nicht fehlen.',
  fills_nothing: 'Diese Aktivität füllt keine Lücke: an ihrem Tag ist das Programm schon voll.',
  fully_placed: 'Diese Schülerin oder dieser Schüler hat an jedem Tag das Programm; eine Zuteilung in eine Lücke ist nicht nötig.',
  no_change: 'Bitte eine Aktivität angeben, in die oder aus der die Person kommt.',
  not_assigned: 'Diese Person ist dieser Aktivität nicht zugeteilt; Anwesenheit gibt es nur für Zugeteilte.',
  retention_not_reached: 'Die Aufbewahrungsfrist dieses Schuljahrs ist noch nicht abgelaufen: ein Jahr nach seinem Ende.',
}

/** Refusals whose answer names what is wrong (the grades, say): the sentence carries it. */
const DETAILED = new Set(['daily_minimum_missing'])

/**
 * Whether a failed request may succeed when sent again unchanged: no answer
 * at all (the connection), or a server or proxy error. A refusal (4xx)
 * stays one.
 */
export function isTransient(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500
}

/** The sentence for a refusal: its code's, or the general one. */
export function errorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'request_failed'
  const sentence = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.request_failed ?? ''
  const detail = error instanceof ApiError && DETAILED.has(code) && typeof error.body.message === 'string' ? error.body.message : ''
  return detail === '' ? sentence : `${sentence} ${detail}`
}
