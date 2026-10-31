// The handbooks and their pages, in reading order: the folder, each page's
// file name (the empty one is the folder's index.md) and its title in the
// sidebar, in German and in English. The site's sidebar is built from
// here, and so is the check that every page exists in both languages
// (scripts/handbook.test.mjs); the app's help link opens a handbook's
// first page (apps/web/src/lib/handbook.ts).

export interface Handbook {
  folder: string
  de: string
  en: string
  pages: readonly (readonly [file: string, de: string, en: string])[]
}

export const HANDBOOKS: readonly Handbook[] = [
  {
    folder: 'verwaltung',
    de: 'Verwaltung',
    en: 'Administration',
    pages: [
      ['', 'Überblick', 'Overview'],
      ['klassenlisten', 'Klassenlisten', 'Class lists'],
      ['konten-und-rollen', 'Konten und Rollen', 'Accounts and roles'],
      ['klassenvorstaende', 'Klassenvorstände', 'Class teachers'],
      ['stundenraster', 'Stundenraster', 'Timetable'],
      ['aufbewahrung', 'Aufbewahrung', 'Retention'],
    ],
  },
  {
    folder: 'organisation',
    de: 'Organisation',
    en: 'Organisation',
    pages: [
      ['', 'Überblick', 'Overview'],
      ['anlegen', 'Anlegen und Katalog', 'Setting up and the catalogue'],
      ['einstellungen', 'Einstellungen', 'Settings'],
      ['anmeldung', 'Während der Anmeldung', 'During registration'],
      ['zuteilung', 'Zuteilung', 'Allocation'],
      ['nach-der-veroeffentlichung', 'Nach der Veröffentlichung', 'After publication'],
      ['abschluss', 'Abschluss', 'Closing'],
      ['excel', 'Excel-Dateien', 'Excel files'],
      ['e-mail-vorlagen', 'E-Mail-Vorlagen', 'Email templates'],
    ],
  },
  {
    folder: 'lehrkraefte',
    de: 'Lehrkräfte',
    en: 'Teachers',
    pages: [
      ['', 'Überblick', 'Overview'],
      ['aktivitaet', 'Eine Aktivität einreichen', 'Proposing an activity'],
      ['verfuegbarkeit', 'Verfügbarkeit', 'Availability'],
      ['teilnehmerlisten', 'Teilnehmer*innen', 'Participants'],
      ['klassenvorstand', 'Als Klassenvorstand', 'As class teacher'],
    ],
  },
]
