// Formal German: the words of de.ts that address staff, with Sie; students
// keep du. Only what differs is here, and the rest is German's
// (withOverride in index.ts). Words that students and staff both read (the
// sign-in page, the account page, the errors) address nobody
// (docs/glossary.md); packages/messages/test/register.test.ts holds the file
// to both rules.

import type { MessagesOverride } from './index.ts'

export const deFormal = {
  labels: {
    refreshError: {
      graph_authorization_failed: 'Die Berechtigung für Microsoft Graph wurde nicht erteilt oder passt nicht zum Konto.',
    },
  },
  errors: {
    unauthenticated: 'Bitte einloggen.',
    forbidden: 'Dafür fehlt die Berechtigung.',
    not_found: 'Das gibt es nicht, oder der Zugriff darauf fehlt.',
    cross_site_request: 'Das hat nicht geklappt. Bitte die Seite neu laden.',
    blocked: 'Der Zugang ist gesperrt. Bitte an die Schule wenden.',
    rate_limited: 'Zu viele Versuche. Bitte einen Moment warten.',
    request_failed: 'Das hat nicht geklappt. Bitte noch einmal versuchen.',
    csv_invalid: 'Die Datei ist keine Klassenliste im erwarteten Format. Bitte die Vorlage nehmen.',
    batch_superseded: 'Seit diesem Import wurde ein anderer übernommen. Bitte die Klassenlisten noch einmal einlesen.',
    cannot_block_self: 'Das eigene Konto kann nicht gesperrt werden.',
    cannot_revoke_self: 'Die eigene Administration kann nicht selbst entzogen werden. Das kann nur jemand anderer aus der Administration.',
    last_admin: 'Dann hätte die Schule keine Administration mehr. Bitte zuerst jemand anderem die Administration geben.',
    sessions_outside_days: 'An den gestrichenen Tagen gibt es schon Termine. Bitte zuerst die betroffenen Aktivitäten ändern.',
    item_invalid: 'Die Aktivität passt noch nicht. Bitte die Hinweise ansehen.',
    period_grid_invalid: 'Das Stundenraster passt noch nicht. Bitte die Hinweise ansehen.',
    graph_not_authorized: 'Für die Gruppensuche bitte bei Microsoft einloggen.',
    ranking_invalid: 'Die Wünsche passen noch nicht. Bitte die Hinweise ansehen.',
    no_address: 'Das Konto hat keine E-Mail-Adresse, an die eine Test-E-Mail gehen könnte.',
    template_invalid: 'Die Vorlage passt noch nicht. Bitte die Hinweise ansehen.',
    run_in_progress: 'Gerade läuft eine Berechnung. Bitte warten, bis sie fertig ist.',
    daily_minimum_missing: 'Für diese Schulstufen fehlen die Mindestminuten je Tag. Das Eintragen in den Einstellungen der Anmeldung ist auch jetzt noch möglich:',
    run_stale: 'Seit dieser Berechnung hat sich die Anmeldung geändert. Bitte vor der Veröffentlichung neu berechnen.',
    cancelled_mismatch: 'Die bestätigten Ausfälle sind nicht die der Berechnung. Bitte die Seite neu laden und noch einmal prüfen.',
    no_change: 'Bitte eine Aktivität angeben, in die oder aus der die Person wechselt.',
    rules_invalid: 'Die Regeln passen noch nicht. Bitte die Hinweise ansehen.',
    category_in_use: 'Eine Aktivität oder eine Regel verwendet diese Kategorie. Umbenennen geht, entfernen nicht.',
    category_unknown: 'Eine der Kategorien gibt es nicht mehr. Bitte die Seite neu laden.',
  },
  signIn: {
    intro: 'Bitte mit dem Schulkonto (Microsoft) einloggen.',
  },
  start: {
    noCampaigns: 'Es gibt noch keine Anmeldung zur Teilnahme oder Betreuung.',
  },
  account: {
    unbound: 'Das Konto ist noch niemandem aus den Klassenlisten zugeordnet. Falls die Teilnahme an einer Anmeldung vorgesehen ist, bitte an die Administration wenden.',
  },
  item: {
    sessions: {
      intro: 'Ein Termin liegt in den Einheiten der Schule oder, etwa bei einem Ausflug, nach der Uhrzeit. Angerechnet werden die Minuten, die Sie je Projekttag angeben; Anreise und Pausen zählen nicht.',
    },
  },
  wishes: {
    onBehalf: (name: string, className: string) => `Für ${name} (${className}). Was Sie eintragen, wird mit Begründung protokolliert.`,
  },
  schoolClass: {
    unplaced: {
      note: 'Als Klassenvorstand teilen Sie hier ein, wem noch Zeit oder eine Regel fehlt. Wer eingeteilt wird, bekommt Bescheid; die Organisation sieht jede Änderung mit Ihrer Begründung.',
    },
    attendance: {
      recordable: 'Eintragen und speichern; korrigieren können Sie bis zum Abschluss der Anmeldung.',
    },
  },
  allocation: {
    change: {
      rules: 'Es gilt dasselbe wie beim Tausch: in eine Aktivität mit freien Plätzen, die zur Schulstufe passt und sich mit nichts überschneidet, das bleibt; eine Klassenaktivität bleibt immer. Eine volle Aktivität, die Mindestzahl oder eine Regel der Anmeldung dürfen Sie übergehen; das Häkchen dafür wird vermerkt.',
    },
    review: {
      stale: 'Seit dieser Berechnung hat sich der Katalog, die Klassenlisten oder eine Klassenaktivität geändert. Bitte berechnen Sie neu, bevor Sie veröffentlichen.',
    },
  },
  roster: {
    current: {
      none: 'Noch keine Klassenlisten. Lesen Sie sie aus den Entra-Gruppen ein oder laden Sie eine CSV-Datei hoch.',
    },
    groups: {
      intro: 'Tragen Sie hier die Gruppen ein, aus denen die Klassenlisten kommen: je Klasse eine Gruppe mit Klasse und Schulstufe, dazu die Gruppe der Lehrkräfte. Suchen Sie die Gruppen bei Microsoft nach ihrem Namen, oder tragen Sie die Gruppen-ID ein, die in Entra bei der Gruppe steht (Objekt-ID). Untergruppen werden mitgelesen: Tragen Sie eine Klasse deshalb nur einmal ein, entweder ihre Gruppe oder ihre Untergruppen (3A, oder 3AR und 3AG), sonst steht jede Person doppelt in der Liste.',
    },
    picker: {
      authorizationNeeded: 'Für die Suche müssen Sie sich bei Microsoft einloggen:',
    },
    refresh: {
      intro: (scopes: string) => `Sie werden zu Microsoft weitergeleitet und erlauben SchulWahl, mit Ihrem Konto die Mitglieder der Gruppen zu lesen (${scopes}). Die Klassenlisten werden eingelesen und Ihnen zur Prüfung gezeigt, bevor sie gelten.`,
      groupsFirst: 'Tragen Sie zuerst die Gruppen ein und speichern Sie sie.',
    },
  },
  rosterImport: {
    problems: {
      rejected: 'Die Liste wurde abgelehnt. Beheben Sie die Probleme in der Quelle und lesen Sie sie noch einmal ein.',
    },
  },
  mailTemplates: {
    intro: 'Die E-Mails, die eine Anmeldung verschickt. Platzhalter wie {{first_name}} füllt SchulWahl beim Versand; klicken Sie einen an, um ihn einzufügen.',
    testQueued: 'Eine Test-E-Mail an Ihre Adresse wartet auf den Versand.',
    otherLanguage: (language: string) => `Dieser Text wurde für „${language}“ geschrieben. Die Schule ist jetzt auf eine andere Sprache eingestellt: Übersetzen Sie ihn oder setzen Sie ihn zurück.`,
    sending: {
      pauseHint: 'Steckt ein Fehler in einer E-Mail, halten Sie den Versand an: Was wartet, bleibt liegen, bis Sie ihn fortsetzen.',
      paused: 'Der Versand ist angehalten. Die E-Mails warten, bis Sie ihn fortsetzen.',
    },
  },
  availability: {
    intro: 'Tragen Sie ein, an welchen Projekttagen Sie für eine Aktivität da sind. Ohne Eintrag gelten Sie als verfügbar. Einen Grund geben Sie nicht an.',
    none: 'Zurzeit sammelt keine Anmeldung Angebote. Solange eine sammelt, tragen Sie hier ein, an welchen ihrer Projekttage Sie da sind; danach ändert das die Organisation.',
  },
  planning: {
    intro: 'Je Lehrkraft und Projekttag: ob sie verfügbar ist, was sie leitet und was sie begleitet. Die Lehrkräfte tragen ihre Verfügbarkeit ein, solange Angebote gesammelt werden; hier ändern Sie sie für alle, bis die Anmeldung abgeschlossen ist.',
  },
  retention: {
    intro: 'Die Daten einer Projektwoche bleiben bis ein Jahr nach dem Ende ihres Schuljahrs. Danach können Sie sie hier löschen, mit Begründung; von selbst wird nichts gelöscht. Sichern Sie vorher die Einteilung und die Kostenliste als Excel, falls die Buchhaltung danach fragt. Gelöscht ist gelöscht.',
  },
  mail: {
    class_missing: {
      body: 'Guten Tag {{name}},\n\naus Ihrer Klasse {{class_name}} fehlen bei {{campaign}} ({{window}}) noch diese Wünsche:\n\n{{list}}\n\nBitte erinnern Sie diese Schüler*innen daran. Den Stand der Klasse sehen Sie hier:\n\n{{link}}',
    },
    class_unplaced: {
      body: 'Guten Tag {{name}},\n\nbei {{campaign}} sind aus Ihrer Klasse {{class_name}} noch nicht alle für jeden Tag eingeteilt:\n\n{{list}}\n\nBitte teilen Sie sie in Aktivitäten mit freien Plätzen ein. Den Stand der Klasse sehen Sie hier:\n\n{{link}}',
    },
    item_cancelled: {
      body: 'Guten Tag {{name}},\n\nIhre Aktivität „{{activity}}“ bei {{campaign}} hat die Mindestzahl von {{minimum}} nicht erreicht ({{wish_count}} Wünsche) und fällt deshalb aus. Wer sie gewünscht hat, ist nach den weiteren Wünschen eingeteilt.\n\n{{link}}',
    },
  },
} satisfies MessagesOverride
