// The German words for the API's codes. One place, so a code the API adds
// without a label is noticed in review and a test can check coverage.

/** The privileged roles (apps/api/lib/roles.ts), as the account page names them. */
export const ROLE_LABELS: Readonly<Record<string, string>> = {
  school_admin: 'Administration',
  campaign_organizer: 'Organisation einer Wahl',
  read_only_auditor: 'Einsicht (nur lesen)',
}
