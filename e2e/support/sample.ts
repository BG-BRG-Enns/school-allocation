// What the journeys type into the app, in the journeys' language: the
// names of the registrations and activities, a description, the reasons
// an action asks for, a mail template's text. The English leg, and the
// English handbook's pictures, then show an English school. The test
// people's names, the class names and the stand-in's groups stay the same
// in every language. Formal German types what German types.

import { LOCALE } from './messages.ts'

const de = {
  projectWeek: 'Projektwoche 2034',
  sportsWeek: 'Sportwoche 2034',
  climbing: 'Klettern',
  climbingDescription: 'Kletterhalle, Ausrüstung wird gestellt.',
  /** The fee as a person types it, with the language's decimal mark. */
  climbingFee: '15,00',
  climbingFeeNote: 'Eintritt und Leihschuhe',
  vienna: 'Wien',
  archery: 'Bogenschießen',
  woodwork: 'Werken',
  dance: 'Tanz',
  chess: 'Schach',
  teachersGroup: 'Lehrkräfte',
  reason: {
    otherAccount: 'Anderes Konto als in der Liste',
    organizes: 'Organisiert die Projektwoche',
    ill: 'Tim war krank',
    noMorningPlace: 'Tim hatte am Vormittag keinen Platz',
    reportedIll: 'Sara ist krank gemeldet',
  },
  /** The start of a reminder of the organizer's own, before the placeholders the journey adds. */
  reminder: 'Hallo {{first_name}}, bitte bis {{deadline}}: ',
}

const en: typeof de = {
  projectWeek: 'Project Week 2034',
  sportsWeek: 'Sports Week 2034',
  climbing: 'Climbing',
  climbingDescription: 'Climbing centre, equipment provided.',
  climbingFee: '15.00',
  climbingFeeNote: 'Entry and hire shoes',
  vienna: 'Vienna',
  archery: 'Archery',
  woodwork: 'Woodwork',
  dance: 'Dance',
  chess: 'Chess',
  teachersGroup: 'Teachers',
  reason: {
    otherAccount: 'Signs in with another account than the list has',
    organizes: 'Organises the project week',
    ill: 'Tim was ill',
    noMorningPlace: 'Tim had no place in the morning',
    reportedIll: 'Sara is off sick',
  },
  reminder: 'Hello {{first_name}}, please by {{deadline}}: ',
}

export const sample = LOCALE === 'en' ? en : de
