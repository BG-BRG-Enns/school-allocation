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

const plural = new Intl.PluralRules('de')

/** `one` for a count the language treats as one, `other` for every other. */
function byCount(count: number, one: string, other: string): string {
  return plural.select(count) === 'one' ? one : other
}

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

  /** The shell around every page (App.vue). */
  shell: {
    navigation: 'Konto',
    signOut: 'Abmelden',
    serverDown: 'Der Server antwortet gerade nicht.',
    retry: 'Erneut versuchen',
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
    /** The languages a school may speak (packages/messages LOCALES), as the administration chooses one. */
    locale: {
      'de': 'Deutsch (du)',
      'de-formal': 'Deutsch (Sie zu Lehrkräften und Verwaltung)',
      'en': 'English',
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

  /** SignIn.vue: one button, to the school's Microsoft sign-in. */
  signIn: {
    intro: 'Melden Sie sich mit Ihrem Schulkonto (Microsoft) an.',
    signIn: 'Anmelden',
  },

  /** Start.vue: who is signed in, and their campaigns. */
  start: {
    /** Followed by the name, in bold, and a full stop. */
    signedInAs: 'Angemeldet als',
    noCampaigns: 'Es gibt noch keine Wahl, an der Sie teilnehmen oder die Sie betreuen.',
  },

  /** Account.vue: who the app takes the signed-in person for. */
  account: {
    atSchool: 'An der Schule',
    notInRoster: 'In der aktuellen Personenliste der Schule nicht (mehr) enthalten.',
    /** "Schüler/in, Klasse 5A (9. Schulstufe)" */
    student: (kind: string, className: string, grade: number | null) => `${kind}, Klasse ${className}${grade === null ? '' : ` (${grade}. Schulstufe)`}`,
    unbound: 'Noch keiner Person der Schule zugeordnet. Wenn Sie an einer Wahl teilnehmen sollen, wenden Sie sich bitte an die Verwaltung.',
    roles: 'Rollen',
    noRoles: 'Keine besonderen Rollen.',
    /** Followed by the link to the licences of the packages these pages bundle. */
    licences: 'SchulWahl ist freie Software unter der MIT-Lizenz. Die Lizenzen der Programmbibliotheken, die diese Seiten enthalten:',
  },

  /** Wahlen.vue: the campaigns the person may see, and the organizer's form for a new one. */
  campaigns: {
    none: 'Noch keine Wahl.',
    /** The table's column of campaign names. */
    campaign: 'Wahl',
    new: 'Neue Wahl',
    namePlaceholder: 'Projektwoche 2027',
    create: 'Wahl anlegen',
  },

  /** Wahl.vue: one campaign, its state and days, its activities, and what the person may do. */
  campaign: {
    title: 'Wahl',
    /** "Schuljahr 2026/27 · Projekttage: Mo., 21.06.2027, Di., 22.06.2027" */
    yearAndDays: (schoolYear: string, days: string) => `Schuljahr ${schoolYear} · Projekttage: ${days}`,
    /** The window in one line; the parts are joined with commas, the wishes follow after a dot. */
    window: {
      opens: (from: string, until: string) => `Wahl von ${from} bis ${until}`,
      late: (until: string) => `Nachfrist bis ${until}`,
      swap: (from: string, until: string) => `Ummelden von ${from} bis ${until}`,
      wishes: (wishes: number) => `${wishes} Wünsche je Zeitgruppe`,
    },
    myClass: (className: string) => `Meine Klasse ${className}`,
    projectDays: 'Projekttage',
    organization: {
      heading: 'Organisation',
      itemCounts: (counts: { draft: number, proposed: number, approved: number, withdrawn: number }) => `${counts.draft} Entwürfe · ${counts.proposed} eingereicht · ${counts.approved} genehmigt · ${counts.withdrawn} zurückgezogen`,
      collect: 'Aktivitäten sammeln',
      publish: 'Katalog veröffentlichen',
      open: 'Wahl öffnen',
      archive: 'Wahl abschließen',
      archiveConfirm: 'Die Wahl abschließen? Danach ändert sich nichts mehr: kein Tausch, keine Zuteilung, keine Anwesenheit.',
      close: 'Wahl beenden',
      editSettings: 'Einstellungen ändern',
      editMinimumAndSwap: 'Mindestminuten und Ummeldefenster ändern',
      editSwap: 'Ummeldefenster ändern',
      catalogueExport: 'Katalog als Excel',
    },
    /** The organizer's settings form; Wahlen.vue's form for a new campaign uses its name and day fields too. */
    settings: {
      label: 'Einstellungen der Wahl',
      name: 'Bezeichnung',
      projectDay: (day: number) => `Projekttag ${day}`,
      window: 'Wahl',
      opens: 'Beginn',
      closes: 'Ende',
      lateUntil: 'Nachfrist bis',
      swapFrom: 'Ummelden von',
      swapUntil: 'Ummelden bis',
      wishesPerGroup: 'Wünsche je Zeitgruppe',
      dailyMinimum: (grade: number) => `Mindestminuten je Tag, ${grade}. Schulstufe`,
      showTeachers: 'Der Katalog nennt die Lehrkräfte der Aktivitäten',
    },
    student: {
      viewResult: 'Mein Ergebnis ansehen',
      giveWishes: 'Wünsche abgeben oder ändern',
      offered: 'Was zur Wahl steht',
    },
    missing: {
      heading: 'Wahlstand',
      summary: (students: number, incomplete: number) => `${students} Schüler/innen, ${incomplete} ohne vollständige Wünsche.`,
      export: 'Wahlstand als Excel',
      mails: 'Nachrichten',
      enter: 'Eingeben',
    },
    demand: {
      heading: 'Bedarf',
      intro: 'Je Projekttag und Schulstufe: wie viele Schüler/innen einen Platz brauchen (ohne die in einer Klassenaktivität), und wie viele Plätze die eingereichten und genehmigten Aktivitäten ihnen anbieten.',
      cell: (needing: number, offered: number) => `${needing} brauchen · ${offered} angeboten`,
    },
    items: {
      heading: 'Aktivitäten',
      viewCatalogue: 'Katalog ansehen',
      none: 'Noch keine Aktivitäten.',
      fixedFor: (classes: string) => `fix für ${classes}`,
      reviewNote: (note: string) => `Rückmeldung: ${note}`,
      participants: 'Teilnehmer/innen',
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
    },
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
    places: (places: number) => `${places} Plätze`,
    fixedAndPlaces: (classes: string, places: number) => `fix für ${classes}, dazu ${places} Plätze`,
    fixed: (classes: string) => `fix für ${classes}`,
    /** Who may choose the item: "für 9., 10. Schulstufe · 5A". */
    forWhom: (who: string) => `für ${who}`,
    grades: (grades: readonly number[]) => `${grades.join('., ')}. Schulstufe`,
    allGrades: 'alle Schulstufen',
    fee: (amount: string) => `Beitrag ${amount}`,
  },

  /** Aktivitaet.vue: proposing or editing an activity. */
  item: {
    editTitle: 'Aktivität bearbeiten',
    /** A refusal that names a session, counted from 1: "… (Termin 2)". */
    inSession: (problem: string, session: number) => `${problem} (Termin ${session})`,
    unknownTeachers: 'Eine Lehrkraft ist nicht in der Personenliste',
    reviewNote: (note: string) => `Rückmeldung der Organisation: ${note}`,
    title: 'Titel',
    description: 'Beschreibung',
    location: 'Ort oder Treffpunkt',
    teachers: {
      /** The chip's label for a screen reader. */
      remove: (name: string) => `${name} entfernen`,
      search: 'Lehrkraft hinzufügen',
      add: (name: string) => `${name} hinzufügen`,
    },
    sessions: {
      intro: 'Ein Termin liegt in den Unterrichtseinheiten der Schule oder, etwa ein Ausflug, nach der Uhr. Angerechnet werden die Minuten, die die Lehrkraft je Projekttag angibt; Anreise und Pausen zählen nicht.',
      session: (number: number) => `Termin ${number}`,
      /** Whether the session is placed in the period grid or by the clock. */
      mode: 'Eingabe',
      byPeriods: 'nach Einheiten',
      byClock: 'nach Uhrzeit',
      fromPeriod: 'ab Einheit',
      count: 'Einheiten',
      location: 'Ort',
      startsOn: 'Beginn am',
      /** The clock time after "Beginn am" and "Ende am". */
      at: 'um',
      endsOn: 'Ende am',
      minutesOn: (day: string) => `Minuten am ${day}`,
      remove: 'Termin entfernen',
      add: 'Termin hinzufügen',
    },
    participation: {
      heading: 'Teilnahme',
      fixedClasses: 'Fix zugeteilte Klassen (die Aktivität findet für sie statt; sie wählen sie nicht)',
      /** The places of an activity for fixed classes: those other students may rank. */
      extraPlaces: 'Zusätzliche Plätze für andere Schüler/innen',
      minParticipants: 'Mindestteilnehmer/innen',
      cancellable: 'Darf bei zu wenigen Anmeldungen abgesagt werden',
      eligibleGrades: 'Wählbar für Schulstufen (keine Auswahl: alle)',
      eligibleClasses: 'Wählbar für Klassen (keine Auswahl: alle)',
    },
    fee: {
      amount: 'Beitrag in Euro (leer: keiner)',
      note: 'Wofür',
    },
    saveAndPropose: 'Speichern und einreichen',
    participants: {
      heading: (count: number) => `Teilnehmer/innen (${count})`,
      cancelled: 'Diese Aktivität wurde bei der Zuteilung abgesagt: zu wenige Wünsche für ihre Mindestteilnehmerzahl.',
      none: 'Niemand wurde dieser Aktivität zugeteilt.',
    },
  },

  /** Wuensche.vue: a student's wishes, or an organizer's entry on a student's behalf. */
  wishes: {
    titleOnBehalf: 'Wünsche eingeben',
    onBehalf: (name: string, className: string) => `Im Namen von ${name} (${className}). Die Eingabe wird mit Begründung protokolliert.`,
    /** After the campaign's name: "bis zu 3 Wünsche je Zeitgruppe". */
    cap: (cap: number) => `bis zu ${cap} Wünsche je Zeitgruppe`,
    closesAt: (when: string) => `Wahl bis ${when}`,
    lateUntil: (when: string) => `Nachfrist bis ${when}`,
    notAccepting: 'Die Wahl nimmt derzeit keine Wünsche an.',
    lateNotice: 'Wünsche aus der Nachfrist werden nach den anderen zugeteilt.',
    /** After the state's badge: the window (a WINDOW_LABELS word) and the version of the saved list. */
    savedIn: (window: string, version: number) => `gespeichert im ${window}, Fassung ${version}`,
    nothingOffered: 'Für Sie steht nichts zur Wahl.',
    /** After the title of a class activity, in bold. */
    fixedForYourClass: 'fix für Ihre Klasse',
    /** A time group's legend, after its time: "1 von 3 Wünschen". */
    groupCount: (wishes: number, required: number) => `${wishes} von ${required} Wünschen`,
    wish: 'Wunsch',
    /** The select of an item's wish number. */
    wishFor: (title: string) => `Wunsch ${title}`,
    saveWishes: 'Wünsche speichern',
    allGroupsComplete: 'Alle Zeitgruppen haben ihre Wünsche.',
    wishesMissing: 'Es fehlen noch Wünsche.',
    /** Follows the two above for a student, whose changes need no button. */
    savedAtOnce: 'Jede Änderung wird sofort gespeichert.',
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
    placed: 'Zugeteilt; die Schülerin oder der Schüler wird benachrichtigt.',
    attendanceSaved: 'Anwesenheit gespeichert.',
    classActivities: 'Klassenaktivitäten',
    noClassActivity: 'Keine Aktivität nimmt die ganze Klasse mit.',
    unplaced: {
      heading: (count: number) => `Nicht vollständig zugeteilt (${count})`,
      none: 'Alle Schüler/innen der Klasse haben an jedem Tag ihr Programm.',
      /** After the student's name, in bold, and a colon. */
      minutesMissing: (minutes: number) => `${minutes} Minuten fehlen`,
      /** The places a student short of minutes already has, after a "·". */
      sofar: (items: string) => `bisher ${items}`,
      /** The placement form's label for a screen reader. */
      form: (name: string) => `${name} zuteilen`,
      noOffer: 'Keine Aktivität mit freien Plätzen passt in die Lücke; die Organisation kann anders zuteilen.',
      itemFor: (name: string) => `Aktivität für ${name}`,
      reasonFor: (name: string) => `Begründung für ${name}`,
      place: 'Zuteilen',
      note: 'Die Zuteilung in eine Lücke ist der Weg des Klassenvorstands; die Schülerin oder der Schüler wird benachrichtigt, die Organisation sieht jede Änderung mit ihrer Begründung.',
    },
    attendance: {
      heading: 'Anwesenheit',
      intro: 'Je Projekttag und Termin, für die Schüler/innen der Klasse; getrennt von der Zuteilung.',
      recordable: 'Eintragen und speichern, Korrekturen jederzeit bis zum Abschluss der Wahl.',
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
    students: (count: number) => `Schüler/innen (${count})`,
    choicesLater: 'Wer schon gewählt hat, zeigt diese Seite, sobald die Wahl läuft.',
  },

  /** Zuteilung.vue: the organizer's runs, their review and the changes after publication. */
  allocation: {
    published: 'Das Ergebnis ist veröffentlicht; die Benachrichtigungen sind unterwegs.',
    changed: 'Die Zuteilung ist geändert; die Schülerin oder der Schüler wird benachrichtigt.',
    started: 'Die Zuteilung wird berechnet.',
    /** A student's place on a day in the review, in brackets after the item. */
    place: {
      wish: (rank: number | null) => `${rank}. Wunsch`,
      fallback: 'Ersatz',
      fixed: 'Klasse',
    },
    /** The published run: its exports, the changes since and the change by hand. */
    publication: {
      heading: 'Veröffentlicht',
      text: (seq: number, when: string) => `Lauf ${seq} ist das Ergebnis dieser Wahl (veröffentlicht ${when}). Die Schüler/innen sehen ihr Programm, die Lehrkräfte ihre Teilnehmer/innen, die Klassenvorstände die Plätze ihrer Klasse.`,
      assignmentsExport: 'Zuteilung als Excel',
      attendanceExport: 'Anwesenheit als Excel',
      changes: (count: number) => `Änderungen seit der Veröffentlichung (${count})`,
      noChanges: 'Noch keine: kein Tausch, keine Zuteilung durch einen Klassenvorstand, keine Änderung von Hand.',
      when: 'Wann',
      kind: 'Art',
      left: 'Nicht mehr',
      to: 'Neu',
      by: 'Durch',
      /** After the kind of a change that overrode a full item or a minimum. */
      forced: 'erzwungen',
    },
    /** The organizer's change by hand after publication. */
    change: {
      title: 'Zuteilung von Hand ändern',
      rules: 'Dieselben Regeln wie beim Tausch: in eine Aktivität mit freien Plätzen, die zur Schulstufe passt und sich mit nichts überschneidet, das bleibt; eine Klassenaktivität bleibt immer. Eine volle Aktivität oder ein Minimum darf die Organisation übergehen, mit Häkchen; das wird festgehalten.',
      from: 'Herausnehmen aus',
      to: 'Einteilen in',
      /** The free places of an item, in brackets after it. */
      free: (count: number) => `${count} frei`,
      force: 'Volle Aktivität oder Minimum übergehen (wird festgehalten)',
      submit: 'Ändern',
    },
    start: {
      heading: 'Lauf starten',
      /** Around the setting's name: "… eingerichtet (SOLVER_URL); eine Zuteilung …". */
      noSolver: {
        before: 'Auf diesem Server ist kein Solver eingerichtet',
        after: 'eine Zuteilung kann nicht berechnet werden.',
      },
      unreachable: 'Der Solver antwortet nicht. Ein Lauf würde fehlschlagen.',
      ready: (ortools: string, contract: string) => `Solver bereit (OR-Tools ${ortools}, Vertrag ${contract}).`,
      notClosed: 'Eine Zuteilung wird berechnet, sobald die Wahl beendet ist.',
      seed: 'Seed (leer: wird gezogen)',
      seedExample: 'z. B. 4711',
      limit: 'Zeitlimit pro Stufe (deterministische Sekunden, 1–60)',
      limitHint: 'Eine deterministische Sekunde dauert auf dem Server mehrere Sekunden; derselbe Seed mit demselben Limit ergibt dieselbe Zuteilung.',
      submit: 'Zuteilung berechnen',
      running: 'Ein Lauf wird gerade berechnet …',
    },
    runs: {
      heading: (count: number) => `Läufe (${count})`,
      none: 'Noch kein Lauf.',
      run: 'Lauf',
      started: 'Gestartet',
      status: 'Status',
      seed: 'Seed',
      limit: 'Limit',
      deficit: 'Fehlende Minuten',
      notCovered: 'Ohne alle Tage',
      published: 'veröffentlicht',
      repeatHint: (seed: number, limit: number) => `Noch einmal mit Seed ${seed} und Limit ${limit}: dieselbe Zuteilung, wenn sich nichts geändert hat`,
      repeat: 'Wiederholen',
    },
    /** The review of one run. */
    review: {
      heading: (seq: number) => `Lauf ${seq}`,
      stale: 'Seit diesem Lauf hat sich der Katalog, die Personenliste oder eine Klassenzuteilung geändert; das Ergebnis passt nicht mehr zur Wahl, wie sie jetzt steht. Für die Veröffentlichung ist ein neuer Lauf nötig.',
      computing: 'Wird berechnet …',
      /** A level the validator recomputed differently, after the level's name. */
      levelMismatch: (reported: number | string, recomputed: number | string) => `gemeldet ${reported}, nachgerechnet ${recomputed}`,
      /** In bold, followed by a colon and `warning`. */
      warningLead: 'Hinweis vor dem Lösen',
      warning: 'Für diese nicht absagbaren Aktivitäten kommen weniger Schüler/innen in Frage, als das Minimum verlangt. Schlägt der Lauf als unlösbar fehl, liegt es meist daran: absagbar machen, das Minimum senken oder die Aktivität zurückziehen.',
      possible: (possible: number, minimum: number) => `${possible} möglich, ${minimum} nötig`,
      meta: (seed: number, limit: number, solver: string, ortools: string, rules: number) => `Seed ${seed} · Limit ${limit} · Solver ${solver} (OR-Tools ${ortools}) · Regeln Version ${rules}`,
      runExport: 'Lauf als Excel',
      levels: 'Stufen',
      level: 'Stufe',
      firstPass: 'Wert (1. Durchgang)',
      secondPass: 'Wert (2. Durchgang)',
      comparison: 'Vergleich',
      proven: '✓ bewiesen',
      notProven: '≈ nicht bewiesen',
      /** A level's difference to the compared run when there is none. */
      equal: 'gleich',
      passes: (passes: string, seed: number) => `Durchgänge: ${passes}. Zuerst niemand ohne volle Woche, dann so wenige fehlende Minuten wie möglich, dann so wenige wie möglich mit hohem Durchschnittswunsch, dann das beste Gesamtergebnis; Gleichstand entscheidet das Los mit Seed ${seed}.`,
      wishes: 'Wünsche',
      rank: (rank: string) => `${rank}. Wunsch`,
      fallback: 'Ersatzplatz',
      fixed: 'Klassenaktivität',
      cancelled: 'Abgesagt',
      deficits: (count: number) => `Fehlende Minuten (${count})`,
      noDeficits: 'Niemandem fehlen Minuten.',
      missing: 'Fehlend',
      fallbacks: (count: number) => `Ersatzplätze (${count})`,
      items: 'Aktivitäten',
      assigned: 'Zugeteilt',
      fixedClasses: 'Fix (Klassen)',
      minimum: 'Minimum',
      itemCancelled: 'abgesagt',
      itemEmpty: 'leer',
      classes: 'Klassen',
      classWithDeficit: 'Mit fehlenden Minuten',
      classWithFallback: 'Mit Ersatzplatz',
      compare: 'Vergleich',
      compareWith: 'Mit Lauf',
      compareOption: (seq: number, seed: number) => `Lauf ${seq} (Seed ${seed})`,
      /** After the number of students in bold. */
      differences: (seq: number, otherSeq: number) => `Schüler/innen sind in Lauf ${seq} anders zugeteilt als in Lauf ${otherSeq}`,
      /** After a colon, when no student differs. */
      noDifferences: 'dieselbe Zuteilung',
      /** Before the other run's items of a student. */
      instead: 'statt',
      studentList: (count: number) => `Schüler/innen (${count})`,
      window: 'Fenster',
      averageRank: 'Ø Wunsch',
      noWishes: 'keine Wünsche',
      minutesMissing: (minutes: number) => `${minutes} min fehlen`,
      sources: (sources: string) => `Quellen: ${sources}.`,
    },
    /** The publication of a reviewed run. */
    publish: {
      heading: 'Veröffentlichen',
      text: 'Dieser Lauf wird das Ergebnis der Wahl: die Schüler/innen erhalten ihr Programm, die Klassenvorstände die Liste der nicht vollständig Zugeteilten, die Lehrkräfte abgesagter Aktivitäten die Absage. Danach ist kein weiterer Lauf möglich.',
      start: (seq: number) => `Lauf ${seq} veröffentlichen …`,
      confirm: 'Veröffentlichung bestätigen',
      noCancellations: 'Keine Aktivität wird abgesagt.',
      cancellations: 'Diese Aktivitäten finden nicht statt, weil zu wenige sie gewünscht haben:',
      confirmCancellations: 'Ich bestätige diese Absagen.',
      submit: 'Jetzt veröffentlichen',
    },
    /** A reviewed run's counts, each after its number in bold. */
    counts: {
      students: (choosing: number) => `Schüler/innen, ${choosing} mit Wahl`,
      covered: 'mit allen Tagen',
      withDeficit: 'mit fehlenden Minuten',
      withFallback: 'mit Ersatzplatz',
      cancelled: 'abgesagt',
      late: 'aus der Nachfrist',
      nonSubmitters: 'ohne Wünsche',
    },
  },

  /** Ergebnis.vue: a student's result, the swap window and the explanation. */
  result: {
    /** How a student came to an item. */
    source: {
      fixed: 'mit deiner Klasse',
      wish: (rank: number | null) => `dein ${rank}. Wunsch`,
      fallback: 'zugeteilt, da deine Wünsche hier nicht reichten',
      swap: 'dein Tausch',
      other: 'eingeteilt',
    },
    freePlaces: (count: number) => `${count} ${byCount(count, 'freier Platz', 'freie Plätze')}`,
    swapInto: (item: string) => `In „${item}“ wechseln?`,
    swapLeaving: (item: string, leaving: string) => `In „${item}“ wechseln und „${leaving}“ verlassen?`,
    swapped: 'Dein Tausch ist eingetragen.',
    notYet: 'Das Ergebnis ist noch nicht veröffentlicht. Sobald die Organisation die Zuteilung freigibt, steht es hier.',
    publishedAt: (when: string) => `veröffentlicht ${when}`,
    noItem: 'An diesem Tag hast du keine Aktivität.',
    credited: (minutes: number) => `${minutes} Minuten angerechnet`,
    fee: (amount: string) => `Beitrag ${amount}`,
    deficit: (minutes: number) => `Hier fehlen dir noch ${minutes} Minuten: dein Klassenvorstand teilt dich einer Aktivität mit freien Plätzen zu.`,
    noFee: 'Für deine Aktivitäten ist kein Beitrag zu zahlen.',
    feeTotal: (amount: string) => `Insgesamt ${amount}; die Schule sagt, wie und bis wann.`,
    swap: {
      heading: 'Tauschen',
      window: (from: string, until: string) => `Von ${from} bis ${until} kannst du in eine Aktivität mit freien Plätzen wechseln. Wer zuerst kommt, bekommt den Platz; eine Aktivität deiner Klasse bleibt, und es dürfen danach nicht mehr Minuten fehlen als jetzt.`,
      noOffers: 'Zur Zeit steht keine andere Aktivität für dich zur Wahl.',
      leaves: (items: string) => `Dafür verlässt du: ${items}`,
      submit: 'Wechseln',
    },
    changes: 'Änderungen seit der Veröffentlichung',
    left: (items: string) => `nicht mehr ${items}`,
    entered: (item: string) => `neu ${item}`,
    explanation: {
      heading: 'So kam die Zuteilung zustande',
      rule: (seed: number, seq: number) => `Zuerst sollte niemand ohne volle Woche bleiben, dann sollten so wenige Minuten wie möglich fehlen, dann so wenige Schüler/innen wie möglich überwiegend späte Wünsche bekommen, dann das Ganze so gut wie möglich ausgehen. Wo zwei Zuteilungen gleich gut waren, hat das Los entschieden, mit der aufgezeichneten Zahl ${seed} (Lauf ${seq}).`,
      late: 'Deine Wünsche kamen in der Nachfrist und wurden nach den anderen zugeteilt.',
      noWishes: 'Du hattest keine Wünsche abgegeben und wurdest auf freie Plätze ohne Beitrag gesetzt.',
    },
  },

  /** Verwaltung.vue: what a school administrator maintains. */
  admin: {
    adminsOnly: 'Die Verwaltung ist der Administration der Schule vorbehalten.',
    roster: 'Die Personenliste der Schule: aus den Entra-Gruppen oder aus einer CSV-Datei, mit Klassen und Schulstufen.',
    people: 'Wer sich angemeldet hat, wem das Konto zugeordnet ist, wer eine Wahl organisiert, wer gesperrt ist.',
    classTeachers: 'Wer welche Klasse führt und ihren Stand in einer Wahl sieht.',
    periods: 'Die Unterrichtseinheiten der Schule, in denen Lehrkräfte ihre Termine angeben.',
    mailTemplates: 'Die Texte der Nachrichten, die eine Wahl verschickt: Einladungen, Erinnerungen, Listen an die Klassenvorstände.',
    retention: 'Welche Schuljahre Aufzeichnungen haben und wie lange sie bleiben; das Löschen eines Schuljahrs, ein Jahr nach seinem Ende.',
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
    fetched: 'Gelesen',
    current: {
      title: 'Aktuelle Personenliste',
      none: 'Noch keine Personenliste übernommen. Importieren Sie die Personen aus den Entra-Gruppen oder aus einer CSV-Datei.',
      committed: 'Übernommen',
    },
    groups: {
      title: 'Entra-Gruppen',
      intro: 'Die Gruppen der Schule, aus denen die Personenliste gelesen wird: je Klasse eine Schülergruppe mit Klasse und Schulstufe, dazu die Gruppe der Lehrkräfte. Suchen Sie die Gruppen bei Microsoft nach ihrem Namen, oder tragen Sie die Gruppen-ID ein, die in Entra bei der Gruppe steht (Objekt-ID). Untergruppen werden mitgelesen: Eine Klasse, deren Schüler/innen in Untergruppen stehen, wird nur einmal eingetragen, entweder die Klassengruppe oder ihre Untergruppen (3A, oder 3AR und 3AG), sonst stehen die Personen doppelt in der Liste.',
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
      authorizationNeeded: 'Für die Suche ist eine Anmeldung bei Microsoft nötig:',
      authorize: 'Bei Microsoft anmelden und Gruppen suchen',
      query: 'Name der Gruppe beginnt mit',
      allClasses: 'Alle Klassengruppen suchen',
      allClassesHint: 'Gruppen, deren Name eine Klasse ist (5A, 1B, …). Klasse und Schulstufe werden aus dem Namen vorbelegt: 5A → 9. Schulstufe.',
      takeAll: (count: number) => `Alle ${count} Gruppen übernehmen`,
      take: (group: string) => `${group} übernehmen`,
      noClassGroup: 'Keine Gruppe, deren Name eine Klasse ist, die nicht schon eingetragen wäre.',
      noMatch: 'Keine Gruppe mit diesem Anfang.',
    },
    refresh: {
      title: 'Aus den Entra-Gruppen aktualisieren',
      /** `scopes`: the Graph permissions, comma-separated. */
      intro: (scopes: string) => `Sie werden zu Microsoft weitergeleitet und erlauben SchulWahl, mit Ihrem Konto die Mitglieder der Gruppen zu lesen (${scopes}). Die Liste wird gelesen und Ihnen zur Prüfung gezeigt, bevor sie gilt.`,
      start: 'Aus Entra-Gruppen aktualisieren',
      groupsFirst: 'Tragen Sie zuerst die Gruppen ein und speichern Sie sie.',
    },
    csv: {
      title: 'CSV-Datei hochladen',
      /** Followed by the link `template`, a colon and `columns`. */
      columnsOf: 'Eine Zeile je Person mit den Spalten der',
      template: 'Vorlage',
      columns: 'E-Mail-Adresse, Vorname, Nachname, Klasse, Schulstufe, Art (student oder teacher), optional die E-Mail-Adresse des Klassenvorstands. Trennzeichen Semikolon oder Komma. Die Personen werden beim ersten Anmelden über ihre Schul-E-Mail-Adresse erkannt.',
      file: 'Datei',
      paste: 'Oder Inhalt einfügen',
      import: 'Importieren',
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
    /** When the import was read, and by whom. */
    fetchedBy: (when: string, who: string) => `${when} von ${who}`,
    decided: 'Entschieden',
    problems: {
      title: 'Probleme',
      rejected: 'Die Liste wurde abgelehnt. Beheben Sie die Probleme in der Quelle und importieren Sie noch einmal.',
      line: (line: number) => `Zeile ${line}`,
    },
    warnings: 'Hinweise',
    changes: {
      title: 'Änderungen gegenüber der aktuellen Liste',
      summary: (counts: { added: number, removed: number, changed: number, unchanged: number }) => `${counts.added} neu, ${counts.removed} entfernt, ${counts.changed} geändert, ${counts.unchanged} unverändert.`,
      commit: 'Übernehmen',
      discard: 'Verwerfen',
      committed: 'Die Liste gilt jetzt.',
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
      lastSignIn: 'Letzte Anmeldung',
      person: 'Person',
      blocked: 'gesperrt',
      unbound: 'Nicht zugeordnet',
      notInRoster: 'Nicht in der aktuellen Liste',
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
      grant: (name: string) => `${name} eine Rolle erteilen`,
    },
    personSearch: 'Person der Schule',
    personSearchPlaceholder: 'Name, Klasse oder E-Mail',
    noPerson: 'Keine Person gefunden.',
    /** After a person found for binding whose current account the binding releases. */
    currentAccount: (account: string) => `derzeit Konto „${account}“, das dabei gelöst wird`,
    /** The form's submit button, by action. */
    submit: {
      bind: 'Zuordnen',
      block: 'Sperren',
      unblock: 'Entsperren',
      grant: 'Rolle erteilen',
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
  classTeachers: {
    saved: 'Klassenvorstände gespeichert.',
    /** A class teacher the roster names, in the table. */
    byRoster: (name: string) => `${name} (laut Personenliste)`,
    editorsOnly: 'Die Klassenvorstände ordnen die Administration und die Organisation einer Wahl zu.',
    intro: 'Wer eine Klasse führt, sieht ihren Stand in jeder Wahl und meldet nach der Zuteilung Schüler/innen ohne Platz nach. Nennt die Personenliste einen Klassenvorstand (Spalte class_teacher_email), gilt er hier auch.',
    noClasses: 'Es gilt noch keine Personenliste mit Klassen.',
    classTeacher: 'Klassenvorstand',
    assign: 'Zuordnen',
    assignTo: (className: string) => `Klassenvorstand der ${className} zuordnen`,
    of: (className: string) => `Klassenvorstand der ${className}`,
    removeTeacher: (name: string) => `${name} entfernen`,
    addTeacher: 'Lehrkraft hinzufügen',
    addPerson: (name: string) => `${name} hinzufügen`,
  },

  /** Zeiten.vue: the school's period grid. */
  periods: {
    adminsOnly: 'Das Stundenraster ändert die Administration der Schule.',
    intro: 'Die Unterrichtseinheiten der Schule, in denen Lehrkräfte ihre Termine angeben („ab der 2. Einheit, 2 Einheiten lang“). Termine mit anderen Zeiten, etwa Ausflüge, werden nach der Uhr eingegeben.',
    period: 'Einheit',
    starts: 'Beginn',
    ends: 'Ende',
    startsOf: (period: number) => `Beginn ${period}. Einheit`,
    endsOf: (period: number) => `Ende ${period}. Einheit`,
    add: 'Einheit anfügen',
    removeLast: 'Letzte entfernen',
    saved: 'Stundenraster gespeichert.',
  },

  /** Mailvorlagen.vue: the texts of the mails a campaign sends; the texts themselves are stored, not here. */
  mailTemplates: {
    editorsOnly: 'Die Mailvorlagen ändern die Administration und die Organisation einer Wahl.',
    intro: 'Die Texte der Nachrichten, die eine Wahl verschickt. Platzhalter in doppelten geschweiften Klammern füllt das Programm beim Versand; jede Vorlage nennt die ihren.',
    mailOff: 'Der Mailversand ist auf diesem Server nicht eingerichtet: Nachrichten bleiben in der Warteschlange, bis er es ist.',
    saved: 'Vorlage gespeichert.',
    testQueued: 'Testmail an Ihre Adresse in die Warteschlange gestellt.',
    /** Followed by a colon and the template's placeholders. */
    placeholders: 'Platzhalter',
    sendTest: 'Testmail an mich',
    /** The form of a template, by the mail's kind. */
    editing: (kind: string) => `${kind} bearbeiten`,
    subject: 'Betreff',
    body: 'Text',
  },

  /** Aufbewahrung.vue: the school years' records and the purge of one. */
  retention: {
    adminsOnly: 'Die Aufbewahrung ist der Administration der Schule vorbehalten; die Einsicht liest mit.',
    intro: 'Die Aufzeichnungen einer Projektwoche werden bis ein Jahr nach dem Ende ihres Schuljahrs aufbewahrt. Danach löscht die Administration sie hier, mit Begründung; von selbst wird nichts gelöscht. Vorher die Zuteilung und die Beitragsliste als Excel sichern, falls die Buchhaltung sie noch braucht: gelöscht ist gelöscht.',
    purged: 'Die Aufzeichnungen des Schuljahrs sind gelöscht.',
    years: 'Schuljahre',
    none: 'Noch keine Aufzeichnungen.',
    /** The columns of the years' table, besides the school year. */
    campaigns: 'Wahlen',
    batches: 'Personenlisten',
    classTeachers: 'Klassenvorstände',
    retainedUntil: 'Aufbewahrung bis',
    expired: 'abgelaufen',
    purge: {
      title: 'Schuljahr löschen',
      /** After a school year that cannot be purged yet, in the list to choose from. */
      stillRetained: 'Aufbewahrung läuft noch',
      notArchived: 'eine Wahl ist nicht abgeschlossen',
      confirm: 'Zur Bestätigung das Schuljahr noch einmal',
      submit: 'Aufzeichnungen löschen',
      removed: 'Gelöscht',
    },
  },

  /** The workbooks the API writes (apps/api/lib/xlsx.ts): sheets, the columns the pages do not name, cell values. */
  workbook: {
    sheet: {
      missing: 'Wahlstand',
      items: 'Aktivitäten',
      sessions: 'Termine',
      attendance: 'Anwesenheit',
      students: 'Schülerinnen und Schüler',
      participants: 'Teilnehmer',
      deficits: 'Fehlende Minuten',
      changes: 'Änderungen',
    },
    column: {
      window: 'Fenster',
      savedAt: 'Zuletzt gespeichert',
      mails: 'Nachrichten',
      title: 'Titel',
      description: 'Beschreibung',
      location: 'Ort',
      minParticipants: 'Mindestteilnehmer',
      cancellableBelowMinimum: 'Absagbar unter Minimum',
      fixedClasses: 'Fixe Klassen',
      grades: 'Schulstufen',
      classes: 'Klassen',
      fee: 'Beitrag (€)',
      feeNote: 'Beitrag: Anmerkung',
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
      assigned: 'Zugeteilt',
      fixed: 'Fix (Klassen)',
      minimum: 'Minimum',
      cancelled: 'Abgesagt',
      when: 'Wann',
      left: 'Nicht mehr',
      to: 'Neu',
      forced: 'Erzwungen',
      by: 'Durch',
    },
    yes: 'ja',
    no: 'nein',
    /** How a student came to an item, in brackets after it in the day's cell. */
    place: {
      wish: (rank: number | null) => `${rank}. Wunsch`,
      fallback: 'Ersatzplatz',
      fixed: 'Klasse',
    },
    /** The source of a participant's place (school-core ASSIGNMENT_SOURCES), as the participants' sheet names it. */
    source: {
      fixed: 'Klassenaktivität',
      wish: 'Wunsch',
      fallback: 'Ersatzplatz',
      swap: 'Tausch',
      manual: 'Händisch',
    },
  },

  /** The names of the files the server sends for download; a school year arrives as "2026-27". */
  files: {
    catalogue: (schoolYear: string) => `katalog-${schoolYear}.xlsx`,
    missing: (schoolYear: string) => `wahlstand-${schoolYear}.xlsx`,
    assignments: (schoolYear: string) => `zuteilung-${schoolYear}.xlsx`,
    run: (seq: number) => `zuteilung-lauf-${seq}.xlsx`,
    attendance: (schoolYear: string) => `anwesenheit-${schoolYear}.xlsx`,
    classAttendance: (className: string, schoolYear: string) => `anwesenheit-${className}-${schoolYear}.xlsx`,
    rosterTemplate: 'schulwahl-personen.csv',
  },

  /**
   * The values the server fills into a notice's placeholders: the lines of a
   * student's programme, who changed a place and what changed. The texts
   * around them are the mail templates, which the database keeps.
   */
  notices: {
    programme: {
      /** After an item the student has with their class, in brackets. */
      fixed: 'Klasse',
      /** The fee of an item, its amount already formatted. */
      fee: (amount: string) => `Beitrag ${amount} €`,
      /** The last line when minutes are still missing: the days with their minutes. */
      missing: (days: string) => `Noch ohne Platz: ${days} – dein Klassenvorstand teilt dich zu.`,
    },
    /** The swap window: "Mo., 28.06.2027, 08:00 bis Mi., 30.06.2027, 18:00". */
    swapWindow: (from: string, until: string) => `${from} bis ${until}`,
    /** Who changed a student's place, as the sentence "… von {{wer}} geändert" needs it. */
    changedBy: {
      classTeacher: 'deinem Klassenvorstand',
      organizer: 'der Organisation',
    },
    /** What a change by hand did. */
    change: {
      left: (items: string) => `nicht mehr ${items}`,
      entered: (item: string) => `neu ${item}`,
      replaced: (left: string, item: string) => `statt ${left} jetzt ${item}`,
    },
  },
}

/** The shape every language's catalogue has: the German one's keys, with any wording. */
export type Messages = typeof de
