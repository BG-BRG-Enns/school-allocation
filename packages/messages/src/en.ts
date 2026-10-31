// The words of the user interface in British English. The
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
// The words follow docs/glossary.md, and address everyone as “you”;
// de-formal.ts says Sie to staff. The mail templates' default texts are
// here too (`mail`); a text an organizer saves instead is stored in the
// database.

import type { Messages } from './de.ts'

const plural = new Intl.PluralRules('en')

/** `one` for a count the language treats as one, `other` for every other. */
function byCount(count: number, one: string, other: string): string {
  return plural.select(count) === 'one' ? one : other
}

/** The classes an activity takes whole: "whole class 5A", or "whole classes 5A, 5B". */
function wholeClasses(classes: string): string {
  return classes.includes(',') ? `whole classes ${classes}` : `whole class ${classes}`
}

export const en: Messages = {
  common: {
    appName: 'SchulWahl',
    /** The pages as the navigation, the links to them and their own headings name them. */
    page: {
      start: 'Home',
      signIn: 'Sign in',
      account: 'My account',
      campaigns: 'Registrations',
      admin: 'Administration',
      roster: 'Class lists',
      people: 'Accounts and roles',
      classTeachers: 'Class teachers',
      periods: 'Timetable',
      mailTemplates: 'Email templates',
      retention: 'Retention',
      wishes: 'My choices',
      result: 'My allocation',
      allocation: 'Allocation',
      newItem: 'New activity',
    },
    backToCampaign: 'Back to registration',
    backToAdmin: 'Back to administration',
    /** Field and column names several pages share. */
    field: {
      name: 'Name',
      className: 'Class',
      grade: 'Year',
      schoolYear: 'School year',
      email: 'Email',
      state: 'Status',
      role: 'Role',
      places: 'Places',
      item: 'Activity',
      number: 'No.',
      student: 'Student',
      students: 'Students',
      teachers: 'Teachers',
      sessions: 'Sessions',
      day: 'Day',
      fee: 'Cost',
      reason: 'Reason',
      /** The column of a table's row buttons, for screen readers. */
      actions: 'Actions',
    },
    save: 'Save',
    cancel: 'Cancel',
    remove: 'Remove',
    edit: 'Edit',
    view: 'View',
    pleaseChoose: 'Please choose',
    addDay: 'Add day',
    saved: 'Saved.',
    /** "Year 9" */
    gradeOrdinal: (grade: number) => `Year ${grade}`,
    /** "240 min" */
    minutes: (minutes: number) => `${minutes} min`,
  },

  /** Values as the pages, the workbooks and the notices write them. */
  format: {
    /** One period of the school's grid: "P2". */
    period: (period: number) => `P${period}`,
    /** A span of periods: "P2–3", one period as "P2". */
    periods: (from: number, to: number) => from === to ? `P${from}` : `P${from}–${to}`,
    /** An amount already formatted as a number, with the currency: "€15.00". */
    euros: (amount: string) => `€${amount}`,
  },

  /** The shell around every page (App.vue). */
  shell: {
    navigation: 'Account',
    signOut: 'Sign out',
    serverDown: 'The server is not responding at the moment.',
    retry: 'Try again',
  },

  /** The words for the API's codes, one map per list of codes; a test checks that every code has its word. */
  labels: {
    /** The privileged roles (apps/api/lib/roles.ts), as the account page names them. */
    role: {
      school_admin: 'Administration',
      campaign_organizer: 'Organisation',
      read_only_auditor: 'Read-only',
    },
    /** Student or teacher (school-core PERSON_KINDS). */
    kind: {
      student: 'Student',
      teacher: 'Teacher',
    },
    /** Where a batch came from (apps/api/lib/models/roster.ts BATCH_SOURCES). */
    batchSource: {
      'graph:groups': 'Entra groups',
      'csv': 'CSV file',
    },
    /** What became of a batch (BATCH_STATES). */
    batchState: {
      pending: 'For review',
      committed: 'Applied',
      discarded: 'Discarded',
      rejected: 'Rejected',
    },
    /** Why a batch or a row was refused (school-core ROSTER_PROBLEM_CODES). */
    rosterProblem: {
      empty_roster: 'The list contains no one',
      no_key: 'Neither object ID nor email address',
      duplicate_key: 'The same person appears twice',
      duplicate_address: 'The same email address for two people',
      both_kinds: 'The same person as both student and teacher',
      student_without_class: 'Student without a class or year',
      teacher_with_class: 'Teacher with a class or year',
      invalid_class_name: 'Invalid class name',
      invalid_grade: 'Invalid year (1 to 13)',
      invalid_address: 'Invalid email address',
      invalid_name: 'Invalid name',
      invalid_kind: 'Invalid kind (student or teacher)',
    },
    /** What an accepted batch should be looked at for (apps/api/lib/models/roster.ts RosterWarning). */
    rosterWarning: {
      no_address: 'No email address: emails will not reach this person',
    },
    /** The fields a diff names (school-core ChangedField). */
    field: {
      kind: 'Kind',
      displayName: 'Name',
      className: 'Class',
      grade: 'Year',
      mail: 'Email',
      classTeacherMail: 'Class teacher',
    },
    /** A campaign's lifecycle state (school-core CAMPAIGN_STATES). */
    campaignState: {
      draft: 'In preparation',
      catalogue: 'Collecting activities',
      published: 'Catalogue published',
      open: 'Registration open',
      grace: 'Late registration',
      closed: 'Registration closed',
      allocating: 'Allocating',
      review: 'Allocation in review',
      results: 'Allocation published',
      archived: 'Closed',
    },
    /** An activity's state (school-core ITEM_STATES). */
    itemState: {
      draft: 'Draft',
      proposed: 'Submitted',
      approved: 'Approved',
      withdrawn: 'Withdrawn',
    },
    /** Why an activity was refused (school-core CATALOGUE_PROBLEM_CODES). */
    catalogueProblem: {
      no_sessions: 'At least one session is needed',
      session_ends_before_start: 'A session ends before it starts',
      session_outside_project_days: 'A session is outside the project days',
      sessions_overlap: 'Two sessions of the activity overlap',
      credit_date_outside_session: 'Minutes credited to a day on which the session does not take place',
      credit_date_twice: 'A day is credited twice for a session',
      credit_minutes_invalid: 'Credited minutes must be a whole number between 0 and 1440',
      no_credit: 'A session credits no minutes',
      min_above_places: 'The minimum is greater than the number of places',
      fixed_item_cancellable: 'A class activity always takes place and cannot be cancelled',
      fixed_class_unknown: 'One of the whole classes is not in the class lists',
      eligible_class_unknown: 'A class the activity is offered to is not in the class lists',
      fixed_class_also_eligible: 'A whole class is taking part and is also listed under “Offered to classes”',
      no_teacher: 'At least one teacher is needed',
      teacher_twice: 'A teacher is entered twice',
    },
    /** Why a ranking was refused (school-core RANKING_PROBLEM_CODES). */
    rankingProblem: {
      unknown_group: 'A time block is not offered',
      unknown_item: 'An activity is not offered in this time block',
      item_twice: 'An activity is ranked twice',
      too_many_wishes: 'More choices than allowed',
    },
    /** The state of a student's list (packages/api-contracts/src/choices.ts ChoiceState). */
    choiceState: {
      none: 'no choices',
      incomplete: 'incomplete',
      complete: 'complete',
    },
    /** The window a list was saved in. */
    window: {
      first: 'Registration period',
      late: 'Late registration',
    },
    /** The kinds of mail the window sends (packages/api-contracts/src/mail.ts MAIL_KINDS). */
    mailKind: {
      choice_invitation: 'Registration invitation',
      choice_reminder: 'Reminder before registration closes',
      grace_invitation: 'Late registration invitation',
      grace_reminder: 'Reminder before late registration closes',
      missed_deadline: 'Deadline missed',
      class_missing: 'Missing choices, to the class teacher',
      result_published: 'Allocation published',
      class_unplaced: 'Not fully placed, to the class teacher',
      item_cancelled: 'Activity cancelled, to the teachers',
      swap_confirmed: 'Swap confirmed',
      assignment_changed: 'Allocation changed (by the class teacher or the organisation)',
    },
    /** What became of an allocation run (packages/api-contracts/src/allocation.ts RUN_STATUSES). */
    runStatus: {
      running: 'running',
      succeeded: 'finished',
      failed: 'failed',
      interrupted: 'interrupted',
    },
    /** Why a run failed (RUN_FAILURE_CODES). */
    runFailure: {
      solver_unreachable: 'The calculation service could not be reached',
      solver_answer_invalid: 'The calculation service returned an unusable answer',
      solver_infeasible: 'No allocation possible, usually because of the minimum for an activity that cannot be cancelled',
      solver_unknown: 'No allocation found within the computing time',
      model_invalid: 'Error in the data for the calculation',
      validation_failed: 'Validation found an error in the calculated allocation; it was discarded',
      internal_error: 'A program error; details are in the server log',
    },
    /** The solver's answer per pass (school-core SOLVE_STATUSES). */
    solveStatus: {
      OPTIMAL: 'optimal',
      FEASIBLE: 'valid, maybe not the best',
      INFEASIBLE: 'no allocation possible',
      UNKNOWN: 'none found in time',
      MODEL_INVALID: 'data error',
    },
    /** The levels of the lexicographic objective (school-core levelNames); a threshold level is named by its number. */
    level: {
      students_with_deficit: 'Students with missing minutes',
      deficit_minutes: 'Total missing minutes',
      total_cost: 'Total choices (weighted, fewer is better)',
      tiebreak: 'Draw',
      over: (threshold: number) => `Students with an average choice above ${threshold}`,
    },
    /** Why the validator refused a result (school-core ALLOCATION_PROBLEM_CODES). */
    allocationProblem: {
      pass_not_solved: 'A round was not calculated',
      status_inconsistent: 'The reported status does not match the goals',
      levels_unexpected: 'The goals in the answer do not match the request',
      cancelled_twice: 'An activity is cancelled twice',
      level_mismatch: 'A goal value does not match the recalculated value',
      not_in_pass: 'Someone placed is not included in this round',
      unknown_item: 'An activity not included in the request',
      assigned_twice: 'An allocation appears twice',
      not_an_option: 'An activity that was neither a choice nor a remaining place',
      paid_fallback: 'An activity with a cost used as a remaining place',
      cancelled_not_cancellable: 'An activity that cannot be cancelled is cancelled',
      assigned_to_cancelled: 'Placement in a cancelled activity',
      capacity_exceeded: 'More students placed than places',
      below_minimum: 'Fewer students placed than the minimum',
      overlap: 'Two activities overlap',
      overlaps_fixed: 'An activity overlaps with a class activity',
      first_pass_changed: 'The second round changed the first',
      pre_assignment_missing: 'A class activity is missing from the allocation',
      pre_assignment_changed: 'A class activity was changed',
      assignment_mismatch: 'The saved rows do not match the result',
    },
    /** The source of a student's place (school-core ASSIGNMENT_SOURCES). */
    assignmentSource: {
      fixed: 'Class activity',
      wish: 'Choice',
      fallback: 'Remaining place',
      swap: 'Swap',
      manual: 'by hand',
    },
    /** A change of the published run (packages/api-contracts/src/publication.ts CHANGE_KINDS). */
    changeKind: {
      swap: 'Swap',
      place: 'Placed by the class teacher',
      move: 'Moved',
      remove: 'Removed',
    },
    /** Why a move after publication is refused (school-core MOVE_PROBLEM_CODES), as the pages say it next to the item. */
    moveProblem: {
      not_offered: 'not offered',
      already_placed: 'already placed',
      item_full: 'full',
      not_placed: 'not placed',
      leaves_fixed: 'class activity stays',
      below_minimum: 'the previous activity would fall below its minimum',
      overlap: 'overlaps',
      coverage_lost: 'minutes would be missing',
      fills_nothing: 'fills no gap',
    },
    /** What was recorded for a student in a session (packages/api-contracts/src/attendance.ts ATTENDANCE_STATUSES). */
    attendanceStatus: {
      present: 'present',
      absent: 'absent',
      excused: 'excused',
    },
    /** The state of a mail in the outbox (apps/api/lib/mail/outbox.ts MAIL_STATES). */
    mailState: {
      queued: 'queued',
      sending: 'sending',
      sent: 'sent',
      failed: 'failed',
    },
    /** Why a template was refused (apps/api/lib/models/mail-templates.ts TemplateProblem). */
    templateProblem: {
      subject_syntax: 'Subject: error in a placeholder',
      body_syntax: 'Body: error in a placeholder',
      unknown_placeholder: 'This placeholder is not available here',
      subject_empty: 'The subject must not become empty',
    },
    /** Why a period grid was refused (school-core PERIOD_PROBLEM_CODES). */
    periodProblem: {
      no_periods: 'At least one period is needed',
      period_numbering: 'Periods must be numbered from 1 without gaps',
      period_time_invalid: 'A clock time is not in HH:MM format',
      period_ends_before_start: 'A period does not end after it starts',
      periods_overlap: 'A period starts before the previous one ends',
    },
    /** What went wrong with a roster refresh from Entra groups, as the callback reports it in the page's query. */
    refreshError: {
      state_mismatch: 'The return from Microsoft did not match this browser. Please start again.',
      no_pending_refresh: 'No refresh was started, or it expired. Please start again.',
      graph_authorization_failed: 'Permission for Microsoft Graph was not granted or does not match your account.',
      graph_unauthorized: 'Microsoft Graph did not accept access. Please start again.',
      graph_forbidden: 'Microsoft Graph refuses to read the groups. Are the permissions (GroupMember.Read.All, User.ReadBasic.All) or IT consent missing?',
      graph_not_found: 'One of the groups no longer exists in Entra. Please check the group IDs.',
      graph_failed: 'Microsoft Graph did not respond. Please try again later.',
      import_failed: 'The import failed.',
    },
    /** The languages a school may speak (packages/messages LOCALES), as the administration chooses one. */
    locale: {
      'de': 'German (informal)',
      'de-formal': 'German (formal for teachers and administration)',
      'en': 'English',
    },
  },

  /** What a person is told when the API refuses, by its code; the validation message names a field, never a value. */
  errors: {
    unauthenticated: 'Please sign in.',
    forbidden: 'You do not have permission for this.',
    not_found: 'This does not exist, or you do not have access to it.',
    cross_site_request: 'That did not work. Please reload the page.',
    blocked: 'Your access is blocked. Please contact the school.',
    invalid_transition: 'This is no longer possible (or not yet).',
    rate_limited: 'Too many attempts. Please wait a moment.',
    FST_ERR_VALIDATION: 'Something is missing or too long.',
    FST_ERR_CTP_BODY_TOO_LARGE: 'The file is too large.',
    request_failed: 'That did not work. Please try again.',
    // The roster
    csv_invalid: 'The file is not a class list in the expected format. Please use the template.',
    invalid_school_year: 'Write the school year as 2026/27.',
    batch_not_pending: 'This import has already been decided on.',
    batch_superseded: 'Another import has been applied since this one. Please import the class lists again.',
    duplicate_group: 'A group is entered twice.',
    group_label_incomplete: 'A class group needs a class and year; the teachers’ group has neither.',
    no_groups: 'No Entra groups have been entered yet.',
    // Accounts and roles
    already_bound: 'This account is already linked to this person.',
    cannot_block_self: 'You cannot block yourself.',
    already_blocked: 'This account is already blocked.',
    not_blocked: 'This account is not blocked.',
    already_granted: 'This person already has this role.',
    already_revoked: 'This role has already been revoked.',
    cannot_revoke_self: 'You cannot revoke your own administration role. Only another administrator can do that.',
    last_admin: 'That would leave the school without administration. Give someone else the administration role first.',
    // Campaigns and the catalogue
    campaign_state: 'This is not possible in the current registration state.',
    item_state: 'This is not possible in the current activity state.',
    invalid_item_transition: 'This step is not available for the activity.',
    transition_not_available: 'This step is not available in this version yet.',
    project_day_twice: 'A project day is entered twice.',
    invalid_date: 'A date does not exist in the calendar.',
    sessions_outside_days: 'There are already sessions on the removed days. Please change the affected activities first.',
    item_invalid: 'The activity is not ready yet. Please check the notes.',
    window_order: 'Registration must end after it starts.',
    grace_order: 'Late registration cannot end before registration ends.',
    swap_order: 'The swap period must end after it starts.',
    // Settings and classes
    period_grid_invalid: 'The timetable is not ready yet. Please check the notes.',
    no_roster: 'There are no class lists yet.',
    class_unknown: 'This class is not in the class lists.',
    teacher_unknown: 'A teacher is not in the class lists.',
    graph_not_authorized: 'You need to sign in to Microsoft to search for groups.',
    graph_forbidden: 'Microsoft Graph refuses to read the groups. Is permission or IT consent missing?',
    graph_failed: 'Microsoft Graph did not respond. Please try again later.',
    // The window and mail
    not_a_student: 'Only students in the class lists can submit choices.',
    ranking_invalid: 'The choices are not ready yet. Please check the notes.',
    already_exempted: 'This exemption already exists.',
    mail_off: 'Sending email is not configured on this server.',
    no_address: 'Your account has no email address to receive a test email.',
    template_invalid: 'The template is not ready yet. Please check the notes.',
    // The allocation
    solver_off: 'Allocation calculation is not configured on this server. The administration can change this (operator guide).',
    run_in_progress: 'A calculation is running. Please wait until it finishes.',
    daily_minimum_missing: 'The daily minimum minutes are missing for these years. You can still enter them in the registration settings:',
    fixed_items_overlap: 'Two class activities take the same class at the same time. Please correct the catalogue.',
    no_students: 'The class lists for this registration contain no students.',
    run_not_publishable: 'Only a successful calculation can be published.',
    run_stale: 'The registration has changed since this calculation. Please recalculate before publishing.',
    cancelled_mismatch: 'The confirmed cancellations do not match the calculation. Please reload the page and check again.',
    not_published: 'The allocation has not been published yet.',
    swap_closed: 'There is no swap period at the moment.',
    not_offered: 'This activity is not offered: it is cancelled, withdrawn, not for this year or class, or overlaps with a class activity.',
    already_placed: 'This activity is already entered.',
    item_full: 'This activity is full. Someone got there first.',
    not_placed: 'This activity is not entered.',
    leaves_fixed: 'You cannot leave a class activity.',
    below_minimum: 'The previous activity would fall below its minimum.',
    overlap: 'The activity overlaps with one that stays.',
    coverage_lost: 'This would leave missing minutes on a day that currently has none.',
    fills_nothing: 'This activity fills no gap: the programme for its day is already full.',
    fully_placed: 'The programme is already full for every day; there is no gap to fill.',
    no_change: 'Please specify an activity the person is moving to or leaving.',
    not_assigned: 'This person is not placed in this activity; attendance can only be recorded for those placed.',
    retention_not_reached: 'The retention period for this school year is still running: until one year after its end.',
  },

  /** SignIn.vue: one button, to the school's Microsoft sign-in. */
  signIn: {
    intro: 'Sign in with your school account (Microsoft).',
    signIn: 'Sign in',
  },

  /** Start.vue: who is signed in, and their campaigns. */
  start: {
    /** Followed by the name, in bold, and a full stop. */
    signedInAs: 'Signed in as',
    noCampaigns: 'There is no registration you take part in or manage yet.',
  },

  /** Account.vue: who the app takes the signed-in person for. */
  account: {
    atSchool: 'At the school',
    notInRoster: 'No longer included in the school’s current class lists.',
    /** "Student, class 5A (Year 9)" */
    student: (kind: string, className: string, grade: number | null) => `${kind}, class ${className}${grade === null ? '' : ` (Year ${grade})`}`,
    unbound: 'Your account is not linked to anyone in the class lists yet. If you are meant to take part in a registration, please contact the administration.',
    roles: 'Roles',
    noRoles: 'No special roles.',
    /** Followed by the link to the licences of the packages these pages bundle. */
    licences: 'SchulWahl is free software under the MIT licence. The licences of the libraries these pages contain:',
  },

  /** Wahlen.vue: the campaigns the person may see, and the organizer's form for a new one. */
  campaigns: {
    none: 'No registration yet.',
    /** The table's column of campaign names. */
    campaign: 'Registration',
    new: 'New registration',
    namePlaceholder: 'Project week 2027',
    create: 'Create registration',
  },

  /** Wahl.vue: one campaign, its state and days, its activities, and what the person may do. */
  campaign: {
    title: 'Registration',
    /** "School year 2026/27 · Project days: Mon, 21/06/2027, Tue, 22/06/2027" */
    yearAndDays: (schoolYear: string, days: string) => `School year ${schoolYear} · Project days: ${days}`,
    /** The window in one line; the parts are joined with commas, the wishes follow after a dot. */
    window: {
      opens: (from: string, until: string) => `Registration from ${from} to ${until}`,
      late: (until: string) => `Late registration until ${until}`,
      swap: (from: string, until: string) => `Swap period from ${from} to ${until}`,
      wishes: (wishes: number) => `${wishes} ${byCount(wishes, 'choice', 'choices')} per time block`,
    },
    myClass: (className: string) => `My class ${className}`,
    projectDays: 'Project days',
    organization: {
      heading: 'Organisation',
      itemCounts: (counts: { draft: number, proposed: number, approved: number, withdrawn: number }) => `${counts.draft} ${byCount(counts.draft, 'draft', 'drafts')} · ${counts.proposed} submitted · ${counts.approved} approved · ${counts.withdrawn} withdrawn`,
      collect: 'Collect activities',
      publish: 'Publish catalogue',
      open: 'Open registration',
      archive: 'Close registration',
      archiveConfirm: 'Close the registration? Nothing can be changed afterwards: no swaps, placements or attendance.',
      close: 'End registration',
      editSettings: 'Change settings',
      editMinimumAndSwap: 'Change minimum minutes and swap period',
      editSwap: 'Change swap period',
      catalogueExport: 'Catalogue as Excel',
    },
    /** The organizer's settings form; Wahlen.vue's form for a new campaign uses its name and day fields too. */
    settings: {
      label: 'Registration settings',
      name: 'Name',
      projectDay: (day: number) => `Project day ${day}`,
      window: 'Registration period',
      opens: 'Start',
      closes: 'End',
      lateUntil: 'Late registration until',
      swapFrom: 'Swap period from',
      swapUntil: 'Swap period until',
      wishesPerGroup: 'Choices per time block',
      dailyMinimum: (grade: number) => `Minimum minutes per day, Year ${grade}`,
      showTeachers: 'The catalogue names the teachers of the activities',
    },
    student: {
      viewResult: 'View my allocation',
      giveWishes: 'Submit or change choices',
      offered: 'What is offered',
    },
    missing: {
      heading: 'Registration status',
      summary: (students: number, incomplete: number) => `${students} ${byCount(students, 'student', 'students')}, ${incomplete} still without complete choices.`,
      export: 'Registration status as Excel',
      mails: 'Emails',
      enter: 'Enter',
    },
    demand: {
      heading: 'Places and demand',
      intro: 'For each project day and year: how many students need a place (excluding those in a class activity) and how many places the submitted and approved activities offer them.',
      cell: (needing: number, offered: number) => `${needing} needed · ${offered} offered`,
    },
    items: {
      heading: 'Activities',
      viewCatalogue: 'View catalogue',
      none: 'No activities yet.',
      fixedFor: (classes: string) => wholeClasses(classes),
      reviewNote: (note: string) => `Feedback: ${note}`,
      participants: 'Participants',
      propose: 'Submit',
      proposed: 'Submitted.',
      unpropose: 'Back to draft',
      delete: 'Delete',
      deleted: 'Draft deleted.',
      approve: 'Approve',
      approved: 'Approved.',
      return: 'Return',
      withdraw: 'Withdraw',
    },
    /** Returning or withdrawing an item, with the note or reason it needs. */
    pending: {
      returnTitle: (title: string) => `Return ${title}`,
      withdrawTitle: (title: string) => `Withdraw ${title}`,
      returnNote: 'Feedback to the teachers',
    },
  },

  /** Katalog.vue: the catalogue as students read it and the school prints it. */
  catalogue: {
    title: 'Catalogue',
    titleOf: (campaign: string) => `Catalogue ${campaign}`,
    projectDays: (days: string) => `Project days: ${days}`,
    print: 'Print',
    empty: 'The catalogue is still empty.',
    /** A session's credited minutes, "credited 240 min + 60 min". */
    credited: (minutes: string) => `credited ${minutes}`,
    places: (places: number) => `${places} ${byCount(places, 'place', 'places')}`,
    fixedAndPlaces: (classes: string, places: number) => `${wholeClasses(classes)}, plus ${places} ${byCount(places, 'open place', 'open places')}`,
    fixed: (classes: string) => wholeClasses(classes),
    /** Who may choose the item: "for Years 9, 10 · 5A". */
    forWhom: (who: string) => `for ${who}`,
    grades: (grades: readonly number[]) => `${byCount(grades.length, 'Year', 'Years')} ${grades.join(', ')}`,
    allGrades: 'all years',
    fee: (amount: string) => `Cost: ${amount}`,
  },

  /** Aktivitaet.vue: proposing or editing an activity. */
  item: {
    editTitle: 'Edit activity',
    /** A refusal that names a session, counted from 1: "… (session 2)". */
    inSession: (problem: string, session: number) => `${problem} (session ${session})`,
    unknownTeachers: 'A teacher is not in the class lists',
    reviewNote: (note: string) => `Feedback from the organisation: ${note}`,
    title: 'Title',
    description: 'Description',
    location: 'Location or meeting point',
    teachers: {
      /** The chip's label for a screen reader. */
      remove: (name: string) => `Remove ${name}`,
      search: 'Add teacher',
      add: (name: string) => `Add ${name}`,
    },
    sessions: {
      intro: 'A session is given in school periods or, for a trip for example, by clock time. The minutes you enter for each project day are credited; travel and breaks do not count.',
      session: (number: number) => `Session ${number}`,
      /** Whether the session is placed in the period grid or by the clock. */
      mode: 'Given in',
      byPeriods: 'Periods',
      byClock: 'Clock time',
      fromPeriod: 'from period',
      count: 'Number of periods',
      location: 'Location',
      startsOn: 'Starts on',
      /** The clock time after "Starts on" and "Ends on". */
      at: 'at',
      endsOn: 'Ends on',
      minutesOn: (day: string) => `Minutes on ${day}`,
      remove: 'Remove session',
      add: 'Add session',
    },
    participation: {
      heading: 'Participation',
      fixedClasses: 'Whole classes taking part (they make no choices for this time)',
      /** The places of an activity for fixed classes: those other students may rank. */
      extraPlaces: 'Extra places for other students',
      minParticipants: 'Minimum',
      cancellable: 'Cancelled if too few',
      eligibleGrades: 'Offered to years (none selected: all)',
      eligibleClasses: 'Offered to classes (none selected: all)',
    },
    fee: {
      amount: 'Cost in euros (blank: none)',
      note: 'What for',
    },
    saveAndPropose: 'Save and submit',
    participants: {
      heading: (count: number) => `${byCount(count, 'Participant', 'Participants')} (${count})`,
      cancelled: 'This activity is cancelled: too few students chose it to meet its minimum.',
      none: 'No one is placed in this activity.',
    },
  },

  /** Wuensche.vue: a student's wishes, or an organizer's entry on a student's behalf. */
  wishes: {
    titleOnBehalf: 'Enter for someone',
    onBehalf: (name: string, className: string) => `For ${name} (${className}). What you enter is recorded with a reason.`,
    /** After the campaign's name: "up to 3 choices per time block". */
    cap: (cap: number) => `up to ${cap} ${byCount(cap, 'choice', 'choices')} per time block`,
    closesAt: (when: string) => `Registration until ${when}`,
    lateUntil: (when: string) => `Late registration until ${when}`,
    notAccepting: 'The registration is not accepting choices at the moment.',
    lateNotice: 'Late registration choices are considered after the others.',
    /** After the state's badge: the window (a WINDOW_LABELS word) and the version of the saved list. */
    savedIn: (window: string, version: number) => `saved (${window}), version ${version}`,
    nothingOffered: 'Nothing is offered to you.',
    /** After the title of a class activity, in bold. */
    fixedForYourClass: 'with your whole class',
    /** A time group's legend, after its time: "1 of 3 choices". */
    groupCount: (wishes: number, required: number) => `${wishes} of ${required} ${byCount(required, 'choice', 'choices')}`,
    wish: 'Choice',
    /** The select of an item's wish number. */
    wishFor: (title: string) => `Choice ${title}`,
    saveWishes: 'Save choices',
    allGroupsComplete: 'Choices are complete for all time blocks.',
    wishesMissing: 'Some choices are still missing.',
    /** Follows the two above for a student, whose changes need no button. */
    savedAtOnce: 'Every change is saved at once.',
    exemptions: {
      title: 'Exemptions',
      exempt: 'Exempt',
      from: (title: string) => `Exempt from ${title}`,
      thenChooses: (name: string) => `${name} then makes their own choices for this time.`,
      done: 'Exempted.',
    },
  },

  /** Klasse.vue: a class as its class teacher sees it in a campaign. */
  schoolClass: {
    title: (className: string) => `Class ${className}`,
    schoolYear: (schoolYear: string) => `School year ${schoolYear}`,
    /** A student's places when there are none. */
    noPlace: 'no place',
    /** What an activity offered for a gap still has. */
    freePlaces: (free: number) => `${free} ${byCount(free, 'open place', 'open places')}`,
    placed: 'Placed. The person will be notified.',
    attendanceSaved: 'Attendance saved.',
    classActivities: 'Class activities',
    noClassActivity: 'No activity takes the whole class.',
    unplaced: {
      heading: (count: number) => `Not placed for every day (${count})`,
      none: 'All students in the class have a programme for every day.',
      /** After the student's name, in bold, and a colon. */
      minutesMissing: (minutes: number) => `${minutes} ${byCount(minutes, 'minute', 'minutes')} missing`,
      /** The places a student short of minutes already has, after a "·". */
      sofar: (items: string) => `so far ${items}`,
      /** The placement form's label for a screen reader. */
      form: (name: string) => `Place ${name}`,
      noOffer: 'No activity with open places fits the gap. The organisation can change the allocation.',
      itemFor: (name: string) => `Activity for ${name}`,
      reasonFor: (name: string) => `Reason for ${name}`,
      place: 'Place',
      note: 'As class teacher, you place students who are still short of time here. Those placed will be notified; the organisation sees every change with your reason.',
    },
    attendance: {
      heading: 'Attendance',
      intro: 'For each project day and session, for the students in the class; separate from the allocation.',
      recordable: 'Enter and save; you can make corrections until the registration is closed.',
      readOnly: 'Read-only.',
      noSession: 'No one in the class has a session on this day.',
      /** The day's form, for a screen reader. */
      ofDay: (day: string) => `Attendance ${day}`,
      status: 'Attendance',
      note: 'Note',
      statusOf: (name: string, title: string) => `Attendance ${name}, ${title}`,
      noteOf: (name: string, title: string) => `Note ${name}, ${title}`,
      save: 'Save attendance',
      export: 'Attendance as Excel',
    },
    students: (count: number) => `${byCount(count, 'Student', 'Students')} (${count})`,
    choicesLater: 'This page shows who has already registered once registration is open.',
  },

  /** Zuteilung.vue: the organizer's runs, their review and the changes after publication. */
  allocation: {
    published: 'The allocation is published; the emails are on their way.',
    changed: 'The allocation has changed. The person will be notified.',
    started: 'The allocation is being calculated.',
    /** A student's place on a day in the review, in brackets after the item. */
    place: {
      wish: (rank: number | null) => `choice ${rank}`,
      fallback: 'Remaining place',
      fixed: 'Class',
    },
    /** The published run: its exports, the changes since and the change by hand. */
    publication: {
      heading: 'Published',
      text: (seq: number, when: string) => `Calculation ${seq} is the allocation for this registration (published ${when}). Students see their programme, teachers their participants, class teachers their class’s places.`,
      assignmentsExport: 'Allocation as Excel',
      attendanceExport: 'Attendance as Excel',
      changes: (count: number) => `Changes since publication (${count})`,
      noChanges: 'None yet: no swap, placement by a class teacher or change by hand.',
      when: 'When',
      kind: 'Kind',
      left: 'No longer',
      to: 'New',
      by: 'By',
      /** After the kind of a change that overrode a full item or a minimum. */
      forced: 'anyway',
    },
    /** The organizer's change by hand after publication. */
    change: {
      title: 'Change allocation by hand',
      rules: 'The same rules apply as for a swap: into an activity with open places that suits the year and does not overlap with anything that stays; a class activity always stays. You may override a full activity or the minimum; ticking that box is recorded.',
      from: 'Remove from',
      to: 'Place in',
      /** The free places of an item, in brackets after it. */
      free: (count: number) => `${count} open`,
      force: 'Even if the activity is full or too few would remain (recorded)',
      submit: 'Change',
    },
    start: {
      heading: 'New calculation',
      /** Around the setting's name: "… configured (SOLVER_URL); the administration …". */
      noSolver: {
        before: 'Allocation calculation is not configured on this server',
        after: 'the administration can change this.',
      },
      unreachable: 'The calculation service is not responding. A calculation would fail.',
      ready: (ortools: string, contract: string) => `Ready to calculate (OR-Tools ${ortools}, interface ${contract}).`,
      notClosed: 'The allocation can be calculated once registration has ended.',
      seed: 'Draw number (blank: drawn for you)',
      seedExample: 'e.g. 4711',
      limit: 'Computing time per goal (1–60)',
      limitHint: 'More computing time is more likely to find the best allocation, but takes longer (one second here is several on the server). The same draw number with the same computing time gives the same allocation.',
      submit: 'Calculate allocation',
      running: 'The allocation is being calculated …',
    },
    runs: {
      heading: (count: number) => `${byCount(count, 'Calculation', 'Calculations')} (${count})`,
      none: 'No calculation yet.',
      run: 'Calculation',
      started: 'Started',
      status: 'Status',
      seed: 'Draw number',
      limit: 'Computing time',
      deficit: 'Missing minutes',
      notCovered: 'Not every day',
      published: 'published',
      repeatHint: (seed: number, limit: number) => `Calculate again with draw number ${seed} and computing time ${limit}: the same allocation as long as nothing has changed`,
      repeat: 'Repeat',
    },
    /** The review of one run. */
    review: {
      heading: (seq: number) => `Calculation ${seq}`,
      stale: 'The catalogue, class lists or a class activity have changed since this calculation. Please recalculate before publishing.',
      computing: 'Calculating …',
      /** A level the validator recomputed differently, after the level's name. */
      levelMismatch: (reported: number | string, recomputed: number | string) => `reported ${reported}, recalculated ${recomputed}`,
      /** In bold, followed by a colon and `warning`. */
      warningLead: 'Note before calculation',
      warning: 'Fewer students are eligible for these activities than their minimum requires, and they cannot be cancelled. If no allocation can be calculated, this is usually why: allow cancellation, lower the minimum or withdraw the activity.',
      possible: (possible: number, minimum: number) => `${possible} possible, ${minimum} needed`,
      meta: (seed: number, limit: number, solver: string, ortools: string, rules: number) => `Draw number ${seed} · Computing time ${limit} · Calculation service ${solver} (OR-Tools ${ortools}) · Rules version ${rules}`,
      runExport: 'Calculation as Excel',
      levels: 'Goals (in this order)',
      level: 'Goal',
      firstPass: 'Value (round 1)',
      secondPass: 'Value (round 2)',
      comparison: 'Comparison',
      proven: '✓ optimal',
      notProven: '≈ perhaps not optimal',
      /** A level's difference to the compared run when there is none. */
      equal: 'equal',
      passes: (passes: string, seed: number) => `Rounds: ${passes}. First, no one should be left without a full week, then as few minutes as possible should be missing, then as few students as possible should get lower choices on average, then the overall result should be as good as possible. Ties are decided by a draw with draw number ${seed}.`,
      wishes: 'Choices',
      rank: (rank: string) => `choice ${rank}`,
      fallback: 'Remaining place',
      fixed: 'Class activity',
      cancelled: 'Cancelled',
      deficits: (count: number) => `Missing minutes (${count})`,
      noDeficits: 'No one has missing minutes.',
      missing: 'Missing',
      fallbacks: (count: number) => `${byCount(count, 'Remaining place', 'Remaining places')} (${count})`,
      items: 'Activities',
      assigned: 'Placed',
      fixedClasses: 'Whole classes',
      minimum: 'Minimum',
      itemCancelled: 'cancelled',
      itemEmpty: 'empty',
      classes: 'Classes',
      classWithDeficit: 'With missing minutes',
      classWithFallback: 'With a remaining place',
      compare: 'Comparison',
      compareWith: 'With calculation',
      compareOption: (seq: number, seed: number) => `Calculation ${seq} (draw number ${seed})`,
      /** After the number of students in bold. */
      differences: (seq: number, otherSeq: number) => `students have a different allocation in calculation ${seq} from calculation ${otherSeq}`,
      /** After a colon, when no student differs. */
      noDifferences: 'the same allocation',
      /** Before the other run's items of a student. */
      instead: 'instead of',
      studentList: (count: number) => `${byCount(count, 'Student', 'Students')} (${count})`,
      window: 'Period',
      averageRank: 'Average choice',
      noWishes: 'no choices',
      minutesMissing: (minutes: number) => `${minutes} min missing`,
      sources: (sources: string) => `Source: ${sources}.`,
    },
    /** The publication of a reviewed run. */
    publish: {
      heading: 'Publish',
      text: 'This calculation becomes the allocation: students receive their programme, class teachers receive the list of those not fully placed, and teachers of cancelled activities are notified. There are no more recalculations afterwards.',
      start: (seq: number) => `Publish calculation ${seq} …`,
      confirm: 'Confirm publication',
      noCancellations: 'No activity is cancelled.',
      cancellations: 'These activities are cancelled because too few students chose them:',
      confirmCancellations: 'I confirm that they are cancelled.',
      submit: 'Publish now',
    },
    /** A reviewed run's counts, each after its number in bold. */
    counts: {
      students: (choosing: number) => `students, ${choosing} with choices`,
      covered: 'placed for every day',
      withDeficit: 'with missing minutes',
      withFallback: 'with a remaining place',
      cancelled: 'cancelled',
      late: 'from late registration',
      nonSubmitters: 'without choices',
    },
  },

  /** Ergebnis.vue: a student's result, the swap window and the explanation. */
  result: {
    /** How a student came to an item. */
    source: {
      fixed: 'with your class',
      wish: (rank: number | null) => `your choice ${rank}`,
      fallback: 'remaining place, because your choices could not be met here',
      swap: 'your swap',
      other: 'placed',
    },
    freePlaces: (count: number) => `${count} ${byCount(count, 'open place', 'open places')}`,
    swapInto: (item: string) => `Move to “${item}”?`,
    swapLeaving: (item: string, leaving: string) => `Move to “${item}” and leave “${leaving}”?`,
    swapped: 'Your swap is recorded.',
    notYet: 'The allocation has not been published yet. It will appear here once the organisation releases it.',
    publishedAt: (when: string) => `published ${when}`,
    noItem: 'You have no activity on this day.',
    credited: (minutes: number) => `${minutes} ${byCount(minutes, 'minute', 'minutes')} credited`,
    fee: (amount: string) => `Cost: ${amount}`,
    deficit: (minutes: number) => `You are still missing ${minutes} ${byCount(minutes, 'minute', 'minutes')} here. Your class teacher will place you in an activity with open places.`,
    noFee: 'Your activities have no cost.',
    feeTotal: (amount: string) => `Total ${amount}; the school will tell you how and by when to pay.`,
    swap: {
      heading: 'Swap',
      window: (from: string, until: string) => `From ${from} to ${until} you can move to an activity with open places. Places are first come, first served. A class activity stays, and you must not be left with more missing time than now.`,
      noOffers: 'No other activity is offered to you at the moment.',
      leaves: (items: string) => `You will leave: ${items}`,
      submit: 'Move',
    },
    changes: 'Changes since publication',
    left: (items: string) => `no longer ${items}`,
    entered: (item: string) => `new ${item}`,
    explanation: {
      heading: 'How your allocation was made',
      rule: (seed: number, seq: number) => `First, no one should be left without a full week, then as few minutes as possible should be missing, then as few students as possible should mainly get lower choices, then the overall result should be as good as possible. Where two allocations were equally good, a draw decided, with draw number ${seed} (calculation ${seq}).`,
      late: 'You registered during late registration; the others were therefore considered first.',
      noWishes: 'You submitted no choices and have therefore been given remaining places with no cost.',
    },
  },

  /** Verwaltung.vue: what a school administrator maintains. */
  admin: {
    adminsOnly: 'Administration is reserved for the school administration.',
    roster: 'The school’s class lists: from Entra groups or a CSV file, with classes and years.',
    people: 'Who has signed in, who each account is linked to, who organises registrations, who is blocked.',
    classTeachers: 'Who leads each class and sees its registration status.',
    periods: 'The school periods teachers use to specify their sessions.',
    mailTemplates: 'The emails a registration sends: invitations, reminders, lists for class teachers.',
    retention: 'Which school years have data and how long it is kept; delete a school year one year after its end.',
    /** The school's language, chosen here for everyone; the page then loads again in it. */
    language: {
      title: 'Language',
      intro: 'SchulWahl uses this language for pages, Excel files and emails for everyone at the school. Email templates that someone has changed stay as they are.',
      label: 'School language',
      saved: 'Language saved. The page will reload.',
    },
  },

  /** Stammdaten.vue: the list in force, the Entra groups, a refresh from them, a CSV upload, the imports so far. */
  roster: {
    /** Column and field names the list in force, the imports and an import's page share. */
    source: 'Source',
    persons: 'People',
    fetched: 'Imported',
    current: {
      title: 'Current class lists',
      none: 'No class lists yet. Import them from Entra groups or upload a CSV file.',
      committed: 'Applied',
    },
    groups: {
      title: 'Entra groups',
      intro: 'Enter the groups the class lists come from here: one group per class with its class and year, plus the teachers’ group. Search Microsoft for the groups by name, or enter the group ID shown for the group in Entra (object ID). Subgroups are included: enter each class only once, either its group or its subgroups (3A, or 3AR and 3AG), otherwise each person appears twice in the list.',
      id: 'Group ID',
      label: 'Name',
      kind: 'Kind',
      /** A row's field as a screen reader names it: the column and the group, "Class 5A". */
      fieldOf: (field: string, group: string) => `${field} ${group}`,
      /** The group a row's fields name while it has no label (or id) yet. */
      newGroup: 'new group',
      none: 'No groups entered yet.',
      add: 'Add group',
      searchAtMicrosoft: 'Search Microsoft for groups',
      save: 'Save groups',
      saved: 'Groups saved.',
    },
    /** The search over the tenant's groups by name. */
    picker: {
      title: 'Search groups',
      /** Followed by the link `authorize` and a full stop. */
      authorizationNeeded: 'You need to sign in to Microsoft to search:',
      authorize: 'Sign in to Microsoft and search groups',
      query: 'Group name starts with',
      allClasses: 'Find all class groups',
      allClassesHint: 'Groups named after a class (5A, 1B, …). Class and year are filled in from the name: 5A → Year 9.',
      takeAll: (count: number) => `Apply all ${count} ${byCount(count, 'group', 'groups')}`,
      take: (group: string) => `Apply ${group}`,
      noClassGroup: 'No group named after a class that has not already been entered.',
      noMatch: 'No group starting with this text.',
    },
    refresh: {
      title: 'Import from Entra groups',
      /** `scopes`: the Graph permissions, comma-separated. */
      intro: (scopes: string) => `You will be redirected to Microsoft and allow SchulWahl to read group members with your account (${scopes}). The class lists will be imported and shown to you for review before taking effect.`,
      start: 'Import now',
      groupsFirst: 'Enter and save the groups first.',
    },
    csv: {
      title: 'Upload CSV file',
      /** Followed by the link `template`, a colon and `columns`. */
      columnsOf: 'One row per person with the columns in the',
      template: 'Template',
      columns: 'Email address, first name, surname, class, year, kind (student or teacher), optionally the class teacher’s email address. Separate with semicolons or commas. On first sign-in, each person is recognised by their school email address.',
      file: 'File',
      paste: 'Or paste content',
      import: 'Import',
    },
    batches: {
      title: 'Imports',
      changes: 'Changes',
      /** A refused import's changes column: how many problems it has. */
      problems: (count: number) => `${count} ${byCount(count, 'problem', 'problems')}`,
    },
  },

  /** Import.vue: one import, its changes against the list in force, its problems, and the decision. */
  rosterImport: {
    title: 'Import',
    /** When the import was read, and by whom. */
    fetchedBy: (when: string, who: string) => `${when} by ${who}`,
    decided: 'Decided',
    problems: {
      title: 'Problems',
      rejected: 'The list was rejected. Fix the problems in the source and import it again.',
      line: (line: number) => `Line ${line}`,
    },
    warnings: 'Notes',
    changes: {
      title: 'Changes from the current class lists',
      summary: (counts: { added: number, removed: number, changed: number, unchanged: number }) => `${counts.added} new, ${counts.removed} removed, ${counts.changed} changed, ${counts.unchanged} unchanged.`,
      commit: 'Apply',
      discard: 'Discard',
      committed: 'The class lists are now in effect.',
      discarded: 'The import was discarded.',
      added: 'New',
      removed: 'Removed',
      changed: 'Changed',
      kindAndClass: 'Kind, class',
      change: 'Change',
    },
  },

  /** Personen.vue: accounts, the roster person behind each, roles, blocking; every action with a reason. */
  people: {
    roles: 'Roles',
    accounts: {
      title: 'Accounts',
      filter: 'Name or email',
      unboundOnly: 'only unlinked',
      apply: 'Filter',
      none: 'No accounts found.',
      lastSignIn: 'Last signed in',
      person: 'Person',
      blocked: 'blocked',
      unbound: 'Not linked',
      notInRoster: 'Not in the current class lists',
    },
    /** The buttons in an account's row, by the action they prepare. */
    open: {
      bind: 'Link',
      grant: 'Role',
      block: 'Block',
      unblock: 'Unblock',
    },
    /** The heading of the form an action is prepared in, with the account's name. */
    title: {
      bind: (name: string) => `Link ${name} to a person`,
      block: (name: string) => `Block ${name}`,
      unblock: (name: string) => `Unblock ${name}`,
      grant: (name: string) => `Grant ${name} a role`,
    },
    personSearch: 'Person from the class lists',
    personSearchPlaceholder: 'Name, class or email',
    noPerson: 'No person found.',
    /** After a person found for binding whose current account the binding releases. */
    currentAccount: (account: string) => `currently account “${account}”, which will be unlinked`,
    /** The form's submit button, by action. */
    submit: {
      bind: 'Link',
      block: 'Block',
      unblock: 'Unblock',
      grant: 'Grant role',
    },
    grants: {
      none: 'No one has a special role.',
      granted: 'Granted',
      /** When the role was granted, and by whom. */
      grantedBy: (when: string, who: string) => `${when} by ${who}`,
      revoke: 'Revoke',
      /** The revocation form's heading: the person and the role. */
      revokeTitle: (name: string, role: string) => `${name}: revoke ${role}`,
    },
  },

  /** Klassen.vue: the classes and their class teachers. */
  classTeachers: {
    saved: 'Class teachers saved.',
    /** A class teacher the roster names, in the table. */
    byRoster: (name: string) => `${name} (from class list)`,
    editorsOnly: 'The administration and organisation assign class teachers.',
    intro: 'The class teacher sees who in the class has registered and, after publication, places those still short of time. If named in the class list (class_teacher_email column), they are also the class teacher here.',
    noClasses: 'There are no class lists with classes yet.',
    classTeacher: 'Class teacher',
    assign: 'Link',
    assignTo: (className: string) => `Assign class teacher for ${className}`,
    of: (className: string) => `Class teacher for ${className}`,
    removeTeacher: (name: string) => `Remove ${name}`,
    addTeacher: 'Add teacher',
    addPerson: (name: string) => `Add ${name}`,
  },

  /** Zeiten.vue: the school's period grid. */
  periods: {
    adminsOnly: 'The school administration changes the timetable.',
    intro: 'The school periods teachers use to specify their sessions (“from period 2, lasting 2 periods”). Sessions at other times, such as trips, are given by clock time.',
    period: 'Period',
    starts: 'Start',
    ends: 'End',
    startsOf: (period: number) => `Start of period ${period}`,
    endsOf: (period: number) => `End of period ${period}`,
    add: 'Add period',
    removeLast: 'Remove last',
    saved: 'Timetable saved.',
  },

  /** Mailvorlagen.vue: the texts of the mails a campaign sends; their defaults are the group `mail`, a school's own texts are stored. */
  mailTemplates: {
    editorsOnly: 'The administration and organisation change the email templates.',
    intro: 'The emails a registration sends. SchulWahl fills placeholders such as {{first_name}} when sending; click one to insert it.',
    mailOff: 'Sending email is not configured on this server: emails will wait until it is.',
    saved: 'Template saved.',
    testQueued: 'A test email to your address is queued.',
    /** Followed by a colon and the template's placeholders. */
    placeholders: 'Placeholders',
    sendTest: 'Test email to me',
    /** The form of a template, by the mail's kind. */
    editing: (kind: string) => `Edit ${kind}`,
    subject: 'Subject',
    body: 'Body',
    /** Beside a template's name: whether the school saved a text of its own or the default applies. */
    customText: 'School’s own text',
    defaultText: 'Default text',
    reset: 'Reset',
    resetConfirm: 'Delete the school’s own text? The default text will apply again afterwards.',
    resetDone: 'Template reset. The default text applies again.',
    /** A saved text in a language other than the school's; the language as labels.locale names it. */
    otherLanguage: (language: string) => `This text was written for “${language}”. The school now uses another language: translate it or reset it.`,
    placeholderHint: 'Clicking a placeholder inserts it where the cursor last was: in the subject or body.',
    /** What each placeholder stands for (apps/api/services/mail-templates.ts PLACEHOLDERS), listed beside it while editing. */
    placeholder: {
      first_name: 'First name of the person receiving the email',
      name: 'Full name of the person receiving the email',
      campaign: 'Registration name, e.g. Project week 2027',
      link: 'Link to the relevant page in SchulWahl',
      deadline: 'End of the registration period or late registration, with date and time',
      project_days: 'The project days',
      class_name: 'The class, e.g. 5A',
      window: 'What has ended: the registration period or late registration',
      list: 'The affected students, one line per person',
      programme: 'The allocation: each activity with day, time and cost, followed by what is still missing',
      swap_period: 'The swap period with start and end; blank if there is none',
      activity: 'Activity title',
      wish_count: 'How many students chose the activity',
      minimum: 'Activity minimum',
      changed_by: 'Who changed the allocation: the class teacher or the organisation',
      change: 'What changed in the allocation',
    },
    /** The values the test mail fills in, so that every placeholder shows filled. */
    sample: {
      first_name: 'Maria',
      name: 'Maria Example',
      campaign: 'Project week 2027',
      link: 'https://wahl.example.org/wahlen/…',
      deadline: 'Mon, 08/03/2027, 20:00',
      project_days: 'Mon, 21/06/2027, Tue, 22/06/2027',
      class_name: '5A',
      window: 'Registration period',
      list: '- Maria Example\n- Max Example',
      programme: 'Mon, 21/06: 3. Climbing (08:30 – 12:15)\nTue, 22/06: 7. Vienna (class)',
      swap_period: 'Mon, 05/07/2027, 08:00 to Mon, 12/07/2027, 20:00',
      activity: 'Pottery',
      wish_count: '3',
      minimum: '8',
      changed_by: 'your class teacher',
      change: 'new: Mon, 21/06: 5. Pottery (08:30 – 12:15)',
    },
  },

  /** Aufbewahrung.vue: the school years' records and the purge of one. */
  retention: {
    adminsOnly: 'Retention is reserved for the school administration; the read-only role can view it.',
    intro: 'Project week data is kept until one year after the end of its school year. You can then delete it here, with a reason; nothing is deleted automatically. Save the allocation and cost list as Excel first in case the accounts department needs them. Deletion is permanent.',
    purged: 'The school year’s data has been deleted.',
    years: 'School years',
    none: 'No data yet.',
    /** The columns of the years' table, besides the school year. */
    campaigns: 'Registrations',
    batches: 'Imports',
    classTeachers: 'Class teachers',
    retainedUntil: 'Retained until',
    expired: 'expired',
    purge: {
      title: 'Delete school year',
      /** After a school year that cannot be purged yet, in the list to choose from. */
      stillRetained: 'Retention period still running',
      notArchived: 'a registration is not closed',
      confirm: 'Enter the school year again to confirm',
      submit: 'Delete permanently',
      removed: 'Deleted',
    },
  },

  /** The workbooks the API writes (apps/api/lib/xlsx.ts): sheets, the columns the pages do not name, cell values. */
  workbook: {
    sheet: {
      missing: 'Registration status',
      items: 'Activities',
      sessions: 'Sessions',
      attendance: 'Attendance',
      students: 'Students',
      participants: 'Participants',
      deficits: 'Missing minutes',
      changes: 'Changes',
    },
    column: {
      window: 'Period',
      savedAt: 'Last saved',
      mails: 'Emails',
      title: 'Title',
      description: 'Description',
      location: 'Location',
      minParticipants: 'Minimum',
      cancellableBelowMinimum: 'Cancelled if too few',
      fixedClasses: 'Whole classes',
      grades: 'Years',
      classes: 'Classes',
      fee: 'Cost (€)',
      feeNote: 'Cost: what for',
      minutes: 'Minutes',
      starts: 'Start',
      ends: 'End',
      credits: 'Credited (day: minutes)',
      from: 'From',
      until: 'Until',
      attendance: 'Attendance',
      note: 'Note',
      deficit: 'Missing minutes',
      kind: 'Kind',
      wish: 'Choice',
      assigned: 'Placed',
      fixed: 'Whole classes',
      minimum: 'Minimum',
      cancelled: 'Cancelled',
      when: 'When',
      left: 'No longer',
      to: 'New',
      forced: 'Anyway',
      by: 'By',
    },
    yes: 'yes',
    no: 'no',
    /** How a student came to an item, in brackets after it in the day's cell. */
    place: {
      wish: (rank: number | null) => `choice ${rank}`,
      fallback: 'Remaining place',
      fixed: 'Class',
    },
    /** The source of a participant's place (school-core ASSIGNMENT_SOURCES), as the participants' sheet names it. */
    source: {
      fixed: 'Class activity',
      wish: 'Choice',
      fallback: 'Remaining place',
      swap: 'Swap',
      manual: 'By hand',
    },
  },

  /** The names of the files the server sends for download; a school year arrives as "2026-27". */
  files: {
    catalogue: (schoolYear: string) => `catalogue-${schoolYear}.xlsx`,
    missing: (schoolYear: string) => `registration-status-${schoolYear}.xlsx`,
    assignments: (schoolYear: string) => `allocation-${schoolYear}.xlsx`,
    run: (seq: number) => `allocation-calculation-${seq}.xlsx`,
    attendance: (schoolYear: string) => `attendance-${schoolYear}.xlsx`,
    classAttendance: (className: string, schoolYear: string) => `attendance-${className.toLowerCase()}-${schoolYear}.xlsx`,
    rosterTemplate: 'schulwahl-class-lists.csv',
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
      fixed: 'Class',
      /** The fee of an item, its amount already formatted. */
      fee: (amount: string) => `Cost: €${amount}`,
      /** The last line when minutes are still missing: the days with their minutes. */
      missing: (days: string) => `Still without a place: ${days} – your class teacher will place you.`,
    },
    /** The swap window: "Mon, 28/06/2027, 08:00 to Wed, 30/06/2027, 18:00". */
    swapWindow: (from: string, until: string) => `${from} to ${until}`,
    /** Who changed a student's place, as the sentence "… changed by {{changed_by}}" needs it. */
    changedBy: {
      classTeacher: 'your class teacher',
      organizer: 'the organisation',
    },
    /** What a change by hand did. */
    change: {
      left: (items: string) => `no longer ${items}`,
      entered: (item: string) => `new ${item}`,
      replaced: (left: string, item: string) => `instead of ${left}, now ${item}`,
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
      subject: '{{campaign}}: submit choices by {{deadline}}',
      body: 'Hello {{first_name}},\n\nRegistration for {{campaign}} ({{project_days}}) is open. Please submit your choices by {{deadline}}; sign in with your school account:\n\n{{link}}\n\nWhen you register during the registration period makes no difference to the allocation, and you can still change your choices until {{deadline}}. If your whole class takes part in an activity, you only choose for the remaining time.\n\nEnjoy choosing!',
    },
    choice_reminder: {
      subject: 'Reminder: choices for {{campaign}} by {{deadline}}',
      body: 'Hello {{first_name}},\n\nYour choices for {{campaign}} are not complete yet. Please submit them by {{deadline}}:\n\n{{link}}\n\nHave you just done this? Then simply ignore this email.',
    },
    grace_invitation: {
      subject: 'Late registration: choices for {{campaign}} by {{deadline}}',
      body: 'Hello {{first_name}},\n\nThe registration period for {{campaign}} has ended, and your choices are still missing or incomplete. You can submit them until {{deadline}}:\n\n{{link}}\n\nLate registration choices are considered after the others. Anyone who has not submitted choices by then gets remaining places with no cost.',
    },
    grace_reminder: {
      subject: 'Final reminder: choices for {{campaign}} by {{deadline}}',
      body: 'Hello {{first_name}},\n\nLate registration for {{campaign}} ends tomorrow, and your choices are still missing:\n\n{{link}}',
    },
    missed_deadline: {
      subject: '{{campaign}}: no choices submitted',
      body: 'Hello {{first_name}},\n\nRegistration for {{campaign}} has ended, and your choices are not complete. You will therefore get remaining places with no cost, or your class teacher will place you. You can see your allocation here once it is published:\n\n{{link}}',
    },
    class_missing: {
      subject: '{{campaign}}: missing choices in {{class_name}} ({{window}})',
      body: 'Hello {{first_name}},\n\nThe following choices are still missing from your class {{class_name}} for {{campaign}} ({{window}}):\n\n{{list}}\n\nPlease remind these students. You can see the class’s registration status here:\n\n{{link}}',
    },
    result_published: {
      subject: '{{campaign}}: your allocation',
      body: 'Hello {{first_name}},\n\nThe allocation for {{campaign}} is ready. This is your programme:\n\n{{programme}}\n\n{{#if swap_period}}If you would like to swap: during the swap period, {{swap_period}}, you can move to an activity with open places.\n\n{{/if}}You can see all the details and how your allocation was made here:\n\n{{link}}',
    },
    class_unplaced: {
      subject: '{{campaign}}: not everyone in {{class_name}} placed yet',
      body: 'Hello {{first_name}},\n\nFor {{campaign}}, not everyone in your class {{class_name}} has been placed for every day yet:\n\n{{list}}\n\nPlease place them in activities with open places. You can see the class’s registration status here:\n\n{{link}}',
    },
    item_cancelled: {
      subject: '{{campaign}}: {{activity}} cancelled',
      body: 'Hello {{first_name}},\n\nYour activity “{{activity}}” for {{campaign}} did not reach its minimum of {{minimum}} ({{wish_count}} choices) and is therefore cancelled. Those who chose it have been placed according to their other choices.\n\n{{link}}',
    },
    swap_confirmed: {
      subject: '{{campaign}}: your swap',
      body: 'Hello {{first_name}},\n\nYour swap for {{campaign}} is recorded. This is your programme now:\n\n{{programme}}\n\nYou can see all the details here:\n\n{{link}}',
    },
    assignment_changed: {
      subject: '{{campaign}}: your allocation has changed',
      body: 'Hello {{first_name}},\n\nYour allocation for {{campaign}} was changed by {{changed_by}}: {{change}}\n\nThis is your programme now:\n\n{{programme}}\n\nYou can see all the details here:\n\n{{link}}',
    },
  },
}
