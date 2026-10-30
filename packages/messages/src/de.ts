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
// Sie and du stand as the pages have them today; the mail texts an
// organizer edits are stored in the database and are not here.

export const de = {
  common: {
    appName: 'SchulWahl',
    /** The pages as the navigation, the links to them and their own headings name them. */
    page: {
      start: 'Startseite',
      signIn: 'Anmeldung',
      account: 'Mein Konto',
      campaigns: 'Wahlen',
      admin: 'Verwaltung',
      roster: 'Stammdaten',
      people: 'Konten und Rollen',
      classTeachers: 'Klassenvorstände',
      periods: 'Stundenraster',
      mailTemplates: 'Mailvorlagen',
      retention: 'Aufbewahrung',
      wishes: 'Meine Wünsche',
      result: 'Mein Ergebnis',
      allocation: 'Zuteilung',
      newItem: 'Neue Aktivität',
    },
    backToCampaign: 'Zur Wahl',
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
      student: 'Schüler/in',
      students: 'Schüler/innen',
      teachers: 'Lehrkräfte',
      sessions: 'Termine',
      day: 'Tag',
      fee: 'Beitrag',
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

  /** Values as the pages, the workbooks and the notices write them. */
  format: {
    /** One period of the school's grid: "2. EH". */
    period: (period: number) => `${period}. EH`,
    /** A span of periods: "2.–3. EH", one period as "2. EH". */
    periods: (from: number, to: number) => from === to ? `${from}. EH` : `${from}.–${to}. EH`,
    /** An amount already formatted as a number, with the currency: "15,00 €". */
    euros: (amount: string) => `${amount} €`,
  },

  /** The words for the API's codes, one map per list of codes; a test checks that every code has its word. */
  labels: {
    /** The privileged roles (apps/api/lib/roles.ts), as the account page names them. */
    role: {
      school_admin: 'Administration',
      campaign_organizer: 'Organisation einer Wahl',
      read_only_auditor: 'Einsicht (nur lesen)',
    },
    /** Student or teacher (school-core PERSON_KINDS). */
    kind: {
      student: 'Schüler/in',
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
    rosterProblem: {
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
    },
    /** What an accepted batch should be looked at for (apps/api/lib/models/roster.ts RosterWarning). */
    rosterWarning: {
      no_address: 'Ohne E-Mail-Adresse: Benachrichtigungen erreichen diese Person nicht',
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
      catalogue: 'Aktivitäten werden gesammelt',
      published: 'Katalog veröffentlicht',
      open: 'Wahl läuft',
      grace: 'Nachfrist',
      closed: 'Wahl beendet',
      allocating: 'Zuteilung läuft',
      review: 'Zuteilung in Prüfung',
      results: 'Ergebnis veröffentlicht',
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
      min_above_places: 'Die Mindestteilnehmerzahl ist größer als die Plätze',
      fixed_item_cancellable: 'Eine Aktivität für fixe Klassen findet immer statt und kann nicht abgesagt werden',
      fixed_class_unknown: 'Eine fixe Klasse gibt es in der Personenliste nicht',
      eligible_class_unknown: 'Eine wählbare Klasse gibt es in der Personenliste nicht',
      fixed_class_also_eligible: 'Eine Klasse ist fix zugeteilt und zugleich als wählbar eingetragen',
      no_teacher: 'Mindestens eine Lehrkraft ist nötig',
      teacher_twice: 'Eine Lehrkraft ist zweimal eingetragen',
    },
    /** Why a ranking was refused (school-core RANKING_PROBLEM_CODES). */
    rankingProblem: {
      unknown_group: 'Eine Zeitgruppe steht nicht zur Wahl',
      unknown_item: 'Eine Aktivität steht in dieser Zeitgruppe nicht zur Wahl',
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
      first: 'Anmeldefenster',
      late: 'Nachfrist',
    },
    /** The kinds of mail the window sends (packages/api-contracts/src/mail.ts MAIL_KINDS). */
    mailKind: {
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
    },
    /** What became of an allocation run (packages/api-contracts/src/allocation.ts RUN_STATUSES). */
    runStatus: {
      running: 'läuft',
      succeeded: 'fertig',
      failed: 'fehlgeschlagen',
      interrupted: 'unterbrochen',
    },
    /** Why a run failed (RUN_FAILURE_CODES). */
    runFailure: {
      solver_unreachable: 'Der Solver war nicht erreichbar',
      solver_answer_invalid: 'Die Antwort des Solvers entsprach nicht dem Vertrag',
      solver_infeasible: 'Keine Zuteilung erfüllt alle harten Regeln (meist eine Mindestteilnehmerzahl, die nicht absagbar ist)',
      solver_unknown: 'Der Solver fand im Zeitlimit keine Lösung',
      model_invalid: 'Das Modell war für den Solver nicht verwendbar',
      validation_failed: 'Die Prüfung des Ergebnisses ist fehlgeschlagen; es wurde verworfen',
      internal_error: 'Ein interner Fehler; die Protokolle des Servers sagen mehr',
    },
    /** The solver's answer per pass (school-core SOLVE_STATUSES). */
    solveStatus: {
      OPTIMAL: 'optimal',
      FEASIBLE: 'gültig, nicht bewiesen',
      INFEASIBLE: 'unlösbar',
      UNKNOWN: 'keine Lösung im Zeitlimit',
      MODEL_INVALID: 'Modell ungültig',
    },
    /** The levels of the lexicographic objective (school-core levelNames); a threshold level is named by its number. */
    level: {
      students_with_deficit: 'Schüler/innen mit fehlenden Minuten',
      deficit_minutes: 'Fehlende Minuten insgesamt',
      total_cost: 'Gesamtkosten (gewichtete Wunschnummern)',
      tiebreak: 'Los',
      over: (threshold: number) => `Schüler/innen mit Durchschnittswunsch über ${threshold}`,
    },
    /** Why the validator refused a result (school-core ALLOCATION_PROBLEM_CODES). */
    allocationProblem: {
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
    },
    /** The source of a student's place (school-core ASSIGNMENT_SOURCES). */
    assignmentSource: {
      fixed: 'Klassenaktivität',
      wish: 'Wunsch',
      fallback: 'Ersatzplatz',
      swap: 'Tausch',
      manual: 'händisch',
    },
    /** A change of the published run (packages/api-contracts/src/publication.ts CHANGE_KINDS). */
    changeKind: {
      swap: 'Tausch',
      place: 'Zuteilung',
      move: 'Umsetzung',
      remove: 'Herausnahme',
    },
    /** Why a move after publication is refused (school-core MOVE_PROBLEM_CODES), as the pages say it next to the item. */
    moveProblem: {
      not_offered: 'steht nicht zur Wahl',
      already_placed: 'schon zugeteilt',
      item_full: 'voll',
      not_placed: 'nicht zugeteilt',
      leaves_fixed: 'Klassenaktivität bleibt',
      below_minimum: 'die bisherige Aktivität käme unter ihr Minimum',
      overlap: 'überschneidet sich',
      coverage_lost: 'es würden Minuten fehlen',
      fills_nothing: 'füllt keine Lücke',
    },
    /** What was recorded for a student in a session (packages/api-contracts/src/attendance.ts ATTENDANCE_STATUSES). */
    attendanceStatus: {
      present: 'anwesend',
      absent: 'abwesend',
      excused: 'entschuldigt',
    },
    /** The state of a mail in the outbox (apps/api/lib/mail/outbox.ts MAIL_STATES). */
    mailState: {
      queued: 'in der Warteschlange',
      sending: 'wird gesendet',
      sent: 'gesendet',
      failed: 'fehlgeschlagen',
    },
    /** Why a template was refused (apps/api/lib/models/mail-templates.ts TemplateProblem). */
    templateProblem: {
      subject_syntax: 'Betreff: Fehler in einem Platzhalter',
      body_syntax: 'Text: Fehler in einem Platzhalter',
      unknown_placeholder: 'Unbekannter Platzhalter',
      subject_empty: 'Der Betreff darf nicht leer werden',
    },
    /** Why a period grid was refused (school-core PERIOD_PROBLEM_CODES). */
    periodProblem: {
      no_periods: 'Mindestens eine Einheit ist nötig',
      period_numbering: 'Die Einheiten sind ohne Lücke von 1 an zu nummerieren',
      period_time_invalid: 'Eine Uhrzeit ist keine (HH:MM)',
      period_ends_before_start: 'Eine Einheit endet nicht nach ihrem Beginn',
      periods_overlap: 'Eine Einheit beginnt, bevor die vorige endet',
    },
    /** What went wrong with a roster refresh from Entra groups, as the callback reports it in the page's query. */
    refreshError: {
      state_mismatch: 'Die Rückkehr von Microsoft passte nicht zu diesem Browser. Bitte noch einmal starten.',
      no_pending_refresh: 'Es war keine Aktualisierung gestartet, oder sie ist abgelaufen. Bitte noch einmal starten.',
      graph_authorization_failed: 'Die Berechtigung für Microsoft Graph wurde nicht erteilt oder passt nicht zu Ihrem Konto.',
      graph_unauthorized: 'Microsoft Graph hat das Token nicht angenommen.',
      graph_forbidden: 'Microsoft Graph verweigert das Lesen der Gruppen. Fehlen die Berechtigungen (GroupMember.Read.All, User.ReadBasic.All) oder die Zustimmung der IT?',
      graph_not_found: 'Eine der Gruppen gibt es in Entra nicht (mehr). Bitte die Gruppen-IDs prüfen.',
      graph_failed: 'Microsoft Graph hat nicht geantwortet. Bitte später noch einmal versuchen.',
      import_failed: 'Der Import ist fehlgeschlagen.',
    },
  },

  /** What a person is told when the API refuses, by its code; the validation message names a field, never a value. */
  errors: {
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
  },
}

/** The shape every language's catalogue has: the German one's keys, with any wording. */
export type Messages = typeof de
