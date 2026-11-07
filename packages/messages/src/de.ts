// The words of the user interface in German: the source catalogue. The
// pages, the workbooks and the lines the server writes into notices take
// every word from here, so a change of wording is a change of this file,
// and another language is a file beside it that the typecheck holds to the
// same keys. Keys are English, since they are code. The groups follow the
// pages, in English (`campaign` is Wahl.vue, `item` Aktivitaet.vue), and
// the features beyond them: the code labels, the API's refusals, the
// workbooks, the names of downloads, the notices. Words several pages
// share are in `common`. A value that depends on a number or a name is a
// function of it, and a count that changes the words asks the language's
// plural rules.
//
// The words follow docs/glossary.md, and du addresses everyone;
// de-formal.ts says Sie to staff. The mail templates' default texts are
// here too (`mail`); a text an organizer saves instead is stored in the
// database.

const plural = new Intl.PluralRules('de')

/** `one` for a count the language treats as one, `other` for every other. */
function byCount(count: number, one: string, other: string): string {
  return plural.select(count) === 'one' ? one : other
}

/** Grades as a phrase: "9. Schulstufe", "9. und 10. Schulstufe", "5., 6. und 7. Schulstufe". */
function gradesPhrase(grades: readonly number[]): string {
  const named = grades.map((grade) => `${grade}.`)
  const last = named.pop()
  return named.length === 0 ? `${last} Schulstufe` : `${named.join(', ')} und ${last} Schulstufe`
}

/** The classes an activity takes whole: "für die ganze 5A", or "für die ganzen Klassen 5A, 5B". */
function wholeClasses(classes: string): string {
  return classes.includes(',') ? `für die ganzen Klassen ${classes}` : `für die ganze ${classes}`
}

export const de = {
  common: {
    appName: 'SchulWahl',
    /** The pages as the navigation, the links to them and their own headings name them. */
    page: {
      start: 'Startseite',
      signIn: 'Einloggen',
      account: 'Mein Konto',
      campaigns: 'Anmeldungen',
      admin: 'Verwaltung',
      roster: 'Klassenlisten',
      people: 'Konten und Rollen',
      classTeachers: 'Klassenvorstände',
      periods: 'Stundenraster',
      mailTemplates: 'E-Mail-Vorlagen',
      mails: 'E-Mails',
      retention: 'Aufbewahrung',
      wishes: 'Meine Wünsche',
      result: 'Meine Einteilung',
      allocation: 'Zuteilung',
      newItem: 'Neue Aktivität',
      availability: 'Meine Verfügbarkeit',
      planning: 'Lehrkräfte je Tag',
      companions: 'Begleitung gesucht',
      categories: 'Kategorien',
    },
    backToCampaign: 'Zur Anmeldung',
    backToAdmin: 'Zur Verwaltung',
    /** Field and column names several pages share. */
    field: {
      name: 'Name',
      className: 'Klasse',
      grade: 'Schulstufe',
      schoolYear: 'Schuljahr',
      email: 'E-Mail',
      state: 'Stand',
      role: 'Rolle',
      places: 'Plätze',
      item: 'Aktivität',
      number: 'Nr.',
      student: 'Schüler*in',
      students: 'Schüler*innen',
      teachers: 'Lehrkräfte',
      sessions: 'Termine',
      day: 'Tag',
      fee: 'Kosten',
      reason: 'Begründung',
      /** The column of a table's row buttons, for screen readers. */
      actions: 'Aktionen',
    },
    save: 'Speichern',
    cancel: 'Abbrechen',
    remove: 'Entfernen',
    edit: 'Bearbeiten',
    view: 'Ansehen',
    pleaseChoose: 'Bitte wählen',
    addDay: 'Tag hinzufügen',
    saved: 'Gespeichert.',
    /** "9. Schulstufe" */
    gradeOrdinal: (grade: number) => `${grade}. Schulstufe`,
    /** "240 min" */
    minutes: (minutes: number) => `${minutes} min`,
  },

  /** Categories and rules (school-core rules.ts), as every page and the workbooks name them. */
  rules: {
    category: 'Kategorie',
    categories: 'Kategorien',
    rule: 'Regel',
    /** What a rule asks, in a line: "Sport: mindestens 1 Aktivität", "Berufsorientierung: mindestens 200 Minuten". */
    asks: (category: string, minimum: number, unit: 'items' | 'minutes') => unit === 'items'
      ? `${category}: mindestens ${minimum} ${byCount(minimum, 'Aktivität', 'Aktivitäten')}`
      : `${category}: mindestens ${minimum} Minuten`,
    /** Whom it asks: "9. und 10. Schulstufe", "9. Schulstufe, nur 5A, 5B". */
    scope: (grades: readonly number[], classes: readonly string[]) => classes.length === 0 ? gradesPhrase(grades) : `${gradesPhrase(grades)}, nur ${classes.join(', ')}`,
    /** How far someone is: "1 von 1", "100 von 200 Minuten". */
    progress: (have: number, minimum: number, unit: 'items' | 'minutes') => unit === 'items' ? `${have} von ${minimum}` : `${have} von ${minimum} Minuten`,
    met: 'erfüllt',
    /** What is missing: "es fehlt 1 Aktivität", "es fehlen 100 Minuten". */
    missing: (missing: number, unit: 'items' | 'minutes') => unit === 'items'
      ? `es ${byCount(missing, 'fehlt', 'fehlen')} ${missing} ${byCount(missing, 'Aktivität', 'Aktivitäten')}`
      : `es fehlen ${missing} Minuten`,
  },

  /** Values as the pages, the workbooks and the notices write them. */
  format: {
    /** One period of the school's grid: "2. EH". */
    period: (period: number) => `${period}. EH`,
    /** A span of periods: "2.–3. EH", one period as "2. EH". */
    periods: (from: number, to: number) => from === to ? `${from}. EH` : `${from}.–${to}. EH`,
    /** The same spoken: "2. und 3. EH" for two neighbours, else as `periods`. */
    periodsSpoken: (from: number, to: number) => to === from + 1 ? `${from}. und ${to}. EH` : (from === to ? `${from}. EH` : `${from}.–${to}. EH`),
    /** An amount already formatted as a number, with the currency: "15,00 €". */
    euros: (amount: string) => `${amount} €`,
  },

  /** The shell around every page (App.vue). */
  shell: {
    navigation: 'Konto',
    /** The link to the handbook of the person's role (apps/web/src/lib/handbook.ts). */
    help: 'Hilfe',
    signOut: 'Ausloggen',
    serverDown: 'Der Server antwortet gerade nicht.',
    retry: 'Noch einmal versuchen',
  },

  /** The words for the API's codes, one map per list of codes; a test checks that every code has its word. */
  labels: {
    /** The privileged roles (apps/api/lib/roles.ts), as the account page names them. */
    role: {
      school_admin: 'Administration',
      campaign_organizer: 'Organisation',
      read_only_auditor: 'Einsicht',
    },
    /** Student or teacher (school-core PERSON_KINDS). */
    kind: {
      student: 'Schüler*in',
      teacher: 'Lehrkraft',
    },
    /** Where a batch came from (apps/api/lib/models/roster.ts BATCH_SOURCES). */
    batchSource: {
      'graph:groups': 'Entra-Gruppen',
      'csv': 'CSV-Datei',
    },
    /** What became of a batch (BATCH_STATES). */
    batchState: {
      pending: 'Zur Prüfung',
      committed: 'Übernommen',
      discarded: 'Verworfen',
      rejected: 'Abgelehnt',
    },
    /** Why a batch or a row was refused (school-core ROSTER_PROBLEM_CODES). */
    /** Why a row of a teacher list is not applied (api-contracts TEACHER_LIST_PROBLEM_CODES). */
    teacherListProblem: {
      email_invalid: 'Keine E-Mail-Adresse',
      short_name_invalid: 'Kein Kürzel: bis zu 8 Buchstaben oder Ziffern, Punkt oder Bindestrich',
      short_name_inconsistent: 'Zwei Kürzel für dieselbe Lehrkraft',
      short_name_taken: 'Dasselbe Kürzel für zwei Lehrkräfte',
      short_name_held: 'Dieses Kürzel hat schon eine andere Lehrkraft',
      class_invalid: 'Kein gültiger Klassenname',
      teacher_unknown: 'Keine Lehrkraft der Klassenlisten mit dieser Adresse',
      class_unknown: 'Diese Klasse gibt es in den Klassenlisten nicht',
    },
    /** Why a row of an availability list is not applied (api-contracts AVAILABILITY_IMPORT_PROBLEM_CODES). */
    availabilityImportProblem: {
      key_missing: 'Weder E-Mail-Adresse noch Kürzel',
      email_invalid: 'Keine E-Mail-Adresse',
      short_name_too_long: 'Kürzel länger als 8 Zeichen',
      status_invalid: 'Weder leer noch N noch F',
      note_too_long: 'Anmerkung länger als 200 Zeichen',
      lead_duty_invalid: 'Leitung: weder leer noch N',
      teacher_unknown: 'Keine Lehrkraft dieser Anmeldung mit dieser Adresse',
      short_name_unknown: 'Kein Kürzel in den Stammdaten: neben dem Namen oder bei den Klassenvorständen zu setzen',
      teacher_not_in_registration: 'Keine Lehrkraft dieser Anmeldung: nicht in ihren Klassenlisten und auf keiner Aktivität',
      key_conflict: 'Adresse und Kürzel gehören zu zwei Lehrkräften',
    },
    /** What is wrong with a CSV file as a whole (school-core CSV_PROBLEM_CODES). */
    csvFileProblem: {
      no_header: 'Keine Kopfzeile mit den erwarteten Spalten',
      missing_column: 'Eine Spalte fehlt',
      field_count: 'Eine Zeile hat mehr oder weniger Felder als die Kopfzeile',
      field_too_long: 'Ein Feld ist zu lang',
      too_many_rows: 'Zu viele Zeilen',
      malformed_quote: 'Ein Anführungszeichen schließt nicht',
      empty: 'Die Datei hat keine Zeilen',
      unknown_column: 'Eine Spalte, die der Import nicht kennt',
      day_ambiguous: 'Diesen Wochentag gibt es in der Anmeldung zweimal; bitte das Datum als Spaltenname',
      duplicate_column: 'Zwei Spalten für denselben Tag',
    },
    rosterProblem: {
      empty_roster: 'Die Liste enthält niemanden',
      no_key: 'Weder Objekt-ID noch E-Mail-Adresse',
      duplicate_key: 'Dieselbe Person kommt zweimal vor',
      duplicate_address: 'Dieselbe E-Mail-Adresse bei zwei Personen',
      both_kinds: 'Dieselbe Person als Schüler*in und als Lehrkraft',
      student_without_class: 'Schüler*in ohne Klasse oder Schulstufe',
      teacher_with_class: 'Lehrkraft mit Klasse oder Schulstufe',
      invalid_class_name: 'Ungültige Klassenbezeichnung',
      invalid_grade: 'Ungültige Schulstufe (1 bis 13)',
      invalid_address: 'Ungültige E-Mail-Adresse',
      invalid_name: 'Ungültiger Name',
      invalid_kind: 'Ungültige Art (student oder teacher)',
    },
    /** What an accepted batch should be looked at for (apps/api/lib/models/roster.ts RosterWarning). */
    rosterWarning: {
      no_address: 'Ohne E-Mail-Adresse: E-Mails erreichen diese Person nicht',
    },
    /** The fields a diff names (school-core ChangedField). */
    field: {
      kind: 'Art',
      displayName: 'Name',
      className: 'Klasse',
      grade: 'Schulstufe',
      mail: 'E-Mail',
      classTeacherMail: 'Klassenvorstand',
    },
    /** A campaign's lifecycle state (school-core CAMPAIGN_STATES). */
    campaignState: {
      draft: 'In Vorbereitung',
      catalogue: 'Angebote werden gesammelt',
      published: 'Katalog veröffentlicht',
      open: 'Anmeldung läuft',
      grace: 'Nachfrist',
      closed: 'Anmeldung beendet',
      allocating: 'Zuteilung wird berechnet',
      review: 'Zuteilung in Prüfung',
      results: 'Einteilung veröffentlicht',
      archived: 'Abgeschlossen',
    },
    /** An activity's state (school-core ITEM_STATES). */
    itemState: {
      draft: 'Entwurf',
      proposed: 'Eingereicht',
      approved: 'Genehmigt',
      withdrawn: 'Zurückgezogen',
    },
    /** Why an activity was refused (school-core CATALOGUE_PROBLEM_CODES). */
    catalogueProblem: {
      no_sessions: 'Mindestens ein Termin ist nötig',
      session_ends_before_start: 'Ein Termin endet vor seinem Beginn',
      session_outside_project_days: 'Ein Termin liegt außerhalb der Projekttage',
      sessions_overlap: 'Zwei Termine der Aktivität überschneiden sich',
      credit_date_outside_session: 'Angerechnete Minuten für einen Tag, an dem der Termin nicht stattfindet',
      credit_date_twice: 'Ein Tag ist bei einem Termin zweimal angerechnet',
      credit_minutes_invalid: 'Angerechnete Minuten müssen eine ganze Zahl zwischen 0 und 1440 sein',
      no_credit: 'Ein Termin rechnet keine Minuten an',
      below_minimum_length: 'Die Aktivität ist an diesem Tag kürzer als die Mindestlänge',
      min_above_places: 'Die Mindestzahl ist größer als die Zahl der Plätze',
      fixed_item_cancellable: 'Eine Klassenaktivität findet immer statt und kann nicht ausfallen',
      fixed_class_unknown: 'Eine der ganzen Klassen gibt es in den Klassenlisten nicht',
      eligible_class_unknown: 'Eine Klasse, für die die Aktivität angeboten wird, gibt es in den Klassenlisten nicht',
      fixed_class_also_eligible: 'Eine Klasse nimmt ganz teil und steht zugleich unter „Angeboten für Klassen“',
      no_teacher: 'Mindestens eine Lehrkraft ist nötig',
      teacher_twice: 'Eine Lehrkraft ist zweimal eingetragen',
      no_lead: 'Eine der Lehrkräfte muss die Leitung haben',
      lead_not_teacher: 'Die Leitung muss eine der Lehrkräfte der Aktivität sein',
    },
    /** Why a ranking was refused (school-core RANKING_PROBLEM_CODES). */
    rankingProblem: {
      unknown_group: 'Ein Zeitblock wird nicht angeboten',
      unknown_item: 'Eine Aktivität wird in diesem Zeitblock nicht angeboten',
      item_twice: 'Eine Aktivität ist zweimal gereiht',
      too_many_wishes: 'Mehr Wünsche als erlaubt',
    },
    /** The state of a student's list (packages/api-contracts/src/choices.ts ChoiceState). */
    choiceState: {
      none: 'keine Wünsche',
      incomplete: 'unvollständig',
      complete: 'vollständig',
    },
    /** The window a list was saved in. */
    window: {
      first: 'Anmeldezeitraum',
      late: 'Nachfrist',
    },
    /** The kinds of mail the window sends (packages/api-contracts/src/mail.ts MAIL_KINDS). */
    mailKind: {
      choice_invitation: 'Einladung zur Anmeldung',
      choice_reminder: 'Erinnerung vor dem Ende der Anmeldung',
      grace_invitation: 'Einladung zur Nachfrist',
      grace_reminder: 'Erinnerung vor dem Ende der Nachfrist',
      missed_deadline: 'Frist versäumt',
      class_missing: 'Fehlende Wünsche, an den Klassenvorstand',
      result_published: 'Einteilung veröffentlicht',
      class_unplaced: 'Noch nicht ganz eingeteilt, an den Klassenvorstand',
      item_cancelled: 'Aktivität fällt aus, an die Lehrkräfte',
      swap_confirmed: 'Tausch bestätigt',
      assignment_changed: 'Einteilung geändert (durch den Klassenvorstand oder die Organisation)',
    },
    /** What became of an allocation run (packages/api-contracts/src/allocation.ts RUN_STATUSES). */
    runStatus: {
      running: 'läuft',
      succeeded: 'fertig',
      failed: 'fehlgeschlagen',
      interrupted: 'abgebrochen',
    },
    /** Why a run failed (RUN_FAILURE_CODES). */
    runFailure: {
      solver_unreachable: 'Das Rechenmodul war nicht erreichbar',
      solver_answer_invalid: 'Das Rechenmodul hat keine gültige Antwort geliefert',
      solver_infeasible: 'Mit den aktuellen Vorgaben ist keine gültige Einteilung möglich. Zuerst zu prüfen: die Mindestzahlen der Aktivitäten, die nicht ausfallen dürfen.',
      solver_unknown: 'Mit dem Suchaufwand wurde keine Einteilung gefunden',
      model_invalid: 'Fehler in den Daten für die Berechnung',
      validation_failed: 'Die Prüfung hat einen Fehler in der berechneten Einteilung gefunden; sie wurde verworfen',
      internal_error: 'Ein Fehler im Programm; Näheres steht im Protokoll des Servers',
    },
    /** The solver's answer per pass (school-core SOLVE_STATUSES). */
    solveStatus: {
      OPTIMAL: 'bestmöglich',
      FEASIBLE: 'gültig, vielleicht nicht die beste',
      INFEASIBLE: 'keine Einteilung möglich',
      UNKNOWN: 'mit dem Suchaufwand keine gefunden',
      MODEL_INVALID: 'Fehler in den Daten',
    },
    /** The levels of the lexicographic objective (school-core levelNames); a threshold level is named by its number. */
    level: {
      students_with_deficit: 'Schüler*innen, denen Minuten fehlen',
      deficit_minutes: 'Fehlende Minuten insgesamt',
      total_cost: 'Bewertung nach Wunschreihenfolge, nach Dauer gewichtet (kleiner ist besser)',
      tiebreak: 'Los',
      over: (threshold: number) => `Schüler*innen mit durchschnittlichem Wunsch über ${threshold}`,
      students_missing_rule: 'Schüler*innen, die nicht alle Regeln erfüllen',
      rule_missing_items: 'Fehlende Aktivitäten für Regeln insgesamt',
      rule_missing_minutes: 'Fehlende Minuten für Regeln insgesamt',
    },
    /** Why the validator refused a result (school-core ALLOCATION_PROBLEM_CODES). */
    allocationProblem: {
      pass_not_solved: 'Eine Runde wurde nicht berechnet',
      status_inconsistent: 'Der gemeldete Status passt nicht zu den Zielen',
      levels_unexpected: 'Die Ziele der Antwort passen nicht zur Anfrage',
      cancelled_twice: 'Eine Aktivität fällt doppelt aus',
      level_mismatch: 'Der Wert eines Ziels stimmt mit der Nachrechnung nicht überein',
      not_in_pass: 'Eingeteilt ist jemand, der in dieser Runde nicht vorkommt',
      unknown_item: 'Eine Aktivität, die es in der Anfrage nicht gibt',
      assigned_twice: 'Eine Einteilung kommt zweimal vor',
      not_an_option: 'Eine Aktivität, die weder gewünscht noch ein Restplatz war',
      paid_fallback: 'Eine Aktivität mit Kosten als Restplatz',
      cancelled_not_cancellable: 'Eine Aktivität fällt aus, die nicht ausfallen darf',
      assigned_to_cancelled: 'Einteilung in eine Aktivität, die ausfällt',
      capacity_exceeded: 'Mehr Eingeteilte als Plätze',
      below_minimum: 'Weniger Eingeteilte als die Mindestzahl',
      overlap: 'Zwei Aktivitäten überschneiden sich',
      overlaps_fixed: 'Eine Aktivität überschneidet sich mit einer Klassenaktivität',
      first_pass_changed: 'Die zweite Runde hat die erste verändert',
      pre_assignment_missing: 'Eine Klassenaktivität fehlt in der Einteilung',
      pre_assignment_changed: 'Eine Klassenaktivität wurde verändert',
      assignment_mismatch: 'Die gespeicherten Zeilen passen nicht zum Ergebnis',
    },
    /** The source of a student's place (school-core ASSIGNMENT_SOURCES). */
    assignmentSource: {
      fixed: 'Klassenaktivität',
      wish: 'Wunsch',
      fallback: 'Restplatz',
      swap: 'Tausch',
      manual: 'von Hand',
    },
    /** A fixed place of a student whose class the activity does not take as a whole: a teacher placed them (beside assignmentSource, which names the run's sources alone). */
    placedDirectly: 'direkt eingeteilt',
    /** A change of the published run (packages/api-contracts/src/publication.ts CHANGE_KINDS). */
    changeKind: {
      swap: 'Tausch',
      place: 'Einteilung durch den Klassenvorstand',
      move: 'Wechsel',
      remove: 'Abmeldung',
    },
    /** Why a move after publication is refused (school-core MOVE_PROBLEM_CODES), as the pages say it next to the item. */
    moveProblem: {
      not_offered: 'wird nicht angeboten',
      already_placed: 'schon eingeteilt',
      item_full: 'voll',
      not_placed: 'nicht eingeteilt',
      leaves_fixed: 'feste Einteilung bleibt',
      below_minimum: 'die bisherige Aktivität käme unter ihre Mindestzahl',
      overlap: 'überschneidet sich',
      coverage_lost: 'es würde mehr Zeit fehlen',
      rule_lost: 'eine Regel wäre nicht mehr erfüllt',
      fills_nothing: 'füllt keine Lücke',
    },
    /** Why a registration's rules were refused (school-core RULE_PROBLEM_CODES). */
    ruleProblem: {
      category_unknown: 'Diese Kategorie gibt es nicht (mehr)',
      grades_missing: 'Eine Regel gilt für mindestens eine Schulstufe',
      minimum_out_of_range: 'Die Mindestzahl passt nicht: mindestens 1, höchstens 20 Aktivitäten oder 10000 Minuten',
      too_many_rules: 'Höchstens 20 Regeln',
    },
    /** What a rule counts (school-core RULE_UNITS). */
    ruleUnit: {
      items: 'Aktivitäten',
      minutes: 'Minuten',
    },
    /** What was recorded for a student in a session (packages/api-contracts/src/attendance.ts ATTENDANCE_STATUSES). */
    attendanceStatus: {
      present: 'anwesend',
      absent: 'abwesend',
      excused: 'entschuldigt',
    },
    /** A teacher on a project day (school-core AVAILABILITY_STATUSES). */
    availability: {
      available: 'verfügbar',
      unavailable: 'nicht verfügbar',
      if_needed: 'nur wenn nötig',
    },
    /** The state of a mail in the outbox (apps/api/lib/mail/outbox.ts MAIL_STATES). */
    mailState: {
      queued: 'wartet auf den Versand',
      sending: 'wird gesendet',
      sent: 'gesendet',
      failed: 'fehlgeschlagen',
      /** A reminder whose window ended before it went out. */
      expired: 'nicht mehr gesendet',
    },
    /** Why a template was refused (apps/api/lib/models/mail-templates.ts TemplateProblem). */
    templateProblem: {
      subject_syntax: 'Betreff: Fehler in einem Platzhalter',
      body_syntax: 'Text: Fehler in einem Platzhalter',
      unknown_placeholder: 'Diesen Platzhalter gibt es hier nicht',
      subject_empty: 'Der Betreff darf nicht leer werden',
    },
    /** Why a period grid was refused (school-core PERIOD_PROBLEM_CODES). */
    periodProblem: {
      no_periods: 'Mindestens eine Einheit ist nötig',
      period_numbering: 'Die Einheiten müssen von 1 an ohne Lücke nummeriert sein',
      period_time_invalid: 'Eine Uhrzeit hat nicht die Form HH:MM',
      period_ends_before_start: 'Eine Einheit endet nicht nach ihrem Beginn',
      periods_overlap: 'Eine Einheit beginnt, bevor die vorige endet',
    },
    /** What went wrong with a roster refresh from Entra groups, as the callback reports it in the page's query. */
    refreshError: {
      state_mismatch: 'Die Rückkehr von Microsoft passte nicht zu diesem Browser. Bitte noch einmal starten.',
      no_pending_refresh: 'Es war keine Aktualisierung gestartet, oder sie ist abgelaufen. Bitte noch einmal starten.',
      graph_authorization_failed: 'Die Berechtigung für Microsoft Graph wurde nicht erteilt oder passt nicht zu deinem Konto.',
      graph_unauthorized: 'Microsoft Graph hat den Zugang nicht angenommen. Bitte noch einmal starten.',
      graph_forbidden: 'Microsoft Graph verweigert das Lesen der Gruppen. Fehlen die Berechtigungen (GroupMember.Read.All, User.ReadBasic.All) oder die Zustimmung der IT?',
      graph_not_found: 'Eine der Gruppen gibt es in Entra nicht (mehr). Bitte die Gruppen-IDs prüfen.',
      graph_failed: 'Microsoft Graph hat nicht geantwortet. Bitte später noch einmal versuchen.',
      import_failed: 'Das Einlesen hat nicht geklappt.',
    },
    /** The languages a school may speak (packages/messages LOCALES), as the administration chooses one. */
    locale: {
      'de': 'Deutsch (du)',
      'de-formal': 'Deutsch (Sie zu Lehrkräften und Verwaltung)',
      'en': 'English',
    },
  },

  /** What a person is told when the API refuses, by its code; the validation message names a field, never a value. */
  errors: {
    unauthenticated: 'Bitte logge dich ein.',
    forbidden: 'Dafür fehlt dir die Berechtigung.',
    not_found: 'Das gibt es nicht, oder du hast keinen Zugriff darauf.',
    cross_site_request: 'Das hat nicht geklappt. Lade die Seite bitte neu.',
    blocked: 'Dein Zugang ist gesperrt. Bitte wende dich an die Schule.',
    invalid_transition: 'Das geht jetzt nicht mehr (oder noch nicht).',
    rate_limited: 'Zu viele Versuche. Bitte warte einen Moment.',
    FST_ERR_VALIDATION: 'Eine Angabe fehlt oder ist ungültig.',
    FST_ERR_CTP_BODY_TOO_LARGE: 'Die Datei ist zu groß.',
    request_failed: 'Das hat nicht geklappt. Bitte versuch es noch einmal.',
    // The roster
    csv_invalid: 'Die Datei ist keine Klassenliste im erwarteten Format. Bitte nimm die Vorlage.',
    csv_file_invalid: 'Die CSV-Datei lässt sich so nicht lesen; die Prüfung sagt, woran es liegt.',
    short_name_held: 'Dieses Kürzel hat schon eine andere Lehrkraft.',
    mail_state: 'Nur eine fehlgeschlagene oder verworfene E-Mail wird noch einmal geschickt.',
    invalid_school_year: 'Das Schuljahr wird als 2026/27 geschrieben.',
    batch_not_pending: 'Über diesen Import wurde schon entschieden.',
    batch_superseded: 'Seit diesem Import wurde ein anderer übernommen. Bitte lies die Klassenlisten noch einmal ein.',
    duplicate_group: 'Eine Gruppe ist zweimal eingetragen.',
    group_label_incomplete: 'Eine Klassengruppe muss Klasse und Schulstufe haben; die Gruppe der Lehrkräfte hat keine.',
    no_groups: 'Es sind noch keine Entra-Gruppen eingetragen.',
    // Accounts and roles
    already_bound: 'Dieses Konto ist dieser Person schon zugeordnet.',
    cannot_block_self: 'Du kannst dich nicht selbst sperren.',
    already_blocked: 'Dieses Konto ist schon gesperrt.',
    not_blocked: 'Dieses Konto ist nicht gesperrt.',
    already_granted: 'Diese Rolle hat die Person schon.',
    already_revoked: 'Diese Rolle wurde schon entzogen.',
    cannot_revoke_self: 'Du kannst dir die Administration nicht selbst entziehen. Das kann nur jemand anderer aus der Administration.',
    last_admin: 'Dann hätte die Schule keine Administration mehr. Gib zuerst jemand anderem die Administration.',
    // Campaigns and the catalogue
    campaign_state: 'Das geht im jetzigen Stand der Anmeldung nicht.',
    item_state: 'Das geht im jetzigen Stand der Aktivität nicht.',
    invalid_item_transition: 'Diesen Schritt gibt es für die Aktivität nicht.',
    transition_not_available: 'Diesen Schritt gibt es in dieser Version noch nicht.',
    project_day_twice: 'Ein Projekttag ist zweimal eingetragen.',
    invalid_date: 'Ein Datum gibt es im Kalender nicht.',
    minimum_invalid: 'Eine Mindestlänge passt nicht: Sie muss eine ganze Zahl von 1 bis 1440 Minuten sein und zu einem Projekttag gehören.',
    frame_invalid: 'Ein Anwesenheitsrahmen passt nicht: Er endet vor seinem Beginn, nennt eine Einheit, die das Stundenraster nicht hat, oder einen Tag, der kein Projekttag ist.',
    class_conflict: 'Eine Klasse ist zur selben Zeit schon in einer anderen Klassenaktivität. Sieh dir bitte den Hinweis an.',
    target_reached: 'Für die gewählten Zeiten und Schulstufen gibt es bereits genug Plätze, um das festgelegte Ziel zu erreichen. Eine andere Zeit oder eine weitere passende Schulstufe hilft; der Hinweis unter den Terminen zeigt, wo noch Plätze fehlen.',
    companions_full: 'Inzwischen ist die Begleitung vergeben.',
    class_member: 'Die Klasse dieser Person nimmt an der Aktivität als ganze teil. Unter „Nimmt nicht teil“ steht, wer davon ausgenommen ist.',
    not_class_member: 'Diese Person ist in keiner der Klassen, die an der Aktivität als ganze teilnehmen.',
    teacher_overlap: 'Zur selben Zeit ist diese Lehrkraft schon bei einer anderen Aktivität.',
    teacher_unavailable: 'An einem Tag dieser Aktivität ist diese Lehrkraft als nicht verfügbar eingetragen.',
    sessions_outside_days: 'An den gestrichenen Tagen gibt es schon Termine. Ändere bitte zuerst die betroffenen Aktivitäten.',
    item_invalid: 'Die Aktivität passt noch nicht. Sieh dir bitte die Hinweise an.',
    window_order: 'Die Anmeldung muss enden, nachdem sie begonnen hat.',
    grace_order: 'Die Nachfrist endet frühestens mit der Anmeldung.',
    swap_order: 'Die Tauschzeit muss enden, nachdem sie begonnen hat.',
    rules_invalid: 'Die Regeln passen noch nicht. Sieh dir bitte die Hinweise an.',
    // Categories
    category_exists: 'Eine Kategorie mit diesem Namen gibt es schon.',
    category_in_use: 'Eine Aktivität oder eine Regel verwendet diese Kategorie. Du kannst sie nur umbenennen.',
    category_unknown: 'Eine der Kategorien gibt es nicht mehr. Lade bitte die Seite neu.',
    too_many_categories: 'Mehr als 50 Kategorien hat eine Schule nicht.',
    // Settings and classes
    period_grid_invalid: 'Das Stundenraster passt noch nicht. Sieh dir bitte die Hinweise an.',
    no_roster: 'Es gibt noch keine Klassenlisten.',
    class_unknown: 'Diese Klasse gibt es in den Klassenlisten nicht.',
    class_in_use: 'Eine Klasse, die herausgenommen werden soll, nennt noch eine Aktivität oder eine Regel.',
    teacher_unknown: 'Eine Lehrkraft steht nicht in den Klassenlisten.',
    teacher_list_invalid: 'Die Liste lässt sich so nicht übernehmen; die Zeilen mit Problemen stehen in der Prüfung.',
    availability_import_invalid: 'Die Liste lässt sich so nicht übernehmen; die Zeilen mit Problemen stehen in der Prüfung.',
    graph_not_authorized: 'Für die Gruppensuche musst du dich bei Microsoft einloggen.',
    graph_forbidden: 'Microsoft Graph verweigert das Lesen der Gruppen. Fehlt die Berechtigung oder die Zustimmung der IT?',
    graph_failed: 'Microsoft Graph hat nicht geantwortet. Bitte später noch einmal versuchen.',
    // The window and mail
    not_a_student: 'Wünsche geben nur Schüler*innen aus den Klassenlisten ab.',
    ranking_invalid: 'Die Wünsche passen noch nicht. Sieh dir bitte die Hinweise an.',
    already_exempted: 'Diese Befreiung gibt es schon.',
    mail_off: 'Der E-Mail-Versand ist auf diesem Server nicht eingerichtet.',
    no_address: 'Dein Konto hat keine E-Mail-Adresse, an die eine Test-E-Mail gehen könnte.',
    template_invalid: 'Die Vorlage passt noch nicht. Sieh dir bitte die Hinweise an.',
    // The allocation
    solver_off: 'Die Berechnung der Zuteilung ist auf diesem Server nicht eingerichtet. Die Administration kann das ändern (Betriebsanleitung).',
    run_in_progress: 'Gerade läuft eine Berechnung. Bitte warte, bis sie fertig ist.',
    daily_minimum_missing: 'Für diese Schulstufen fehlen die Mindestminuten je Tag. Du kannst sie in den Einstellungen der Anmeldung auch jetzt noch eintragen:',
    fixed_items_overlap: 'Zwei Klassenaktivitäten nehmen dieselbe Klasse zur gleichen Zeit mit. Bitte berichtige den Katalog.',
    no_students: 'Die Klassenlisten dieser Anmeldung enthalten keine Schüler*innen.',
    run_not_publishable: 'Veröffentlichen lässt sich nur eine gelungene Berechnung.',
    run_stale: 'Seit dieser Berechnung hat sich die Anmeldung geändert. Bitte berechne neu, bevor du veröffentlichst.',
    cancelled_mismatch: 'Die bestätigten Ausfälle sind nicht die der Berechnung. Lade bitte die Seite neu und prüfe noch einmal.',
    not_published: 'Die Einteilung ist noch nicht veröffentlicht.',
    swap_closed: 'Gerade ist keine Tauschzeit.',
    not_offered: 'Diese Aktivität wird nicht angeboten: Sie fällt aus, ist zurückgezogen, ist nicht für diese Schulstufe oder Klasse, oder sie liegt zur Zeit einer Klassenaktivität.',
    already_placed: 'Diese Aktivität ist schon eingetragen.',
    item_full: 'Diese Aktivität ist voll. Jemand war schneller.',
    not_placed: 'Diese Aktivität ist nicht eingetragen.',
    leaves_fixed: 'Diese Einteilung wurde für die ganze Klasse oder direkt von einer Lehrkraft festgelegt. Sie lässt sich hier nicht ändern.',
    below_minimum: 'Die bisherige Aktivität käme unter ihre Mindestzahl.',
    overlap: 'Die Aktivität überschneidet sich mit einer, die bleibt.',
    coverage_lost: 'Nach diesem Wechsel würde an mindestens einem Projekttag mehr Zeit fehlen als bisher.',
    rule_lost: 'Danach wäre eine Regel der Anmeldung nicht mehr erfüllt, oder es fehlte mehr dafür als jetzt.',
    fills_nothing: 'Diese Aktivität füllt keine Lücke: An ihrem Tag ist das Programm schon voll.',
    fully_placed: 'Hier ist das Programm an jedem Tag schon voll; es gibt keine Lücke zu füllen.',
    no_change: 'Gib bitte eine Aktivität an, in die oder aus der die Person wechselt.',
    not_assigned: 'Diese Person ist in diese Aktivität nicht eingeteilt; Anwesenheit gibt es nur für Eingeteilte.',
    retention_not_reached: 'Die Aufbewahrungsfrist dieses Schuljahrs läuft noch: bis ein Jahr nach seinem Ende.',
  },

  /** SignIn.vue: one button, to the school's Microsoft sign-in. */
  signIn: {
    intro: 'Logge dich mit deinem Schulkonto (Microsoft) ein.',
    signIn: 'Einloggen',
  },

  /** Start.vue: who is signed in, and their campaigns. */
  start: {
    /** Followed by the name, in bold, and a full stop. */
    signedInAs: 'Eingeloggt als',
    noCampaigns: 'Es gibt noch keine Anmeldung, bei der du mitmachst oder die du betreust.',
  },

  /** Account.vue: who the app takes the signed-in person for. */
  account: {
    atSchool: 'An der Schule',
    notInRoster: 'In den aktuellen Klassenlisten der Schule nicht (mehr) enthalten.',
    /** "Schüler*in, Klasse 5A (9. Schulstufe)" */
    student: (kind: string, className: string, grade: number | null) => `${kind}, Klasse ${className}${grade === null ? '' : ` (${grade}. Schulstufe)`}`,
    unbound: 'Dein Konto ist noch niemandem aus den Klassenlisten zugeordnet. Wenn du bei einer Anmeldung mitmachen sollst, wende dich bitte an die Administration.',
    roles: 'Rollen',
    noRoles: 'Keine besonderen Rollen.',
    /** Followed by the link to the licences of the packages these pages bundle. */
    licences: 'SchulWahl ist freie Software unter der MIT-Lizenz. Die Lizenzen der Programmbibliotheken, die diese Seiten enthalten:',
  },

  /** The controls over a long list (components/ListFilter.vue): the fields and what passes. */
  filters: {
    label: 'Filter',
    all: 'Alle',
    text: 'Suche',
    className: 'Klasse',
    state: 'Stand',
    category: 'Kategorie',
    kind: 'Art',
    onlyIncomplete: 'Nur ohne vollständige Wünsche',
    onlyRestricted: 'Nur eingeschränkt verfügbare',
    onlyCompanionsMissing: 'Nur mit gesuchter Begleitung',
    onlyMine: 'Nur meine',
    reset: 'Filter zurücksetzen',
    onlyCancelled: 'Nur abgesagte',
    classOrName: 'Klasse oder Name',
    nameOrShortName: 'Name oder Kürzel',
    /** "12 von 700" rows pass the filter. */
    shown: (shown: number, total: number) => `${shown} von ${total}`,
    count: (total: number) => `${total} ${byCount(total, 'Eintrag', 'Einträge')}`,
  },
  /** Wahlen.vue: the campaigns the person may see, and the organizer's form for a new one. */
  campaigns: {
    none: 'Noch keine Anmeldung.',
    /** The table's column of campaign names. */
    campaign: 'Anmeldung',
    new: 'Neue Anmeldung',
    namePlaceholder: 'Projektwoche 2027',
    create: 'Anmeldung anlegen',
    /** The classes a registration is for (ClassPicker.vue): the fieldset, its buttons, a grade's box. */
    classes: {
      legend: 'Klassen, die teilnehmen',
      hint: 'Vorausgewählt sind alle Klassen der Klassenlisten. Eine Klasse, die nicht teilnimmt, sieht die Anmeldung nicht und bekommt keine Einladung.',
      selectAll: 'Alle auswählen',
      selectNone: 'Keine auswählen',
      grade: (grade: number) => `${grade}. Schulstufe`,
      wholeGrade: (grade: number) => `Ganze ${grade}. Schulstufe`,
      gone: 'Nicht mehr in den Klassenlisten',
      noneInLists: 'Die Klassenlisten haben noch keine Klassen. Die Anmeldung lässt sich anlegen; welche Klassen teilnehmen, steht in ihren Einstellungen, sobald die Klassenlisten da sind.',
      /** "7 Klassen, Schulstufen 5–11" beside the state; the grades where known. */
      summary: (classes: number, grades: [number, number] | null) => `${classes} ${byCount(classes, 'Klasse', 'Klassen')}${grades === null ? '' : grades[0] === grades[1] ? `, ${grades[0]}. Schulstufe` : `, Schulstufen ${grades[0]}–${grades[1]}`}`,
      /** On the registration's page, for the organization: the classes of the lists in force that are not in. */
      notTakingPart: (classes: string) => `Klassen der Klassenlisten, die nicht teilnehmen: ${classes}`,
      /** Why the list was refused: an activity or a rule still names these classes. */
      inUse: (classes: string) => `Diese Klassen werden noch in Aktivitäten oder Regeln verwendet: ${classes}. Entferne sie zuerst dort; danach kannst du sie aus dieser Anmeldung herausnehmen.`,
    },
  },

  /** Wahl.vue: one campaign, its state and days, its activities, and what the person may do. */
  campaign: {
    title: 'Anmeldung',
    /** "Schuljahr 2026/27 · Projekttage: Mo., 21.06.2027, Di., 22.06.2027" */
    yearAndDays: (schoolYear: string, days: string) => `Schuljahr ${schoolYear} · Projekttage: ${days}`,
    /** The window in one line; the parts are joined with commas, the wishes follow after a dot. */
    window: {
      opens: (from: string, until: string) => `Anmeldung von ${from} bis ${until}`,
      late: (until: string) => `Nachfrist bis ${until}`,
      swap: (from: string, until: string) => `Tauschzeit von ${from} bis ${until}`,
      wishes: (wishes: number) => `${wishes} ${byCount(wishes, 'Wunsch', 'Wünsche')} je Zeitblock`,
    },
    myClass: (className: string) => `Meine Klasse ${className}`,
    projectDays: 'Projekttage',
    organization: {
      heading: 'Organisation',
      itemCounts: (counts: { draft: number, proposed: number, approved: number, withdrawn: number }) => `${counts.draft} ${byCount(counts.draft, 'Entwurf', 'Entwürfe')} · ${counts.proposed} eingereicht · ${counts.approved} genehmigt · ${counts.withdrawn} zurückgezogen`,
      /** A link to the mails page, filtered to this registration. */
      mailsWaiting: (n: number) => `${n} ${byCount(n, 'E-Mail', 'E-Mails')} dieser Anmeldung ${byCount(n, 'wartet', 'warten')} auf den Versand`,
      collect: 'Angebote sammeln',
      publish: 'Katalog veröffentlichen',
      open: 'Anmeldung öffnen',
      archive: 'Anmeldung abschließen',
      close: 'Anmeldung beenden',
      backToDraft: 'Zurück zur Vorbereitung',
      backToCatalogue: 'Zurück zum Sammeln',
      delete: 'Anmeldung löschen',
      editSettings: 'Einstellungen ändern',
      editMinimumAndSwap: 'Mindestminuten und Tauschzeit ändern',
      editSwap: 'Tauschzeit ändern',
      catalogueExport: 'Katalog als Excel',
      /** Before the registration's rules, one per line. */
      rules: 'Regeln',
    },
    /** The step an organizer takes by hand, confirmed on the page with what it does and whether there is a way back. */
    transitions: {
      confirm: 'Schritt bestätigen',
      /** The confirmation's button, after the step's own name. */
      submit: (step: string) => `Ja: ${step}`,
      /** What each step does, a line each; the key is the step as the button names it (backToCatalogue: published → catalogue). */
      consequences: {
        catalogue: ['Lehrkräfte sehen die Anmeldung und reichen ihre Aktivitäten ein.', 'Rückweg: zur Vorbereitung, solange der Katalog nicht veröffentlicht ist.'],
        published: ['Keine neuen Vorschläge mehr; Bezeichnung, Schuljahr und Projekttage stehen fest.', 'Die genehmigten Aktivitäten bekommen Nummern, die bleiben.', 'Alle sehen den Katalog, auch die Schüler*innen; zum Beginn aus den Einstellungen öffnet die Anmeldung von selbst.', 'Rückweg: zum Sammeln; die Nummern bleiben.'],
        open: ['Die Schüler*innen der teilnehmenden Klassen werden per E-Mail eingeladen, sofern eine E-Mail-Adresse hinterlegt ist.', 'Klassenaktivitäten nehmen ihre Klassen mit.', 'Kein Rückweg.'],
        closed: ['Die Anmeldung endet jetzt; eine Nachfrist gibt es dann nicht.', 'Die Klassenlisten dieser Anmeldung werden festgehalten; wer keine vollständigen Wünsche hat, bekommt eine E-Mail, die Klassenvorstände ihre Liste.', 'Kein Rückweg.'],
        archived: ['Danach ändert sich nichts mehr: kein Tausch, keine Einteilung, keine Anwesenheit.', 'Alles bleibt lesbar.', 'Kein Rückweg.'],
        draft: ['Lehrkräfte sehen die Anmeldung nicht mehr; ihre Entwürfe bleiben.', 'Rückweg: Angebote sammeln.'],
        backToCatalogue: ['Lehrkräfte reichen wieder ein; die Schüler*innen sehen den Katalog nicht mehr.', 'Vergebene Nummern bleiben; eine neue Veröffentlichung nummeriert nur die weiteren.'],
        delete: ['Die Anmeldung, ihre Regeln und die Entwürfe ihrer Aktivitäten werden gelöscht.', 'Das Protokoll der Schule hält fest, dass es sie gab.', 'Kein Rückweg.'],
      },
      /** What the organizer should know before this very step, from the registration's state. */
      warnings: {
        noApproved: 'Keine Aktivität ist genehmigt: Der Katalog wäre leer.',
        noClasses: 'Keine Klasse nimmt teil: Niemand sieht die Anmeldung, niemand wird eingeladen.',
        opensAtPast: (when: string) => `Der Beginn ${when} liegt in der Vergangenheit: Die Anmeldung öffnet gleich nach der Veröffentlichung von selbst.`,
        noEnd: 'Kein Ende festgelegt: Die Anmeldung bleibt offen, bis du sie von Hand beendest.',
        noEndAck: 'Ich öffne die Anmeldung ohne Ende und beende sie von Hand.',
        mailOff: 'Der E-Mail-Versand ist auf diesem Server nicht eingerichtet: Die Einladungen warten im Postausgang, bis er es ist.',
        /** Class activities that put a class into two at once, as "5A: Wanderung, Finale". */
        classConflicts: (list: string) => `Eine Klasse ist zur selben Zeit in zwei Klassenaktivitäten: ${list}. So lässt sich die Zuteilung nicht berechnen; nimm die Klasse aus einer der beiden heraus.`,
      },
      deleted: 'Anmeldung gelöscht.',
    },
    /** The organizer's rules in the settings form. */
    rulesEditor: {
      heading: 'Regeln',
      intro: 'Eine Regel verlangt von den Schüler*innen einer Schulstufe (oder nur einiger ihrer Klassen) mindestens so viele Aktivitäten oder Minuten aus einer Kategorie. Klassenaktivitäten zählen mit. Die Zuteilung erfüllt die Regeln, wo es geht: nach den Mindestminuten je Tag und vor den Wünschen, auch mit einem Restplatz ohne Kosten.',
      fixed: 'Ab dem Beginn der Anmeldung stehen die Regeln fest: Die Schüler*innen wählen nach ihnen.',
      none: 'Keine Regeln.',
      noCategories: 'Für Regeln legt die Schule zuerst Kategorien an.',
      rule: (number: number) => `Regel ${number}`,
      grades: 'Schulstufen',
      classes: 'Nur diese Klassen (leer: alle der Schulstufen)',
      classesExample: 'z. B. 7A, 7B',
      unit: 'Zählt',
      minimum: 'Mindestens',
      add: 'Regel hinzufügen',
      remove: 'Regel entfernen',
    },
    /** The organizer's settings form; Wahlen.vue's form for a new campaign uses its name and day fields too. */
    settings: {
      label: 'Einstellungen der Anmeldung',
      name: 'Bezeichnung',
      projectDay: (day: number) => `Projekttag ${day}`,
      window: 'Anmeldezeitraum',
      opens: 'Beginn',
      closes: 'Ende',
      lateUntil: 'Nachfrist bis',
      swapFrom: 'Tauschzeit von',
      swapUntil: 'Tauschzeit bis',
      wishesPerGroup: 'Wünsche je Zeitblock',
      dailyMinimum: (grade: number) => `Mindestminuten je Tag, ${grade}. Schulstufe`,
      /** What the minutes are counted in: the periods a session covers. */
      dailyMinimumHint: 'Gezählt wird die Unterrichtszeit der Einheiten, die die Termine belegen, ohne Pausen: Bei Einheiten zu 50 Minuten sind fünf Einheiten 250 Minuten.',
      showTeachers: 'Der Katalog nennt die Lehrkräfte der Aktivitäten',
      placeHeadroomPercent: 'Plätze über dem Bedarf, in Prozent',
      placeHeadroomHint: 'Mit 20 % werden für je 100 Schüler*innen, die einen Platz brauchen, 120 Plätze geplant.',
      /** The attendance frame of a project day, two selects beside its date. */
      frameFrom: (day: number) => `Anwesenheitsrahmen ab Einheit, Projekttag ${day}`,
      frameTo: (day: number) => `bis Einheit, Projekttag ${day}`,
      noFrame: 'kein Rahmen',
      frameHint: 'Der Anwesenheitsrahmen eines Projekttags sind die Einheiten, in denen alle in der Schule sind, etwa 2. bis 6. Einheit. Mit Rahmen zählt Plätze und Bedarf jede Einheit einzeln; ohne Rahmen zählt der ganze Tag.',
      /** The minimum length of an activity on a project day, a minutes input beside its date. */
      activityMinimum: (day: number) => `Mindestlänge einer Aktivität in Minuten, Projekttag ${day}`,
      activityMinimumUnit: 'Minuten',
      activityMinimumHint: 'Die Mindestlänge ist, was eine Aktivität an diesem Tag mindestens anrechnen muss, über alle ihre Termine zusammen; gezählt wird wie bei den Mindestminuten je Tag. Eine kürzere wird nicht angenommen. Ausgenommen sind Aktivitäten nur für Lehrkräfte und die Tage eines Termins über Nacht. Leer heißt: keine Mindestlänge.',
      lockNewOffers: 'Neue Angebote sperren, sobald das Ziel erreicht ist',
      lockHint: 'Mit der Sperre kann eine Lehrkraft eine Aktivität nur einreichen, wenn mindestens ein Feld, in das ihre Plätze gehen, noch unter dem Ziel liegt. Klassenaktivitäten sind ausgenommen; die Organisation darf immer anlegen und genehmigen.',
    },
    student: {
      viewResult: 'Meine Einteilung ansehen',
      giveWishes: 'Wünsche abgeben oder ändern',
      offered: 'Was angeboten wird',
    },
    missing: {
      heading: 'Stand der Anmeldung',
      summary: (students: number, incomplete: number) => `${students} Schüler*innen, ${incomplete} davon noch ohne vollständige Wünsche.`,
      export: 'Stand der Anmeldung als Excel',
      mails: 'E-Mails',
      enter: 'Eintragen',
    },
    demand: {
      heading: 'Plätze und Bedarf',
      intro: (percent: number) => `Je Projekttag und Schulstufe: wie viele Schüler*innen noch einen Platz suchen (ohne die in einer Klassenaktivität), das Ziel mit ${percent} % darüber, damit die Wünsche Platz haben, und wie viele Plätze die eingereichten und genehmigten Aktivitäten ihnen anbieten. Ein Tag mit Anwesenheitsrahmen wird je Einheit gezählt: Eine Aktivität zählt in jeder Einheit, die sie berührt, auch zum Teil. Ein Feld unter dem Ziel ist markiert.`,
      /** One day's table, for a screen reader. */
      table: (day: string) => `Plätze und Bedarf am ${day}`,
      /** The one column of a day counted whole. */
      day: 'Tag',
      framed: (periods: string) => `Anwesenheitsrahmen ${periods}, je Einheit gezählt`,
      unframed: 'ohne Anwesenheitsrahmen, je Tag gezählt',
      /** A cell the activity on the form or under review serves, for a screen reader; the eye sees the outline. */
      served: '(diese Aktivität)',
      cell: (needing: number, target: number, offered: number) => `${needing} ohne Platz · Ziel ${target} · ${offered} angeboten`,
      short: (missing: number) => `${missing} unter dem Ziel`,
      rulesIntro: 'Je Regel und Schulstufe stehen die Aktivitäten oder Minuten, die den Schüler*innen über ihre Klassenaktivitäten hinaus noch fehlen, neben dem Höchsten, was die wählbaren Aktivitäten der Kategorie mit ihren Plätzen bringen. Reicht das nicht, ist die Regel markiert.',
      needed: 'Bedarf',
      offered: 'Bieten höchstens',
      ruleShort: 'reicht nicht',
    },
    items: {
      heading: 'Aktivitäten',
      viewCatalogue: 'Katalog ansehen',
      none: 'Noch keine Aktivitäten.',
      firstProposedAt: 'Eingereicht am',
      /** The order of the table: under the day an activity starts on, as the catalogue numbers them, or by the first submission. */
      order: 'Reihenfolge',
      orderDay: 'Tag und Beginn',
      orderNumber: 'Nummer und Anlage',
      orderProposed: 'Eingereicht am',
      /** The header of a day's activities: "Mo., 21.06.2027 · 12 Aktivitäten". */
      dayGroup: (day: string, count: number) => `${day} · ${count} ${byCount(count, 'Aktivität', 'Aktivitäten')}`,
      dayNone: (count: number) => `Ohne Termin · ${count} ${byCount(count, 'Aktivität', 'Aktivitäten')}`,
      /** The activity just saved does not pass the filter. */
      savedHidden: 'Die gespeicherte Aktivität ist durch den Filter ausgeblendet.',
      /** An activity without places and without classes: its teachers alone. */
      staffOnly: 'nur Lehrkräfte',
      /** An activity with a session over a night. */
      overnight: 'mit Übernachtung',
      /** Below an activity's places: how many of them its teachers filled directly. */
      directlyPlaced: (count: number) => `davon ${count} direkt eingeteilt`,
      grades: 'Schulstufen',
      allGrades: 'alle',
      /** Where a submitted activity's places go, the cells still short of the target: "5. Schulstufe, 4.–5. EH". */
      brings: (cells: string) => `bringt Plätze in: ${cells}`,
      bringsNothing: 'nur, wo das Ziel erreicht ist',
      /** The lead is not plainly available on a day of the activity; the days as format.ts formatDay writes them. */
      leadLimited: (days: string) => `Leitung am ${days} nicht oder nur wenn nötig verfügbar`,
      /** The companions named against the number the lead wants: "Begleitung 1 von 2". */
      companionsOf: (named: number, wanted: number) => `Begleitung ${named} von ${wanted}`,
      fixedFor: (classes: string) => wholeClasses(classes),
      reviewNote: (note: string) => `Rückmeldung: ${note}`,
      participants: 'Teilnehmer*innen',
      propose: 'Einreichen',
      proposed: 'Eingereicht.',
      unpropose: 'Zurück zum Entwurf',
      delete: 'Löschen',
      deleted: 'Entwurf gelöscht.',
      approve: 'Genehmigen',
      approved: 'Genehmigt.',
      return: 'Zurückgeben',
      withdraw: 'Zurückziehen',
    },
    /** Returning or withdrawing an item, with the note or reason it needs. */
    pending: {
      returnTitle: (title: string) => `${title} zurückgeben`,
      withdrawTitle: (title: string) => `${title} zurückziehen`,
      returnNote: 'Rückmeldung an die Lehrkräfte',
      /** The lead's only activity in the registration, with the duty to lead: a note, no bar. */
      leadsNothing: (name: string) => `${name} leitet dann in dieser Anmeldung nichts.`,
    },
  },

  /** Eingereichte.vue: the organizer goes through the submitted activities one after the other. */
  review: {
    heading: 'Eingereichte Aktivitäten prüfen',
    organizersOnly: 'Diese Seite ist für die Organisation.',
    link: 'Eingereichte Aktivitäten prüfen',
    back: 'Zurück zum Überblick',
    /** The order of the queue: by the first submission, or under the day an activity starts on. */
    order: 'Reihenfolge',
    orderProposed: 'Eingereicht am',
    orderDay: 'Tag und Beginn',
    /** "3 von 12" */
    position: (n: number, total: number) => `${n} von ${total}`,
    none: 'Keine eingereichte Aktivität wartet.',
    skip: 'Überspringen',
    before: 'Plätze und Bedarf ohne diese Aktivität',
    after: 'Plätze und Bedarf mit dieser Aktivität',
    checking: 'Plätze und Bedarf werden geladen.',
    returned: 'Zurückgegeben.',
    withdrawn: 'Zurückgezogen.',
  },

  /** Katalog.vue: the catalogue as students read it and the school prints it. */
  catalogue: {
    title: 'Katalog',
    titleOf: (campaign: string) => `Katalog ${campaign}`,
    projectDays: (days: string) => `Projekttage: ${days}`,
    print: 'Drucken',
    empty: 'Der Katalog ist noch leer.',
    /** A session's credited minutes, "angerechnet 240 min + 60 min". */
    credited: (minutes: string) => `angerechnet ${minutes}`,
    places: (places: number) => `${places} ${byCount(places, 'Platz', 'Plätze')}`,
    fixedAndPlaces: (classes: string, places: number) => `${wholeClasses(classes)}, dazu ${places} ${byCount(places, 'freier Platz', 'freie Plätze')}`,
    fixed: (classes: string) => wholeClasses(classes),
    /** Who may choose the item: "für 9., 10. Schulstufe · 5A". */
    forWhom: (who: string) => `für ${who}`,
    grades: (grades: readonly number[]) => `${grades.join('., ')}. Schulstufe`,
    allGrades: 'alle Schulstufen',
    fee: (amount: string) => `Kosten: ${amount}`,
    /** The filter by category, above the activities. */
    categoryFilter: 'Kategorie',
    allCategories: 'alle',
  },

  /** Aktivitaet.vue: proposing or editing an activity. */
  item: {
    editTitle: 'Aktivität bearbeiten',
    /** A refusal that names a session, counted from 1: "… (Termin 2)". */
    inSession: (problem: string, session: number) => `${problem} (Termin ${session})`,
    onDate: (problem: string, day: string) => `${problem} (${day})`,
    /** The activity against a day's minimum length, under the sessions. */
    length: {
      met: (day: string, minimum: number, credited: number) => `${day}: Mindestlänge ${minimum} Minuten, angerechnet ${credited} ✓`,
      short: (day: string, minimum: number, credited: number) => `${day}: Mindestlänge ${minimum} Minuten, angerechnet nur ${credited} – so wird die Aktivität nicht angenommen`,
    },
    unknownTeachers: 'Eine Lehrkraft steht nicht in den Klassenlisten',
    reviewNote: (note: string) => `Rückmeldung der Organisation: ${note}`,
    title: 'Titel',
    description: 'Beschreibung',
    location: 'Ort oder Treffpunkt',
    teachers: {
      /** The chip's label for a screen reader. */
      remove: (name: string) => `${name} entfernen`,
      search: 'Lehrkraft hinzufügen',
      add: (name: string) => `${name} hinzufügen`,
      /** The select naming which teacher leads, and the lines around it. */
      lead: 'Leitung',
      noLead: 'Noch leitet niemand: Bitte wählen, wer die Aktivität leitet.',
      leadRule: 'Wer hinzugefügt wird oder sich als Begleitung einträgt, begleitet. Die Leitung wechselt nur, wenn die Leitung sie übergibt oder die Organisation sie neu festlegt.',
      /** The lead of a submitted or approved activity hands it to one of its companions. */
      handOver: 'Leitung übergeben an',
      handOverSubmit: 'Leitung übergeben',
      handOverHint: 'Übergeben geht an eine Begleitung; eine andere Lehrkraft zuerst als Begleitung hinzufügen und speichern.',
      handOverConfirm: (name: string) => `Die Leitung an ${name} übergeben? Die bisherige Leitung bleibt als Begleitlehrkraft eingetragen; die Begleitlehrkräfte verwaltet danach die neue Leitung.`,
      /** A teacher not plainly available on some of the activity's days, the days as format.ts formatDay writes them. */
      unavailableOn: (name: string, days: string) => `${name} ist am ${days} nicht verfügbar.`,
      ifNeededOn: (name: string, days: string) => `${name} ist am ${days} nur verfügbar, wenn es nötig ist.`,
      /** How many companions the lead wants beside them (the school's wish 6). */
      wanted: 'Begleitlehrkräfte insgesamt (0–8, ohne Leitung)',
      wantedHint: 'Wie viele Lehrkräfte neben der Leitung mitkommen sollen; bereits eingetragene Begleitlehrkräfte zählen mit. Was noch fehlt, steht unter „Begleitung gesucht“, und Lehrkräfte tragen sich dort selbst ein.',
      /** "noch 1 gesucht" */
      sought: (count: number) => `noch ${count} gesucht`,
      complete: 'Begleitung vollständig',
    },
    sessions: {
      intro: 'Eine Aktivität hat meist einen Termin: einen zusammenhängenden Zeitraum, auch über mehrere Tage, etwa ein Ausflug von Dienstag 8:00 bis Mittwoch 13:00. Er liegt in den Einheiten der Schule oder nach der Uhrzeit. Einen weiteren Termin gibt es nur, wenn die Aktivität unterbrochen ist, etwa je zwei Einheiten am Montag und am Mittwoch: Wer eingeteilt ist, nimmt an allen Terminen teil. Findet dieselbe Aktivität noch einmal für andere Schüler*innen statt, ist das eine eigene Aktivität. Angerechnet werden die Unterrichtsminuten der Einheiten, die ein Termin belegt, ohne Pausen. Liegt der gesamte Termin außerhalb des Stundenrasters, zählt stattdessen seine tatsächliche Dauer.',
      /** The heading of the only session. */
      single: 'Termin',
      session: (number: number) => `Termin ${number}`,
      /** Whether the session is placed in the period grid or by the clock. */
      mode: 'Angabe in',
      byPeriods: 'Einheiten',
      byClock: 'Uhrzeit',
      fromPeriod: 'ab Einheit',
      count: 'Anzahl Einheiten',
      location: 'Ort',
      startsOn: 'Beginn am',
      /** The clock time after "Beginn am" and "Ende am". */
      at: 'um',
      endsOn: 'Ende am',
      remove: 'Termin entfernen',
      add: 'Weiterer Termin für dieselbe Gruppe (nur bei Unterbrechung)',
    },
    participation: {
      heading: 'Teilnahme',
      fixedClasses: 'Ganze Klassen, die teilnehmen (sie wählen für diese Zeit nichts)',
      /** The places of an activity for fixed classes: those other students may rank. */
      extraPlaces: 'Zusätzliche Plätze für andere Schüler*innen',
      minParticipants: 'Mindestzahl',
      cancellable: 'Darf ausfallen, wenn die Mindestzahl bei der Zuteilung nicht erreicht wird',
      /** No places and no classes: nobody ranks it and nobody is placed into it. */
      staffOnly: 'Ohne Plätze und ohne ganze Klassen ist die Aktivität nur für Lehrkräfte: Schüler*innen sehen sie nicht im Katalog, und niemand kann sie wählen.',
      eligibleGrades: 'Angeboten für Schulstufen (keine Auswahl: alle)',
      eligibleClasses: 'Angeboten für Klassen (keine Auswahl: alle)',
    },
    fee: {
      amount: 'Kosten in Euro (leer: keine)',
      note: 'Wofür',
    },
    categories: {
      heading: 'Kategorien',
      intro: 'Für die Regeln der Anmeldung, etwa „mindestens eine Sport-Aktivität“. Eine Aktivität kann zu mehreren Kategorien gehören.',
      none: 'Die Schule hat noch keine Kategorien.',
    },
    saveAndPropose: 'Speichern und einreichen',
    /** The gate on new offers (the registration's lock) and what the activity brings, below the sessions. */
    gate: {
      brings: (cells: string) => `Diese Aktivität bringt Plätze dorthin, wo noch welche fehlen: ${cells}.`,
      bringsNothing: 'Diese Aktivität bringt Plätze nur dorthin, wo das Ziel schon erreicht ist.',
      servesNothing: 'Diese Aktivität findet außerhalb der Zeiten statt, für die Plätze geplant werden. Deshalb wird sie in „Plätze und Bedarf“ nicht mitgezählt.',
      /** The refusal, a sentence per day; `periods` null for a day counted whole. */
      refused: (day: string, periods: string | null) => periods === null ? `Am ${day} hat jede Schulstufe dieser Aktivität ihr Ziel erreicht.` : `Am ${day} hat jede Schulstufe dieser Aktivität in der ${periods} ihr Ziel erreicht.`,
      advice: 'Wähle eine Zeit, in der noch Plätze fehlen, oder nimm eine Schulstufe dazu, der noch Plätze fehlen.',
      organizerAnyway: 'Als Organisation kannst du sie trotzdem einreichen und genehmigen.',
    },
    /** A class in two class activities at once: the other one, with its lead and the time they share. */
    conflict: (className: string, day: string, from: string, to: string, title: string, lead: string) => `Die ${className} ist am ${day} von ${from} bis ${to} schon in ‚${title}‘ (Leitung: ${lead}). Eine Klasse kann zur selben Zeit nur in einer Klassenaktivität sein.`,
    participants: {
      heading: (count: number) => `Teilnehmer*innen (${count})`,
      cancelled: 'Diese Aktivität fällt aus: Bei der Zuteilung wurde die Mindestzahl an Teilnehmer*innen nicht erreicht.',
      none: 'In diese Aktivität ist niemand eingeteilt.',
      lead: (name: string) => `Leitung: ${name}`,
      companions: (names: string) => `Begleitung: ${names}`,
    },
    /** The companions alone, for the lead of a submitted or approved activity and for the organizer: the rest of the form is not changed there. */
    companions: {
      heading: 'Begleitung',
      intro: 'Hier änderst du nur die Begleitung und wie viele gesucht werden; alles andere bleibt, wie die Aktivität eingereicht ist.',
      save: 'Begleitung speichern',
      saved: 'Begleitung gespeichert.',
    },
  },

  /** Verfuegbarkeit.vue: a teacher's own availability on the project days of the registrations collecting activities. */
  availability: {
    intro: 'Trag ein, an welchen Projekttagen du für eine Aktivität da bist. Ohne Eintrag giltst du als verfügbar. Einen Grund gibst du nicht an.',
    none: 'Deine Verfügbarkeit trägst du hier ein, solange Lehrkräfte Aktivitäten einreichen können. Zurzeit ist keine Anmeldung in dieser Phase. Für spätere Änderungen wende dich an die Organisation.',
    teachersOnly: 'Die Verfügbarkeit tragen die Lehrkräfte ein.',
    /** The label of a day's choice for a screen reader, the day as format.ts formatDay writes it. */
    statusOn: (day: string) => `Verfügbarkeit am ${day}`,
    saved: 'Gespeichert.',
    link: 'Meine Verfügbarkeit eintragen',
  },

  /** Placements.vue: the students a teacher placed into an activity, and a class activity's list of who does not take part. */
  placements: {
    heading: 'Direkt eingeteilt',
    intro: 'Schüler*innen, die ohne Wahl in diese Aktivität kommen. Jede direkt eingeteilte Person belegt einen Platz der Aktivität. Mit Häkchen nimmt die Person an keiner Klassenaktivität ihrer Klasse teil, die sich zeitlich mit dieser Aktivität überschneidet. Das gilt jeweils für die gesamte Klassenaktivität, einschließlich aller weiteren Termine und Tage; die Lehrkräfte der Klassenaktivität sehen das und können die Person zurückholen. Ohne Häkchen bleibt sie in der Klassenaktivität und fehlt dort nur während dieser Aktivität.',
    search: 'Schüler*in suchen (Name oder Klasse)',
    place: (name: string, className: string) => `${name} (${className}) einteilen`,
    none: 'Niemand ist direkt eingeteilt.',
    pending: 'Wird mit dem Speichern der Aktivität eingetragen.',
    leavesClass: 'nimmt an Klassenaktivitäten, die sich damit überschneiden, gar nicht teil',
    /** The box's name for one student. */
    leavesClassOf: (name: string) => `${name} nimmt an Klassenaktivitäten, die sich damit überschneiden, gar nicht teil`,
    /** The class activities a placement takes the student out of. */
    leaves: (activities: string) => `nicht bei ${activities}`,
    other: (title: string, lead: string | null) => lead === null ? `„${title}“` : `„${title}“ (Leitung: ${lead})`,
    remove: (name: string) => `${name} austragen`,
    /** After an act that took a student out of another activity: whom to tell. */
    tell: (title: string, lead: string | null) => lead === null ? `Bitte der Leitung von „${title}“ Bescheid sagen: Die Person ist dort nicht mehr eingeteilt.` : `Bitte ${lead} Bescheid sagen: Die Person ist bei „${title}“ nicht mehr eingeteilt.`,
    absentHeading: 'Nimmt nicht teil',
    absentIntro: 'Schüler*innen der Klassen dieser Aktivität, die nicht dabei sind: hier eingetragen, oder in dieser Zeit direkt in eine andere Aktivität eingeteilt. Wer hier eingetragen wird, nennt keinen Grund.',
    absentNone: 'Alle Schüler*innen der Klassen nehmen teil.',
    takeOut: (name: string, className: string) => `${name} (${className}) nimmt nicht teil`,
    onList: 'eingetragen',
    placedIn: (activities: string) => `direkt eingeteilt in ${activities}`,
    bringBack: (name: string) => `${name} nimmt doch teil`,
    reclaim: (name: string) => `${name} zurückholen`,
    overnight: 'Diese Aktivität geht über Nacht: Bitte hier eintragen, wer nicht mitfährt.',
    /** In the form of a class activity not saved yet. */
    taken: (names: string) => `In dieser Zeit direkt in eine andere Aktivität eingeteilt und daher nicht dabei: ${names}. Nach dem Speichern lassen sie sich hier zurückholen.`,
    /** A teacher of the activity who may not change it: submitted, it is the organization's. */
    readOnly: 'Die Aktivität ist eingereicht. Die Organisation kann ihre Angaben ändern; die Leitung verwaltet die Begleitlehrkräfte. Alle Lehrkräfte dieser Aktivität können weiterhin Schüler*innen direkt einteilen.',
  },
  /** Begleitung.vue: the list a teacher joins an activity from (the school's wish 6). */
  companions: {
    heading: 'Begleitung gesucht',
    link: 'Begleitung gesucht',
    intro: 'Je Projekttag die Aktivitäten, die noch eine Begleitung suchen, und die, die du begleitest. Trag dich ein, wo du mitkommst; bis die Anmeldung öffnet, trägst du dich hier auch wieder aus, danach sag es der Leitung oder der Organisation.',
    teachersOnly: 'Die Liste ist für Lehrkräfte.',
    none: 'Zurzeit sucht keine Aktivität eine Begleitung.',
    noneOnDay: 'An diesem Tag sucht keine Aktivität eine Begleitung.',
    /** The caller's own availability on the day, the status as labels.availability writes it. */
    myStatus: (status: string) => `Deine Verfügbarkeit: ${status}`,
    notApproved: 'noch nicht genehmigt',
    leading: 'Du leitest diese Aktivität.',
    accompanying: 'Du begleitest diese Aktivität.',
    join: 'Ich begleite',
    leave: 'Austragen',
    joined: 'Eingetragen.',
    left: 'Ausgetragen.',
    /** Why joining is not possible (api-contracts COMPANION_PROBLEM_CODES). */
    problem: {
      none_sought: 'Die Begleitung ist vergeben.',
      overlap: 'Zur selben Zeit leitest oder begleitest du schon eine andere Aktivität.',
      unavailable: 'Du bist an diesem Tag als nicht verfügbar eingetragen.',
      campaign_state: 'Die Anmeldung ist abgeschlossen.',
      item_state: 'Diese Aktivität findet nicht mehr statt.',
    },
  },

  /** Lehrkraefte.vue: the organizer's overview of the teachers per project day. */
  planning: {
    intro: 'Je Lehrkraft und Projekttag: ob sie verfügbar ist, was sie leitet und was sie begleitet. Die Lehrkräfte tragen ihre Verfügbarkeit ein, solange Angebote gesammelt werden; hier änderst du sie für alle, bis die Anmeldung abgeschlossen ist.',
    readOnly: 'Die Anmeldung ist abgeschlossen: Die Verfügbarkeit bleibt, wie sie ist.',
    none: 'Noch keine Lehrkräfte in den Klassenlisten.',
    /** The activities as "3. Klettern, 7. Wien". */
    leads: (items: string) => `leitet ${items}`,
    accompanies: (items: string) => `begleitet ${items}`,
    free: 'frei',
    leadsNothing: (names: string) => `Leitet an keinem Tag etwas: ${names}.`,
    everyoneLeads: 'Jede Lehrkraft mit Leitungspflicht leitet an mindestens einem Tag etwas.',
    /** The teachers without the duty to lead: named, so nobody disappears from the overview. */
    withoutDuty: (names: string) => `Ohne Leitungspflicht: ${names}.`,
    duty: {
      /** The checkbox beside the abbreviation. */
      none: 'keine Leitungspflicht',
      has: 'Leitungspflicht',
      /** The preview's column. */
      head: 'Leitung',
    },
    statusOf: (name: string, day: string) => `Verfügbarkeit von ${name} am ${day}`,
    saved: 'Verfügbarkeit gespeichert.',
    export: 'Lehrkräfte je Tag als Excel',
    /** The import of an availability list on the teachers-by-day page. */
    csv: {
      title: 'Verfügbarkeit aus einer CSV-Datei',
      intro: 'Eine Zeile je Lehrkraft, benannt mit der E-Mail-Adresse oder dem Kürzel, und eine Spalte je Projekttag, mit dem Datum oder dem Wochentag als Namen (MO, DI, MI): leer heißt verfügbar, N nicht verfügbar, F nur wenn nötig. Die Liste der Schule mit den Spalten „Name“, „MO“, „DI“, „MI“, „Leitung“ und „Anmerkung“ wird so gelesen, wie die Tabelle sie exportiert; eine leere Spalte am Ende stört nicht. Eine Spalte „Anmerkung“ wird zur Notiz; eine Spalte „Leitung“ sagt mit N, wer keine Leitungspflicht hat, leer heißt Leitungspflicht; jede andere Spalte ist ein Fehler, damit kein Tag unbemerkt verloren geht. Übernommen wird, was in der Datei steht; Zeilen mit einem Problem werden übersprungen; Lehrkräfte und Tage, die nicht darin stehen, bleiben.',
      template: 'Vorlage mit dem Stand von heute',
      preview: 'Vorschau',
      file: 'Datei',
      paste: 'oder den Inhalt hier einfügen',
      check: 'Prüfen',
      apply: 'Übernehmen',
      ignored: (columns: string) => `Nicht gelesen: ${columns}`,
      problems: 'Diese Zeilen werden übersprungen, die anderen übernommen:',
      fileProblems: 'Die Datei lässt sich nicht lesen:',
      line: (line: number) => `Zeile ${line}`,
      /** After an unknown weekday column: the registration's days, as format.ts formatDay writes them. */
      registrationDays: (days: string) => `Die Anmeldung hat die Tage ${days}.`,
      nothing: 'Die Datei ändert nichts.',
      noteHead: 'Notiz',
      none: '–',
      applied: (days: number, notes: number, skipped: number, duties = 0) => `Übernommen: ${days} Tage geändert, ${notes} Notizen${duties === 0 ? '' : `, ${duties} ${byCount(duties, 'Leitungspflicht', 'Leitungspflichten')}`}${skipped === 0 ? '' : `; ${skipped} ${byCount(skipped, 'Zeile', 'Zeilen')} übersprungen`}.`,
    },
    /** One teacher's abbreviation, set beside the name. */
    shortName: {
      edit: (name: string) => `Kürzel von ${name} ändern`,
      label: (name: string) => `Kürzel von ${name}`,
      save: 'Kürzel speichern',
      saved: 'Gespeichert.',
    },
  },

  /** Wuensche.vue: a student's wishes, or an organizer's entry on a student's behalf. */
  wishes: {
    titleOnBehalf: 'Für jemanden eintragen',
    onBehalf: (name: string, className: string) => `Für ${name} (${className}). Was du einträgst, wird mit Begründung protokolliert.`,
    /** After the campaign's name: "bis zu 3 Wünsche je Zeitblock". */
    cap: (cap: number) => `bis zu ${cap} ${byCount(cap, 'Wunsch', 'Wünsche')} je Zeitblock`,
    closesAt: (when: string) => `Anmeldung bis ${when}`,
    lateUntil: (when: string) => `Nachfrist bis ${when}`,
    notAccepting: 'Gerade nimmt die Anmeldung keine Wünsche an.',
    lateNotice: 'Wünsche aus der Nachfrist kommen nach den anderen dran.',
    /** After the state's badge: the window (a WINDOW_LABELS word) and the version of the saved list. */
    savedIn: (window: string, version: number) => `gespeichert (${window}), Fassung ${version}`,
    nothingOffered: 'Für dich wird nichts angeboten.',
    /** After the title of a class activity, in bold. */
    fixedForYourClass: 'mit deiner ganzen Klasse',
    /** An activity a teacher placed the student into directly. */
    fixedDirectly: 'von einer Lehrkraft eingeteilt',
    /** A time group's legend, after its time: "1 von 3 Wünschen". */
    groupCount: (wishes: number, required: number) => `${wishes} von ${required} ${byCount(required, 'Wunsch', 'Wünschen')}`,
    wish: 'Wunsch',
    /** The select of an item's wish number. */
    wishFor: (title: string) => `Wunsch ${title}`,
    saveWishes: 'Wünsche speichern',
    allGroupsComplete: 'Alle Zeitblöcke haben ihre Wünsche, und die Regeln sind erfüllt.',
    wishesMissing: 'Es fehlen noch Wünsche.',
    /** Follows the two above for a student, whose changes need no button. */
    savedAtOnce: 'Jede Änderung wird sofort gespeichert.',
    /** The registration's rules, above the time blocks. */
    rules: {
      heading: 'Regeln der Anmeldung',
      intro: 'Deine Wünsche sollen diese Regeln erfüllen, so weit das Angebot es zulässt. Aktivitäten deiner Klasse zählen mit. Reichen deine Wünsche nicht, teilt dich die Zuteilung auf einen Restplatz ohne Kosten ein.',
      /** How far the wishes go, after the rule: "mit deinen Wünschen 1 von 1". */
      reach: (progress: string) => `mit deinen Wünschen ${progress}`,
      done: 'passt',
      notYet: 'dafür fehlen noch Wünsche',
      /** When the offer cannot reach the minimum. */
      limited: 'mehr bietet der Katalog nicht',
      /** When the wishes per time block leave no room for more next to the other rules. */
      crowded: 'mehr geht neben den anderen Regeln nicht',
    },
    exemptions: {
      title: 'Befreiungen',
      exempt: 'Befreien',
      from: (title: string) => `Von ${title} befreien`,
      thenChooses: (name: string) => `${name} wählt dann für diese Zeit selbst.`,
      done: 'Befreit.',
    },
  },

  /** Klasse.vue: a class as its class teacher sees it in a campaign. */
  schoolClass: {
    title: (className: string) => `Klasse ${className}`,
    schoolYear: (schoolYear: string) => `Schuljahr ${schoolYear}`,
    /** A student's places when there are none. */
    noPlace: 'kein Platz',
    /** What an activity offered for a gap still has. */
    freePlaces: (free: number) => `${free} ${byCount(free, 'freier Platz', 'freie Plätze')}`,
    placed: 'Eingeteilt. Die Person bekommt Bescheid.',
    attendanceSaved: 'Anwesenheit gespeichert.',
    classActivities: 'Klassenaktivitäten',
    noClassActivity: 'Keine Aktivität nimmt die ganze Klasse mit.',
    unplaced: {
      heading: (count: number) => `Noch nicht vollständig eingeteilt (${count})`,
      none: 'Alle Schüler*innen der Klasse haben an jedem Tag ihr Programm und erfüllen die Regeln.',
      /** After the student's name, in bold, and a colon. */
      minutesMissing: (minutes: number) => `${minutes} Minuten fehlen`,
      /** A rule a student misses, after the student's name: "Sport: es fehlt 1 Aktivität". */
      ruleMissing: (category: string, missing: string) => `${category}: ${missing}`,
      /** The places a student short of minutes already has, after a "·". */
      sofar: (items: string) => `bisher ${items}`,
      /** The placement form's label for a screen reader. */
      form: (name: string) => `${name} einteilen`,
      noOffer: 'Keine Aktivität mit freien Plätzen passt in die Lücke. Die Organisation kann anders einteilen.',
      itemFor: (name: string) => `Aktivität für ${name}`,
      reasonFor: (name: string) => `Begründung für ${name}`,
      place: 'Einteilen',
      note: 'Teile hier Schüler*innen ein, deren Tagesprogramm noch zu kurz ist oder die eine Regel noch nicht erfüllen. Sie werden benachrichtigt; die Organisation sieht deine Änderung und Begründung.',
    },
    attendance: {
      heading: 'Anwesenheit',
      intro: 'Je Projekttag und Termin, für die Schüler*innen der Klasse; getrennt von der Einteilung.',
      recordable: 'Eintragen und speichern; korrigieren kannst du bis zum Abschluss der Anmeldung.',
      readOnly: 'Nur lesen.',
      noSession: 'An diesem Tag hat niemand aus der Klasse einen Termin.',
      /** The day's form, for a screen reader. */
      ofDay: (day: string) => `Anwesenheit ${day}`,
      status: 'Anwesenheit',
      note: 'Notiz',
      statusOf: (name: string, title: string) => `Anwesenheit ${name}, ${title}`,
      noteOf: (name: string, title: string) => `Notiz ${name}, ${title}`,
      save: 'Anwesenheit speichern',
      export: 'Anwesenheit als Excel',
    },
    students: (count: number) => `Schüler*innen (${count})`,
    choicesLater: 'Wer sich schon angemeldet hat, zeigt diese Seite, sobald die Anmeldung läuft.',
  },

  /** Mails.vue: the queue, what waits and what became of every mail; the sending's pace and pause (mailTemplates.sending). */
  mails: {
    editorsOnly: 'Die E-Mails sehen die Administration und die Organisation.',
    intro: 'Jede E-Mail, die SchulWahl geschickt hat oder schicken wird, ohne Betreff und Text: an wen, von welcher Anmeldung, in welchem Stand. Wartende lassen sich verwerfen, fehlgeschlagene und verworfene noch einmal schicken.',
    heading: 'Alle E-Mails',
    filter: { state: 'Stand', kind: 'Art', campaign: 'Anmeldung', all: 'alle', apply: 'Anzeigen' },
    column: { kind: 'Art', campaign: 'Anmeldung', to: 'An', state: 'Stand', created: 'Seit', detail: 'Antwort' },
    /** The list's size against the whole match, as "200 von 612 E-Mails". */
    shown: (shown: number, total: number) => `${shown} von ${total} ${byCount(total, 'E-Mail', 'E-Mails')}`,
    none: 'Keine E-Mail passt dazu.',
    noCampaign: 'ohne Anmeldung',
    /** A waiting mail an organizer took out of the queue (state expired, detail discarded). */
    discardedState: 'verworfen',
    selectAll: 'Alle auswählen',
    selectNone: 'Keine auswählen',
    select: (to: string) => `E-Mail an ${to} auswählen`,
    discardSelected: (n: number) => `${n} ausgewählte verwerfen`,
    discardCampaign: (name: string) => `Alle wartenden von „${name}“ verwerfen`,
    discardConfirm: (n: number) => `${n} wartende ${byCount(n, 'E-Mail', 'E-Mails')} verwerfen? ${byCount(n, 'Sie wird', 'Sie werden')} nicht gesendet.`,
    discarded: (n: number) => `${n} ${byCount(n, 'E-Mail', 'E-Mails')} verworfen.`,
    retry: 'Noch einmal schicken',
    retried: 'Die E-Mail wartet wieder auf den Versand, als neue Kopie.',
  },

  /** Zuteilung.vue: the organizer's runs, their review and the changes after publication. */
  allocation: {
    published: 'Die Einteilung ist veröffentlicht. Die Benachrichtigungen sind zum Versand vorgemerkt; den Versandstatus findest du unter „E-Mails“.',
    changed: 'Die Einteilung ist geändert. Die Person bekommt Bescheid.',
    started: 'Die Zuteilung wird berechnet.',
    /** A student's place on a day in the review, in brackets after the item. */
    place: {
      wish: (rank: number | null) => `${rank}. Wunsch`,
      fallback: 'Restplatz',
      fixed: 'Klasse',
    },
    /** The published run: its exports, the changes since and the change by hand. */
    publication: {
      heading: 'Veröffentlicht',
      text: (seq: number, when: string) => `Berechnung ${seq} ist die Einteilung dieser Anmeldung (veröffentlicht ${when}). Die Schüler*innen sehen ihr Programm, die Lehrkräfte ihre Teilnehmer*innen, die Klassenvorstände die Plätze ihrer Klasse.`,
      assignmentsExport: 'Einteilung als Excel',
      attendanceExport: 'Anwesenheit als Excel',
      changes: (count: number) => `Änderungen seit der Veröffentlichung (${count})`,
      noChanges: 'Noch keine: kein Tausch, keine Einteilung durch einen Klassenvorstand, keine Änderung von Hand.',
      when: 'Wann',
      kind: 'Art',
      left: 'Nicht mehr',
      to: 'Neu',
      by: 'Durch',
      /** After the kind of a change that overrode a full item or a minimum. */
      forced: 'trotzdem',
    },
    /** The organizer's change by hand after publication. */
    change: {
      title: 'Einteilung von Hand ändern',
      rules: 'Es gilt dasselbe wie beim Tausch: in eine Aktivität mit freien Plätzen, die zur Schulstufe passt und sich mit nichts überschneidet, das bleibt; eine Klassenaktivität bleibt immer. Eine volle Aktivität, die Mindestzahl oder eine Regel der Anmeldung darfst du übergehen; das Häkchen dafür wird vermerkt.',
      from: 'Abmelden von',
      to: 'Einteilen in',
      /** The free places of an item, in brackets after it. */
      free: (count: number) => `${count} frei`,
      /** An item with more students than places, after a forced change: how many too many. */
      over: (count: number) => `${count} zu viel`,
      force: 'Ausnahme von Platzbegrenzung, Mindestzahl oder Regeln zulassen',
      forceHint: 'Die Ausnahme wird zusammen mit deiner Begründung protokolliert.',
      submit: 'Ändern',
    },
    start: {
      heading: 'Neue Berechnung',
      /** Around the setting's name: "… eingerichtet (SOLVER_URL); die Administration …". */
      noSolver: {
        before: 'Die Berechnung der Zuteilung ist auf diesem Server nicht eingerichtet',
        after: 'die Administration kann das ändern.',
      },
      unreachable: 'Das Rechenmodul antwortet nicht. Eine Berechnung würde fehlschlagen.',
      ready: 'Bereit zur Berechnung.',
      /** The versions of the calculation service, as a technical detail beside the status. */
      versions: (ortools: string, contract: string) => `Rechenmodul: OR-Tools ${ortools}, Schnittstelle ${contract}`,
      notClosed: 'Die Zuteilung lässt sich berechnen, sobald die Anmeldung beendet ist.',
      seed: 'Losnummer (leer: wird gezogen)',
      seedExample: 'z. B. 4711',
      limit: 'Suchaufwand je Ziel (1–60)',
      limitHint: 'Ein höherer Wert sucht gründlicher und findet eher eine bessere Einteilung, dauert aber länger. Wie lange, hängt von der Größe der Anmeldung und vom Server ab.',
      submit: 'Zuteilung berechnen',
      running: 'Die Zuteilung wird gerade berechnet …',
    },
    runs: {
      heading: (count: number) => `Berechnungen (${count})`,
      none: 'Noch keine Berechnung.',
      run: 'Berechnung',
      started: 'Gestartet',
      status: 'Stand',
      seed: 'Losnummer',
      limit: 'Suchaufwand',
      deficit: 'Fehlende Minuten',
      notCovered: 'Nicht alle Tage',
      published: 'veröffentlicht',
      repeatHint: (seed: number, limit: number) => `Mit Losnummer ${seed} und Suchaufwand ${limit} noch einmal berechnen`,
      repeat: 'Wiederholen',
    },
    /** The review of one run. */
    review: {
      heading: (seq: number) => `Berechnung ${seq}`,
      stale: 'Seit dieser Berechnung hat sich der Katalog, die Klassenlisten oder eine Klassenaktivität geändert. Bitte berechne neu, bevor du veröffentlichst.',
      computing: 'Wird berechnet …',
      /** A level the validator recomputed differently, after the level's name. */
      levelMismatch: (reported: number | string, recomputed: number | string) => `gemeldet ${reported}, nachgerechnet ${recomputed}`,
      /** In bold, followed by a colon and `warning`. */
      warningLead: 'Hinweis vor der Berechnung',
      warning: 'Für diese Aktivitäten kommen weniger Schüler*innen in Frage, als die Mindestzahl verlangt, und sie dürfen nicht ausfallen. Lässt sich keine Einteilung berechnen, liegt es meist daran: Ausfall erlauben, Mindestzahl senken oder die Aktivität zurückziehen.',
      possible: (possible: number, minimum: number) => `${possible} möglich, ${minimum} nötig`,
      /** In bold, followed by a colon and `ruleWarning`. */
      ruleWarningLead: 'Hinweis zu den Regeln',
      ruleWarning: 'Für diese Regeln reichen die Plätze der Kategorie nicht für alle Schüler*innen der Schulstufe, selbst wenn alle Plätze an sie gingen. Die Zuteilung erfüllt sie, so weit es geht; den übrigen fehlt die Regel.',
      /** A rule out of reach for a grade: "Sport: mindestens 1 Aktivität, 9. Schulstufe: 40 möglich, 60 nötig". */
      ruleOutOfReach: (rule: string, grade: number, possible: number, needed: number) => `${rule}, ${grade}. Schulstufe: ${possible} möglich, ${needed} nötig`,
      rules: 'Regeln',
      ruleMet: (met: number, students: number) => `${met} von ${students} erfüllt`,
      /** After the passes' sentence, when the registration has rules. */
      passesRules: 'Die Regeln der Anmeldung kommen nach den fehlenden Minuten und vor den Wünschen.',
      ruleGaps: (count: number) => `Fehlende Regeln (${count})`,
      meta: (seed: number, limit: number, solver: string, ortools: string, rules: number) => `Losnummer ${seed} · Suchaufwand ${limit} · Rechenmodul ${solver} (OR-Tools ${ortools}) · Regeln Version ${rules}`,
      runExport: 'Berechnung als Excel',
      levels: 'Ziele (in dieser Reihenfolge)',
      level: 'Ziel',
      firstPass: 'Wert (1. Runde)',
      secondPass: 'Wert (2. Runde)',
      comparison: 'Vergleich',
      proven: '✓ bestmöglich',
      notProven: '≈ vielleicht nicht bestmöglich',
      /** A level's difference to the compared run when there is none. */
      equal: 'gleich',
      passes: (passes: string, seed: number) => `Runden: ${passes}. Zuerst soll niemand ohne volle Woche bleiben, dann sollen so wenige Minuten wie möglich fehlen, dann sollen so wenige wie möglich im Schnitt späte Wünsche bekommen, dann soll das Ganze so gut wie möglich ausgehen. Bei Gleichstand entscheidet das Los mit der Losnummer ${seed}.`,
      wishes: 'Wünsche',
      rank: (rank: string) => `${rank}. Wunsch`,
      fallback: 'Restplatz',
      fixed: 'Klassenaktivität',
      cancelled: 'Fällt aus',
      deficits: (count: number) => `Fehlende Minuten (${count})`,
      noDeficits: 'Niemandem fehlen Minuten.',
      missing: 'Es fehlen',
      fallbacks: (count: number) => `Restplätze (${count})`,
      items: 'Aktivitäten',
      assigned: 'Eingeteilt',
      fixedClasses: 'Ganze Klassen',
      minimum: 'Mindestzahl',
      itemCancelled: 'fällt aus',
      itemEmpty: 'leer',
      classes: 'Klassen',
      classWithDeficit: 'Mit fehlenden Minuten',
      classWithFallback: 'Mit Restplatz',
      classMissingRule: 'Mit fehlender Regel',
      compare: 'Vergleich',
      compareWith: 'Mit Berechnung',
      compareOption: (seq: number, seed: number) => `Berechnung ${seq} (Losnummer ${seed})`,
      /** After the number of students in bold. */
      differences: (seq: number, otherSeq: number) => `Schüler*innen sind in Berechnung ${seq} anders eingeteilt als in Berechnung ${otherSeq}`,
      /** After a colon, when no student differs. */
      noDifferences: 'dieselbe Einteilung',
      /** Before the other run's items of a student. */
      instead: 'statt',
      studentList: (count: number) => `Schüler*innen (${count})`,
      window: 'Zeitraum',
      averageRank: 'Wunsch im Schnitt',
      noWishes: 'keine Wünsche',
      minutesMissing: (minutes: number) => `${minutes} min fehlen`,
      sources: (sources: string) => `Herkunft: ${sources}.`,
    },
    /** The publication of a reviewed run. */
    publish: {
      heading: 'Veröffentlichen',
      text: 'Diese Berechnung wird die Einteilung: Die Schüler*innen bekommen ihr Programm, die Klassenvorstände die Liste der noch nicht ganz Eingeteilten, die Lehrkräfte ausgefallener Aktivitäten Bescheid. Danach wird nicht mehr neu berechnet.',
      start: (seq: number) => `Berechnung ${seq} veröffentlichen …`,
      confirm: 'Veröffentlichung bestätigen',
      noCancellations: 'Keine Aktivität fällt aus.',
      cancellations: 'Diese Aktivitäten fallen aus, weil die Zuteilung ihre Mindestzahl nicht erreicht hat:',
      confirmCancellations: 'Ich bestätige, dass sie ausfallen.',
      submit: 'Jetzt veröffentlichen',
    },
    /** A reviewed run's counts, each after its number in bold. */
    counts: {
      students: (choosing: number) => `Schüler*innen, ${choosing} mit Wünschen`,
      covered: 'an allen Tagen eingeteilt',
      withDeficit: 'mit fehlenden Minuten',
      withFallback: 'mit Restplatz',
      missingRule: 'mit fehlender Regel',
      cancelled: 'ausgefallen',
      late: 'aus der Nachfrist',
      nonSubmitters: 'ohne Wünsche',
    },
  },

  /** Ergebnis.vue: a student's result, the swap window and the explanation. */
  result: {
    /** How a student came to an item. */
    source: {
      fixed: 'mit deiner Klasse',
      /** A fixed row of an activity the student's class is not in as a whole: a teacher placed them. */
      direct: 'von einer Lehrkraft eingeteilt',
      wish: (rank: number | null) => `dein ${rank}. Wunsch`,
      fallback: 'Restplatz, weil deine Wünsche hier nicht reichten',
      swap: 'dein Tausch',
      other: 'eingeteilt',
    },
    freePlaces: (count: number) => `${count} ${byCount(count, 'freier Platz', 'freie Plätze')}`,
    swapInto: (item: string) => `In „${item}“ wechseln?`,
    swapLeaving: (item: string, leaving: string) => `In „${item}“ wechseln und „${leaving}“ verlassen?`,
    swapped: 'Dein Tausch ist eingetragen.',
    notYet: 'Die Einteilung ist noch nicht veröffentlicht. Sobald die Organisation sie freigibt, steht sie hier.',
    publishedAt: (when: string) => `veröffentlicht ${when}`,
    noItem: 'An diesem Tag hast du keine Aktivität.',
    credited: (minutes: number) => `${minutes} Minuten angerechnet`,
    fee: (amount: string) => `Kosten: ${amount}`,
    deficit: (minutes: number) => `Hier fehlen dir noch ${minutes} Minuten. Dein Klassenvorstand teilt dich in eine Aktivität mit freien Plätzen ein.`,
    noFee: 'Deine Aktivitäten kosten nichts.',
    /** The registration's rules with what the student's activities bring. */
    rules: 'Regeln der Anmeldung',
    ruleMissing: 'Dein Klassenvorstand kann dich in eine passende Aktivität mit freien Plätzen einteilen.',
    feeTotal: (amount: string) => `Insgesamt ${amount}; wie und bis wann du zahlst, sagt dir die Schule.`,
    swap: {
      heading: 'Tauschen',
      window: (from: string, until: string) => `Von ${from} bis ${until} kannst du in eine Aktivität mit freien Plätzen wechseln. Wer zuerst kommt, bekommt den Platz. Eine Aktivität deiner Klasse bleibt, und dir darf danach nicht mehr Zeit fehlen als jetzt.`,
      noOffers: 'Gerade wird keine andere Aktivität für dich angeboten.',
      leaves: (items: string) => `Dafür verlässt du: ${items}`,
      submit: 'Wechseln',
    },
    changes: 'Änderungen seit der Veröffentlichung',
    left: (items: string) => `nicht mehr ${items}`,
    entered: (item: string) => `neu ${item}`,
    explanation: {
      heading: 'So kam deine Einteilung zustande',
      rule: (seed: number, seq: number) => `Zuerst sollte niemand ohne volle Woche bleiben, dann sollten so wenige Minuten wie möglich fehlen, danach sollten möglichst wenige Schüler*innen überwiegend ihre weniger bevorzugten Aktivitäten bekommen, und anschließend sollten die Wünsche insgesamt möglichst gut erfüllt werden. Wo zwei Einteilungen gleich gut waren, hat das Los entschieden, mit der Losnummer ${seed} (Berechnung ${seq}).`,
      late: 'Du hast dich in der Nachfrist angemeldet; deshalb kamen zuerst die anderen dran.',
      noWishes: 'Du hast keine Wünsche abgegeben und bist deshalb auf Restplätzen ohne Kosten.',
      /** After `rule`, when the registration has rules. */
      rules: 'Die Regeln der Anmeldung kamen nach den fehlenden Minuten und vor den Wünschen: Ein Restplatz ohne Kosten kann auch für eine Regel sein.',
    },
  },

  /** Verwaltung.vue: what a school administrator maintains. */
  admin: {
    adminsOnly: 'Die Verwaltung ist der Administration der Schule vorbehalten.',
    roster: 'Die Klassenlisten der Schule: aus den Entra-Gruppen oder aus einer CSV-Datei, mit Klassen und Schulstufen.',
    people: 'Wer sich eingeloggt hat, wem das Konto zugeordnet ist, wer Anmeldungen organisiert, wer gesperrt ist.',
    classTeachers: 'Wer welche Klasse führt und ihren Stand in einer Anmeldung sieht.',
    periods: 'Die Einheiten der Schule, in denen Lehrkräfte ihre Termine angeben.',
    mailTemplates: 'Die E-Mails, die eine Anmeldung verschickt: Einladungen, Erinnerungen, Listen an die Klassenvorstände.',
    mails: 'Was auf den Versand wartet, was gesendet ist, was fehlschlug; den Versand anhalten, Wartendes verwerfen.',
    retention: 'Welche Schuljahre Daten haben und wie lange sie bleiben; ein Schuljahr löschen, ein Jahr nach seinem Ende.',
    categories: 'Kategorien wie Sport oder Berufsorientierung, für die Regeln der Anmeldungen.',
    /** The school's language, chosen here for everyone; the page then loads again in it. */
    language: {
      title: 'Sprache',
      intro: 'In dieser Sprache zeigt SchulWahl allen an der Schule die Seiten, die Excel-Dateien und die E-Mails. E-Mail-Vorlagen, die jemand geändert hat, bleiben, wie sie sind.',
      label: 'Sprache der Schule',
      saved: 'Sprache gespeichert. Die Seite lädt neu.',
    },
  },

  /** Stammdaten.vue: the list in force, the Entra groups, a refresh from them, a CSV upload, the imports so far. */
  roster: {
    /** Column and field names the list in force, the imports and an import's page share. */
    source: 'Quelle',
    persons: 'Personen',
    fetched: 'Eingelesen',
    current: {
      title: 'Aktuelle Klassenlisten',
      none: 'Noch keine Klassenlisten. Lies sie aus den Entra-Gruppen ein oder lade eine CSV-Datei hoch.',
      committed: 'Übernommen',
    },
    groups: {
      title: 'Entra-Gruppen',
      intro: 'Trage hier die Gruppen ein, aus denen die Klassenlisten kommen: je Klasse eine Gruppe mit Klasse und Schulstufe, dazu die Gruppe der Lehrkräfte. Suche die Gruppen bei Microsoft nach ihrem Namen, oder trage die Gruppen-ID ein, die in Entra bei der Gruppe steht (Objekt-ID). Untergruppen werden mitgelesen: Trage eine Klasse deshalb nur einmal ein, entweder ihre Gruppe oder ihre Untergruppen (3A, oder 3AR und 3AG), sonst steht jede Person doppelt in der Liste.',
      id: 'Gruppen-ID',
      label: 'Bezeichnung',
      kind: 'Art',
      /** A row's field as a screen reader names it: the column and the group, "Klasse 5A". */
      fieldOf: (field: string, group: string) => `${field} ${group}`,
      /** The group a row's fields name while it has no label (or id) yet. */
      newGroup: 'neue Gruppe',
      none: 'Noch keine Gruppen eingetragen.',
      add: 'Gruppe hinzufügen',
      searchAtMicrosoft: 'Gruppen bei Microsoft suchen',
      save: 'Gruppen speichern',
      saved: 'Gruppen gespeichert.',
    },
    /** The search over the tenant's groups by name. */
    picker: {
      title: 'Gruppen suchen',
      /** Followed by the link `authorize` and a full stop. */
      authorizationNeeded: 'Für die Suche musst du dich bei Microsoft einloggen:',
      authorize: 'Bei Microsoft einloggen und Gruppen suchen',
      query: 'Name der Gruppe beginnt mit',
      allClasses: 'Alle Klassengruppen suchen',
      allClassesHint: 'Gruppen, deren Name eine Klasse ist (5A, 1B, …). Klasse und Schulstufe werden aus dem Namen vorbelegt: 5A → 9. Schulstufe.',
      takeAll: (count: number) => `Alle ${count} Gruppen übernehmen`,
      take: (group: string) => `${group} übernehmen`,
      noClassGroup: 'Keine Gruppe, deren Name eine Klasse ist und die noch nicht eingetragen ist.',
      noMatch: 'Keine Gruppe mit diesem Anfang.',
    },
    refresh: {
      title: 'Aus den Entra-Gruppen einlesen',
      /** `scopes`: the Graph permissions, comma-separated. */
      intro: (scopes: string) => `Du wirst zu Microsoft weitergeleitet und erlaubst SchulWahl, mit deinem Konto die Mitglieder der Gruppen zu lesen (${scopes}). Die Klassenlisten werden eingelesen und dir zur Prüfung gezeigt, bevor sie gelten.`,
      start: 'Jetzt einlesen',
      groupsFirst: 'Trage zuerst die Gruppen ein und speichere sie.',
    },
    csv: {
      title: 'CSV-Datei hochladen',
      /** Followed by the link `template`, a colon and `columns`. */
      columnsOf: 'Eine Zeile je Person mit den Spalten der',
      template: 'Vorlage',
      columns: 'E-Mail-Adresse, Vorname, Nachname, Klasse, Schulstufe, Art (student oder teacher), wahlweise die E-Mail-Adresse des Klassenvorstands. Trennzeichen Semikolon oder Komma. Beim ersten Einloggen wird jede Person an ihrer Schul-E-Mail-Adresse erkannt.',
      file: 'Datei',
      paste: 'Oder Inhalt einfügen',
      import: 'Einlesen',
    },
    batches: {
      title: 'Importe',
      changes: 'Änderungen',
      /** A refused import's changes column: how many problems it has. */
      problems: (count: number) => `${count} ${byCount(count, 'Problem', 'Probleme')}`,
    },
  },

  /** Import.vue: one import, its changes against the list in force, its problems, and the decision. */
  rosterImport: {
    title: 'Import',
    /** Above a list to take over, while a registration runs: a class new to the lists is not in it. */
    runningRegistrations: 'Eine Anmeldung läuft gerade. Wer neu in einer Klasse steht, die teilnimmt, macht ab der Übernahme mit; eine neue Klasse nimmt an keiner Anmeldung teil, bis sie in deren Einstellungen eingetragen ist.',
    /** When the import was read, and by whom. */
    fetchedBy: (when: string, who: string) => `${when} von ${who}`,
    decided: 'Entschieden',
    problems: {
      title: 'Probleme',
      rejected: 'Die Liste wurde abgelehnt. Behebe die Probleme in der Quelle und lies sie noch einmal ein.',
      line: (line: number) => `Zeile ${line}`,
    },
    warnings: 'Hinweise',
    changes: {
      title: 'Änderungen gegenüber den aktuellen Klassenlisten',
      summary: (counts: { added: number, removed: number, changed: number, unchanged: number }) => `${counts.added} neu, ${counts.removed} entfernt, ${counts.changed} geändert, ${counts.unchanged} unverändert.`,
      commit: 'Übernehmen',
      discard: 'Verwerfen',
      committed: 'Die Klassenlisten gelten jetzt.',
      discarded: 'Der Import wurde verworfen.',
      added: 'Neu',
      removed: 'Entfernt',
      changed: 'Geändert',
      kindAndClass: 'Art, Klasse',
      change: 'Änderung',
    },
  },

  /** Personen.vue: accounts, the roster person behind each, roles, blocking; every action with a reason. */
  people: {
    roles: 'Rollen',
    accounts: {
      title: 'Konten',
      filter: 'Name oder E-Mail',
      unboundOnly: 'nur ohne Zuordnung',
      apply: 'Filtern',
      none: 'Keine Konten gefunden.',
      lastSignIn: 'Zuletzt eingeloggt',
      person: 'Person',
      blocked: 'gesperrt',
      unbound: 'Nicht zugeordnet',
      notInRoster: 'Nicht in den aktuellen Klassenlisten',
    },
    /** The buttons in an account's row, by the action they prepare. */
    open: {
      bind: 'Zuordnen',
      grant: 'Rolle',
      block: 'Sperren',
      unblock: 'Entsperren',
    },
    /** The heading of the form an action is prepared in, with the account's name. */
    title: {
      bind: (name: string) => `${name} einer Person zuordnen`,
      block: (name: string) => `${name} sperren`,
      unblock: (name: string) => `${name} entsperren`,
      grant: (name: string) => `${name} eine Rolle geben`,
    },
    personSearch: 'Person aus den Klassenlisten',
    personSearchPlaceholder: 'Name, Klasse oder E-Mail',
    noPerson: 'Keine Person gefunden.',
    /** After a person found for binding whose current account the binding releases. */
    currentAccount: (account: string) => `derzeit Konto „${account}“, das dabei gelöst wird`,
    /** The form's submit button, by action. */
    submit: {
      bind: 'Zuordnen',
      block: 'Sperren',
      unblock: 'Entsperren',
      grant: 'Rolle geben',
    },
    grants: {
      none: 'Niemand hat eine besondere Rolle.',
      granted: 'Erteilt',
      /** When the role was granted, and by whom. */
      grantedBy: (when: string, who: string) => `${when} von ${who}`,
      revoke: 'Entziehen',
      /** The revocation form's heading: the person and the role. */
      revokeTitle: (name: string, role: string) => `${name}: ${role} entziehen`,
    },
  },

  /** Klassen.vue: the classes and their class teachers. */
  /** Kategorien.vue: the school's categories. */
  categories: {
    editorsOnly: 'Die Kategorien pflegen die Administration und die Organisation.',
    intro: 'Die Kategorien gelten für alle Anmeldungen der Schule. Eine Aktivität kann zu mehreren gehören; eine Regel einer Anmeldung verlangt mindestens so viele Aktivitäten oder Minuten aus einer Kategorie. Eine Kategorie, die verwendet wird, lässt sich nur umbenennen.',
    none: 'Noch keine Kategorien.',
    name: 'Name',
    usedBy: 'Verwendet von',
    usage: (items: number, rules: number) => `${items} ${byCount(items, 'Aktivität', 'Aktivitäten')} · ${rules} ${byCount(rules, 'Regel', 'Regeln')}`,
    rename: 'Umbenennen',
    renameOf: (name: string) => `${name} umbenennen`,
    removeOf: (name: string) => `${name} entfernen`,
    add: 'Kategorie hinzufügen',
    newName: 'Neue Kategorie',
    added: 'Kategorie hinzugefügt.',
    renamed: 'Kategorie umbenannt.',
    removed: 'Kategorie entfernt.',
  },

  classTeachers: {
    saved: 'Klassenvorstände gespeichert.',
    /** A class teacher the roster names, in the table. */
    byRoster: (name: string) => `${name} (laut Klassenliste)`,
    editorsOnly: 'Die Klassenvorstände ordnen die Administration und die Organisation zu.',
    intro: 'Der Klassenvorstand sieht, wer sich aus der Klasse schon angemeldet hat, und teilt nach der Veröffentlichung ein, wem noch Zeit fehlt. Steht er in der Klassenliste (Spalte class_teacher_email), gilt er auch hier.',
    noClasses: 'Es gibt noch keine Klassenlisten mit Klassen.',
    classTeacher: 'Klassenvorstand',
    assign: 'Zuordnen',
    assignTo: (className: string) => `Klassenvorstand der ${className} zuordnen`,
    of: (className: string) => `Klassenvorstand der ${className}`,
    removeTeacher: (name: string) => `${name} entfernen`,
    addTeacher: 'Lehrkraft hinzufügen',
    addPerson: (name: string) => `${name} hinzufügen`,
    /** The import of a teacher list on the class-teachers page. */
    csv: {
      title: 'Aus einer CSV-Datei',
      intro: 'Eine Zeile je Lehrkraft: die E-Mail-Adresse, das Kürzel und die Klasse, deren Klassenvorstand sie ist (bei zwei Klassen zwei Zeilen). Eine Liste aus dem Schulverwaltungsprogramm mit den Spalten „Address Email“, „Name“ und „Kv Von“ wird genauso gelesen; andere Spalten lässt der Import aus. Für jede Klasse, die in der Datei steht, gelten danach genau ihre Klassenvorstände aus der Datei; was die Klassenliste nennt, bleibt daneben.',
      template: 'Vorlage mit dem Stand von heute',
      file: 'Datei',
      paste: 'oder den Inhalt hier einfügen',
      check: 'Prüfen',
      apply: 'Übernehmen',
      ignored: (columns: string) => `Nicht gelesen: ${columns}`,
      problems: 'Diese Zeilen werden übersprungen, die anderen übernommen:',
      fileProblems: 'Die Datei lässt sich nicht lesen:',
      line: (line: number) => `Zeile ${line}`,
      shortNames: 'Kürzel',
      classes: 'Klassenvorstände',
      before: 'bisher',
      after: 'neu',
      none: '–',
      nothing: 'Die Datei ändert nichts.',
      withShortName: (name: string, shortName: string) => `${name} (${shortName})`,
      applied: (shortNames: number, classes: number, skipped: number) => `Übernommen: ${shortNames} Kürzel, ${classes} Klassen geändert${skipped === 0 ? '' : `; ${skipped} ${byCount(skipped, 'Zeile', 'Zeilen')} übersprungen`}.`,
    },
  },

  /** Zeiten.vue: the school's period grid. */
  periods: {
    adminsOnly: 'Das Stundenraster ändert die Administration der Schule.',
    intro: 'Die Einheiten der Schule, in denen Lehrkräfte ihre Termine angeben („ab der 2. Einheit, 2 Einheiten lang“). Termine zu anderen Zeiten, etwa Ausflüge, werden nach der Uhrzeit angegeben.',
    period: 'Einheit',
    starts: 'Beginn',
    ends: 'Ende',
    startsOf: (period: number) => `Beginn ${period}. Einheit`,
    endsOf: (period: number) => `Ende ${period}. Einheit`,
    add: 'Einheit anfügen',
    removeLast: 'Letzte entfernen',
    saved: 'Stundenraster gespeichert.',
  },

  /** Mailvorlagen.vue: the texts of the mails a campaign sends; their defaults are the group `mail`, a school's own texts are stored. */
  mailTemplates: {
    editorsOnly: 'Die E-Mail-Vorlagen ändern die Administration und die Organisation.',
    /** Before the link to the mails page, which took the sending over. */
    queueLink: 'Den Versand, was wartet und was gesendet ist, zeigt die Seite',
    intro: 'Die E-Mails, die eine Anmeldung verschickt. Platzhalter wie {{first_name}} füllt SchulWahl beim Versand; klick einen an, um ihn einzufügen.',
    mailOff: 'Der E-Mail-Versand ist auf diesem Server nicht eingerichtet: E-Mails warten, bis er es ist.',
    saved: 'Vorlage gespeichert.',
    testQueued: 'Eine Test-E-Mail an deine Adresse wartet auf den Versand.',
    /** Followed by a colon and the template's placeholders. */
    placeholders: 'Platzhalter',
    sendTest: 'Test-E-Mail an mich',
    /** The form of a template, by the mail's kind. */
    editing: (kind: string) => `${kind} bearbeiten`,
    subject: 'Betreff',
    body: 'Text',
    /** Beside a template's name: whether the school saved a text of its own or the default applies. */
    customText: 'Eigener Text der Schule',
    defaultText: 'Vorgegebener Text',
    reset: 'Zurücksetzen',
    resetConfirm: 'Den eigenen Text der Schule löschen? Danach gilt wieder der vorgegebene Text.',
    resetDone: 'Vorlage zurückgesetzt. Es gilt wieder der vorgegebene Text.',
    /** A saved text in a language other than the school's; the language as labels.locale names it. */
    otherLanguage: (language: string) => `Dieser Text wurde für „${language}“ geschrieben. Die Schule ist jetzt auf eine andere Sprache eingestellt: Übersetze ihn oder setze ihn zurück.`,
    placeholderHint: 'Ein Klick auf einen Platzhalter fügt ihn dort ein, wo der Cursor zuletzt stand: im Betreff oder im Text.',
    /** The outbox's pace and queue (GET /api/admin/mail/status), and pausing it. */
    sending: {
      heading: 'Versand',
      pace: (perHour: number) => `SchulWahl schickt höchstens ${perHour} ${byCount(perHour, 'E-Mail', 'E-Mails')} pro Stunde, eine nach der anderen: zuerst die persönlichen (eine Bestätigung, eine geänderte Einteilung, die Test-E-Mail), dann die an Lehrkräfte, zuletzt die an Schüler*innen.`,
      pauseHint: 'Steckt ein Fehler in einer E-Mail, halte den Versand an: Was wartet, bleibt liegen, bis du ihn fortsetzt.',
      paused: 'Der Versand ist angehalten. Die E-Mails warten, bis du ihn fortsetzt.',
      none: 'Keine E-Mail wartet.',
      waiting: (personal: number, staff: number, students: number) => {
        const total = personal + staff + students
        return `${byCount(total, 'Es wartet', 'Es warten')} ${total} ${byCount(total, 'E-Mail', 'E-Mails')}: ${personal} persönliche, ${staff} an Lehrkräfte, ${students} an Schüler*innen.`
      },
      /** The time as feedback.ts formatWhen writes it. */
      expectedEnd: (when: string) => `Bei diesem Tempo ist die letzte voraussichtlich am ${when} verschickt.`,
      pause: 'Versand anhalten',
      resume: 'Versand fortsetzen',
      pausedDone: 'Versand angehalten.',
      resumedDone: 'Versand fortgesetzt.',
    },
    /** What each placeholder stands for (apps/api/services/mail-templates.ts PLACEHOLDERS), listed beside it while editing. */
    placeholder: {
      first_name: 'Vorname der Person, die die E-Mail bekommt',
      name: 'Ganzer Name der Person, die die E-Mail bekommt',
      campaign: 'Name der Anmeldung, z. B. Projektwoche 2027',
      link: 'Link zur passenden Seite in SchulWahl',
      deadline: 'Ende des Anmeldezeitraums oder der Nachfrist, mit Datum und Uhrzeit',
      project_days: 'Die Projekttage',
      class_name: 'Die Klasse, z. B. 5A',
      window: 'Was zu Ende ist: der Anmeldezeitraum oder die Nachfrist',
      list: 'Die betroffenen Schüler*innen, eine Zeile je Person',
      programme: 'Die Einteilung: jede Aktivität mit Tag, Uhrzeit und Kosten, am Ende, was noch fehlt',
      swap_period: 'Die Tauschzeit mit Beginn und Ende; leer, wenn es keine gibt',
      activity: 'Titel der Aktivität',
      wish_count: 'Wie viele Schüler*innen sich die Aktivität gewünscht haben',
      minimum: 'Mindestzahl der Aktivität',
      changed_by: 'Wer die Einteilung geändert hat: der Klassenvorstand oder die Organisation',
      change: 'Was sich an der Einteilung geändert hat',
    },
    /** The values the test mail fills in, so that every placeholder shows filled. */
    sample: {
      first_name: 'Maria',
      name: 'Maria Muster',
      campaign: 'Projektwoche 2027',
      link: 'https://wahl.example.org/wahlen/…',
      deadline: 'Mo., 08.03.2027, 20:00',
      project_days: 'Mo., 21.06.2027, Di., 22.06.2027',
      class_name: '5A',
      window: 'Anmeldezeitraum',
      list: '- Maria Muster\n- Max Muster',
      programme: 'Mo., 21.06.: 3. Klettern (08:30 – 12:15)\nDi., 22.06.: 7. Wien (Klasse)',
      swap_period: 'Mo., 05.07.2027, 08:00 bis Mo., 12.07.2027, 20:00',
      activity: 'Töpfern',
      wish_count: '3',
      minimum: '8',
      changed_by: 'deinem Klassenvorstand',
      change: 'neu: Mo., 21.06.: 5. Töpfern (08:30 – 12:15)',
    },
  },

  /** Aufbewahrung.vue: the school years' records and the purge of one. */
  retention: {
    adminsOnly: 'Die Aufbewahrung ist der Administration der Schule vorbehalten; die Einsicht liest mit.',
    intro: 'Die Daten einer Projektwoche bleiben bis ein Jahr nach dem Ende ihres Schuljahrs. Danach kannst du sie hier löschen, mit Begründung; von selbst wird nichts gelöscht. Sichere vorher die Einteilung und die Kostenliste als Excel, falls die Buchhaltung danach fragt. Gelöscht ist gelöscht.',
    purged: 'Die Daten des Schuljahrs sind gelöscht.',
    years: 'Schuljahre',
    none: 'Noch keine Daten.',
    /** The columns of the years' table, besides the school year. */
    campaigns: 'Anmeldungen',
    batches: 'Importe',
    classTeachers: 'Klassenvorstände',
    retainedUntil: 'Aufbewahrung bis',
    expired: 'abgelaufen',
    purge: {
      title: 'Schuljahr löschen',
      /** After a school year that cannot be purged yet, in the list to choose from. */
      stillRetained: 'Aufbewahrung läuft noch',
      notArchived: 'eine Anmeldung ist nicht abgeschlossen',
      confirm: 'Zur Bestätigung das Schuljahr noch einmal',
      submit: 'Endgültig löschen',
      removed: 'Gelöscht',
    },
  },

  /** The workbooks the API writes (apps/api/lib/xlsx.ts): sheets, the columns the pages do not name, cell values. */
  workbook: {
    sheet: {
      missing: 'Stand der Anmeldung',
      items: 'Aktivitäten',
      sessions: 'Termine',
      attendance: 'Anwesenheit',
      /** Excel refuses an asterisk in a sheet's name: the pair form here, the asterisk everywhere else. */
      students: 'Schülerinnen und Schüler',
      participants: 'Teilnehmende',
      deficits: 'Fehlende Minuten',
      changes: 'Änderungen',
      planning: 'Lehrkräfte je Tag',
      rules: 'Fehlende Regeln',
    },
    column: {
      window: 'Zeitraum',
      savedAt: 'Zuletzt gespeichert',
      mails: 'E-Mails',
      title: 'Titel',
      description: 'Beschreibung',
      location: 'Ort',
      minParticipants: 'Mindestzahl',
      cancellableBelowMinimum: 'Fällt aus, wenn zu wenige kommen',
      fixedClasses: 'Ganze Klassen',
      grades: 'Schulstufen',
      classes: 'Klassen',
      fee: 'Kosten (€)',
      feeNote: 'Kosten: wofür',
      minutes: 'Minuten',
      starts: 'Beginn',
      ends: 'Ende',
      credits: 'Angerechnet (Tag: Minuten)',
      from: 'Von',
      until: 'Bis',
      attendance: 'Anwesenheit',
      note: 'Notiz',
      deficit: 'Fehlende Minuten',
      kind: 'Art',
      wish: 'Wunsch',
      assigned: 'Eingeteilt',
      fixed: 'Ganze Klassen',
      minimum: 'Mindestzahl',
      cancelled: 'Fällt aus',
      when: 'Wann',
      left: 'Nicht mehr',
      to: 'Neu',
      forced: 'Trotzdem',
      by: 'Durch',
      availability: 'Verfügbarkeit',
      leads: 'Leitet',
      accompanies: 'Begleitet',
      rule: 'Regel',
      reached: 'Erreicht',
      missing: 'Fehlt',
      categories: 'Kategorien',
    },
    yes: 'ja',
    no: 'nein',
    /** How a student came to an item, in brackets after it in the day's cell. */
    place: {
      wish: (rank: number | null) => `${rank}. Wunsch`,
      fallback: 'Restplatz',
      fixed: 'Klasse',
    },
    /** The source of a participant's place (school-core ASSIGNMENT_SOURCES), as the participants' sheet names it. */
    source: {
      fixed: 'Klassenaktivität',
      direct: 'Direkt eingeteilt',
      wish: 'Wunsch',
      fallback: 'Restplatz',
      swap: 'Tausch',
      manual: 'Von Hand',
    },
  },

  /** The names of the files the server sends for download; a school year arrives as "2026-27". */
  files: {
    catalogue: (schoolYear: string) => `katalog-${schoolYear}.xlsx`,
    missing: (schoolYear: string) => `anmeldestand-${schoolYear}.xlsx`,
    assignments: (schoolYear: string) => `einteilung-${schoolYear}.xlsx`,
    run: (seq: number) => `zuteilung-berechnung-${seq}.xlsx`,
    attendance: (schoolYear: string) => `anwesenheit-${schoolYear}.xlsx`,
    classAttendance: (className: string, schoolYear: string) => `anwesenheit-${className}-${schoolYear}.xlsx`,
    planning: (schoolYear: string) => `lehrkraefte-${schoolYear}.xlsx`,
    rosterTemplate: 'schulwahl-klassenlisten.csv',
    teacherListTemplate: 'schulwahl-lehrkraefte.csv',
    availabilityTemplate: 'schulwahl-verfuegbarkeit.csv',
  },

  /**
   * The values the server fills into a notice's placeholders: the lines of a
   * student's programme, who changed a place and what changed. The texts
   * around them are the mail templates: the defaults in `mail`, or what the
   * school saved.
   */
  notices: {
    programme: {
      /** After an item the student has with their class, in brackets. */
      fixed: 'Klasse',
      /** The fee of an item, its amount already formatted. */
      fee: (amount: string) => `Kosten: ${amount} €`,
      /** The last line when minutes are still missing: the days with their minutes. */
      missing: (days: string) => `Noch ohne Platz: ${days} – dein Klassenvorstand teilt dich ein.`,
    },
    /** The swap window: "Mo., 28.06.2027, 08:00 bis Mi., 30.06.2027, 18:00". */
    swapWindow: (from: string, until: string) => `${from} bis ${until}`,
    /** Who changed a student's place, as the sentence "… von {{changed_by}} geändert" needs it. */
    changedBy: {
      classTeacher: 'deinem Klassenvorstand',
      organizer: 'der Organisation',
      teacher: 'einer Lehrkraft der Aktivität',
    },
    /** What a teacher's change after publication was, kept with the change where a change by hand has its reason: nobody gives one for these. */
    teacherChange: {
      placed: 'Von einer Lehrkraft der Aktivität direkt eingeteilt',
      removed: 'Von einer Lehrkraft der Aktivität ausgetragen',
      takenOut: 'Nimmt an der Klassenaktivität nicht teil',
      returned: 'Zurück in der Klassenaktivität',
    },
    /** What a change by hand did. */
    change: {
      left: (items: string) => `nicht mehr ${items}`,
      entered: (item: string) => `neu ${item}`,
      replaced: (left: string, item: string) => `statt ${left} jetzt ${item}`,
    },
  },

  /**
   * The mail templates' default texts, by kind (packages/api-contracts/src/mail.ts
   * MAIL_KINDS): what a notice says until an organizer saves a text of the
   * school's own (Mailvorlagen.vue), which the database then keeps with the
   * language it was written in. The placeholders in double braces are the
   * kind's (apps/api/services/mail-templates.ts PLACEHOLDERS), filled when
   * the notice is written.
   */
  mail: {
    choice_invitation: {
      subject: '{{campaign}}: Wünsche bis {{deadline}} abgeben',
      body: 'Hallo {{first_name}},\n\ndie Anmeldung für {{campaign}} ({{project_days}}) ist offen. Gib deine Wünsche bitte bis {{deadline}} ab; du loggst dich mit deinem Schulkonto ein:\n\n{{link}}\n\nWann du dich im Anmeldezeitraum anmeldest, spielt für die Einteilung keine Rolle, und bis {{deadline}} kannst du deine Wünsche noch ändern. Nimmt deine ganze Klasse an einer Aktivität teil, wählst du nur für die übrige Zeit.\n\nViel Spaß beim Aussuchen!',
    },
    choice_reminder: {
      subject: 'Erinnerung: Wünsche für {{campaign}} bis {{deadline}}',
      body: 'Hallo {{first_name}},\n\ndeine Wünsche für {{campaign}} sind noch nicht vollständig. Gib sie bitte bis {{deadline}} ab:\n\n{{link}}\n\nHast du das gerade erledigt? Dann vergiss diese E-Mail einfach.',
    },
    grace_invitation: {
      subject: 'Nachfrist: Wünsche für {{campaign}} bis {{deadline}}',
      body: 'Hallo {{first_name}},\n\nder Anmeldezeitraum für {{campaign}} ist zu Ende, und deine Wünsche fehlen noch oder sind unvollständig. Bis {{deadline}} kannst du sie nachholen:\n\n{{link}}\n\nWünsche aus der Nachfrist kommen nach den anderen dran. Wer bis dahin keine abgibt, bekommt Restplätze ohne Kosten.',
    },
    grace_reminder: {
      subject: 'Letzte Erinnerung: Wünsche für {{campaign}} bis {{deadline}}',
      body: 'Hallo {{first_name}},\n\nmorgen endet die Nachfrist für {{campaign}}, und deine Wünsche fehlen noch:\n\n{{link}}',
    },
    missed_deadline: {
      subject: '{{campaign}}: keine Wünsche abgegeben',
      body: 'Hallo {{first_name}},\n\ndie Anmeldung für {{campaign}} ist zu Ende, und deine Wünsche sind nicht vollständig. Du bekommst deshalb Restplätze ohne Kosten, oder dein Klassenvorstand teilt dich ein. Deine Einteilung siehst du nach der Veröffentlichung hier:\n\n{{link}}',
    },
    class_missing: {
      subject: '{{campaign}}: fehlende Wünsche der {{class_name}} ({{window}})',
      body: 'Hallo {{first_name}},\n\naus deiner Klasse {{class_name}} fehlen bei {{campaign}} ({{window}}) noch diese Wünsche:\n\n{{list}}\n\nBitte erinnere diese Schüler*innen daran. Den Stand der Klasse siehst du hier:\n\n{{link}}',
    },
    result_published: {
      subject: '{{campaign}}: deine Einteilung',
      body: 'Hallo {{first_name}},\n\ndie Einteilung für {{campaign}} steht fest. Das ist dein Programm:\n\n{{programme}}\n\n{{#if swap_period}}Wenn du tauschen möchtest: In der Tauschzeit, {{swap_period}}, kannst du in eine Aktivität mit freien Plätzen wechseln.\n\n{{/if}}Alle Einzelheiten und wie deine Einteilung zustande kam, siehst du hier:\n\n{{link}}',
    },
    class_unplaced: {
      subject: '{{campaign}}: noch nicht alle aus der {{class_name}} eingeteilt',
      body: 'Hallo {{first_name}},\n\nbei {{campaign}} sind aus deiner Klasse {{class_name}} noch nicht alle für jeden Tag eingeteilt:\n\n{{list}}\n\nBitte teile sie in Aktivitäten mit freien Plätzen ein. Den Stand der Klasse siehst du hier:\n\n{{link}}',
    },
    item_cancelled: {
      subject: '{{campaign}}: {{activity}} fällt aus',
      body: 'Hallo {{first_name}},\n\ndeine Aktivität „{{activity}}“ bei {{campaign}} hat die Mindestzahl von {{minimum}} nicht erreicht ({{wish_count}} Wünsche) und fällt deshalb aus. Wer sie gewünscht hat, ist nach den weiteren Wünschen eingeteilt.\n\n{{link}}',
    },
    swap_confirmed: {
      subject: '{{campaign}}: dein Tausch',
      body: 'Hallo {{first_name}},\n\ndein Tausch bei {{campaign}} ist eingetragen. Das ist jetzt dein Programm:\n\n{{programme}}\n\nAlle Einzelheiten siehst du hier:\n\n{{link}}',
    },
    assignment_changed: {
      subject: '{{campaign}}: deine Einteilung wurde geändert',
      body: 'Hallo {{first_name}},\n\ndeine Einteilung bei {{campaign}} wurde von {{changed_by}} geändert: {{change}}\n\nDas ist jetzt dein Programm:\n\n{{programme}}\n\nAlle Einzelheiten siehst du hier:\n\n{{link}}',
    },
  },
}

/** The shape every language's catalogue has: the German one's keys, with any wording. */
export type Messages = typeof de
