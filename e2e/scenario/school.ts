// The scenario: a whole school's project days, generated from a seed. 600
// students in 25 classes, 60 teachers, about 65 activities over Monday to
// Wednesday, 3 to 5 July 2034, and how each student chooses. Pure data,
// the same for the same seed; load.ts carries it into a database through
// the services, along the story's clock, and simulate.ts runs the
// allocation on it.
//
// The catalogue is modelled on how a school runs its project days (a
// sports day for the lower school on Monday, class trips and careers
// guidance on Tuesday, workshops and a concert on Wednesday, the 7th
// classes away for two days), with generic names and places: nothing in
// it points at a real school, venue or person.

import { demandByDay, placeTarget, type ClassSize, type DayDemand, type OfferedItem } from '@school-allocation/school-core'
import { CLASS_5A_GROUP, TEACHERS_GROUP } from '../../apps/api/test/helpers/fake-graph.ts'
import { ANNA, BERND, CARLA, SARA, TIM, type Person } from '../../apps/api/test/helpers/personas.ts'
import { FAMILY_NAMES, STUDENT_FIRST_NAMES, TEACHER_FIRST_NAMES } from './names.ts'
import { random, uuid, type Random } from './random.ts'

export const SCENARIO_SEED = 20331107
export const SCHOOL_YEAR = '2033/34'
export const MONDAY = '2034-07-03'
export const TUESDAY = '2034-07-04'
export const WEDNESDAY = '2034-07-05'
export const PROJECT_DAYS = [MONDAY, TUESDAY, WEDNESDAY] as const
export const DOMAIN = 'schule.example.org'

/** The story's moments, as the school's clock reads them (Vienna: CET until 26 March 2034, then CEST). */
export const STORY = {
  /** Teachers set their availability and propose; class activities first, courses until Thursday 15 December. */
  starts: '2033-11-07T08:00:00+01:00',
  proposalsEnd: '2033-12-15T18:00:00+01:00',
  /** The organizer reviews and approves from after the holidays until the Friday before the semester break. */
  reviewStarts: '2034-01-09T08:00:00+01:00',
  reviewEnds: '2034-02-17T16:00:00+01:00',
  published: '2034-02-27T08:00:00+01:00',
  opens: '2034-03-06T08:00:00+01:00',
  closes: '2034-03-12T20:00:00+01:00',
  lateUntil: '2034-03-19T20:00:00+01:00',
  /** The organizer runs the allocation. */
  runs: '2034-03-20T08:00:00+01:00',
  published2: '2034-03-21T10:00:00+01:00',
  swapFrom: '2034-03-21T12:00:00+01:00',
  swapUntil: '2034-03-28T20:00:00+02:00',
} as const

export const CATEGORIES = {
  sport: 'Sport',
  careers: 'Berufsorientierung',
  creative: 'Kreativ',
  nature: 'Natur und Technik',
  culture: 'Kultur',
  community: 'Gemeinschaft',
} as const

export interface ScenarioPerson {
  oid: string
  givenName: string
  familyName: string
  /** Given and family name, as Graph's displayName. */
  name: string
  email: string
}

export interface ScenarioClass {
  name: string
  grade: number
  groupId: string
  groupName: string
  students: ScenarioPerson[]
  /** The class teacher's oid; null for the leavers, who are not taken over. */
  classTeacher: string | null
}

export type ScenarioAvailability = 'unavailable' | 'if_needed'

export interface ScenarioTeacher extends ScenarioPerson {
  /** Days the teacher is not simply available; a day missing here is available. */
  availability: Partial<Record<string, ScenarioAvailability>>
  /** When the teacher enters it, if there is anything to enter. */
  availabilitySetAt: string | null
}

export interface ScenarioSession {
  date: string
  /** Local times, HH:MM. */
  from: string
  to: string
  /** The minutes the session credits on its date. */
  minutes: number
}

export interface ScenarioItem {
  key: string
  title: string
  description: string
  location: string
  feeCents: number
  feeNote: string
  places: number
  minParticipants: number
  cancellableBelowMin: boolean
  fixedClasses: string[]
  eligibleGrades: number[]
  eligibleClasses: string[]
  /** Oids, the lead first: whoever proposes it. */
  teachers: string[]
  sessions: ScenarioSession[]
  categories: string[]
  proposedAt: string
  approvedAt: string
  /** How much students want it, before their class's and their own taste. */
  popularity: number
}

/** How a student goes about the choice: on time, in the grace week, saved but incomplete, or not at all. */
export type ChoicePlan = 'first' | 'late' | 'incomplete' | 'never'

export interface ScenarioChoice {
  oid: string
  className: string
  plan: ChoicePlan
  /** When the student saves; null for never. */
  saveAt: string | null
}

export interface ScenarioRule {
  category: string
  grades: number[]
  classes: string[]
  unit: 'items' | 'minutes'
  minimum: number
}

export interface Scenario {
  seed: number
  schoolYear: string
  projectDays: readonly string[]
  campaign: {
    name: string
    opensAt: string
    closesAt: string
    lateUntil: string
    swapFrom: string
    swapUntil: string
    wishesPerGroup: number
    dailyMinimum: Record<string, number>
    showTeachers: boolean
    reminderDays: number
    placeHeadroomPercent: number
    rules: ScenarioRule[]
  }
  /** The administrator: Anna, whose address is in BOOTSTRAP_ADMINS. */
  admin: string
  /** The teacher granted the organizer role, and the reason the administrator gives. */
  organizer: string
  organizerReason: string
  classes: ScenarioClass[]
  /** 8A and 8B: in the tenant until they leave in May, never labelled, so never in the roster. */
  leavers: ScenarioClass[]
  teachers: ScenarioTeacher[]
  teachersGroup: { groupId: string, groupName: string }
  categories: string[]
  items: ScenarioItem[]
  choices: ScenarioChoice[]
  /** Per student oid and item key: how much the student wants it; higher first. */
  preferences: Record<string, Record<string, number>>
}

const CLASSES: readonly (readonly [string, number, number])[] = [
  ['1A', 5, 24], ['1B', 5, 24], ['1C', 5, 24], ['1D', 5, 24], ['1E', 5, 24],
  ['2A', 6, 25], ['2B', 6, 25], ['2C', 6, 25], ['2D', 6, 25],
  ['3A', 7, 23], ['3B', 7, 23], ['3C', 7, 23], ['3D', 7, 23], ['3E', 7, 23],
  ['4A', 8, 24], ['4B', 8, 24], ['4C', 8, 24], ['4D', 8, 24],
  ['5A', 9, 26], ['5B', 9, 26],
  ['6A', 10, 25], ['6B', 10, 25],
  ['7A', 11, 23], ['7B', 11, 22], ['7G', 11, 22],
]
const LEAVERS: readonly (readonly [string, number, number])[] = [['8A', 12, 18], ['8B', 12, 18]]
const TEACHER_COUNT = 60

/** The seeded period grid (0001_baseline.sql): start and end of each period. */
const PERIODS: Record<number, readonly [string, string]> = {
  1: ['07:35', '08:25'], 2: ['08:30', '09:20'], 3: ['09:25', '10:15'], 4: ['10:30', '11:20'], 5: ['11:25', '12:15'], 6: ['12:20', '13:10'],
}

/** A session over periods `first` to `last` of `date`, crediting 50 minutes a period. */
function periods(date: string, first: number, last: number): ScenarioSession {
  return { date, from: PERIODS[first]?.[0] ?? '', to: PERIODS[last]?.[1] ?? '', minutes: (last - first + 1) * 50 }
}

const LOWER = [5, 6, 7, 8]
const UPPER = [9, 10]

interface ItemSpec {
  key: string
  title: string
  description: string
  location: string
  sessions: ScenarioSession[]
  grades?: number[]
  classes?: string[]
  /** A class activity: these classes are in it; places are its extra places. */
  fixed?: string[]
  /** Places as given: an "unlimited" item, or a class activity's extra places. Otherwise drawn to the target. */
  places?: number
  /** The share of the drawn places, 1 unless said. */
  weight?: number
  min?: number
  cancellable?: boolean
  feeCents?: number
  feeNote?: string
  categories: string[]
  popularity?: number
  companions?: number
}

const { sport, careers, creative, nature, culture, community } = CATEGORIES

const CATALOGUE: readonly ItemSpec[] = [
  // Monday: the lower school's sports day, in blocks of periods and single periods; the upper school's courses and helpers.
  { key: 'mon-athletics', title: 'Leichtathletik-Stationen', description: 'Sprint, Weitsprung und Ballwurf an Stationen, mit Urkunde.', location: 'Sportplatz', sessions: [periods(MONDAY, 2, 3)], grades: LOWER, categories: [sport], companions: 1 },
  { key: 'mon-ball-games', title: 'Kleine Ballspiele', description: 'Ballspiele für alle, die lieber in kleinen Teams spielen.', location: 'Turnsaal 1', sessions: [periods(MONDAY, 2, 3)], grades: LOWER, categories: [sport] },
  { key: 'mon-obstacle', title: 'Geschicklichkeitsparcours', description: 'Balancieren, Klettern, Kriechen: ein Parcours durch den ganzen Turnsaal.', location: 'Turnsaal 2', sessions: [periods(MONDAY, 2, 3)], grades: LOWER, categories: [sport], popularity: 0.9 },
  { key: 'mon-relays', title: 'Staffelspiele', description: 'Staffeln mit Ball, Reifen und Seil, gegen die Uhr und gegeneinander.', location: 'Sportplatz', sessions: [periods(MONDAY, 4, 5)], grades: LOWER, categories: [sport] },
  { key: 'mon-frisbee', title: 'Frisbee und Ultimate', description: 'Werfen und Fangen lernen, dann ein Spiel Ultimate.', location: 'Schulwiese', sessions: [periods(MONDAY, 4, 5)], grades: LOWER, categories: [sport], popularity: 1.1 },
  { key: 'mon-dance', title: 'Tanzen', description: 'Einfache Choreografien zu aktueller Musik, ohne Vorkenntnisse.', location: 'Turnsaal 1', sessions: [periods(MONDAY, 4, 5)], grades: LOWER, categories: [sport], popularity: 0.9 },
  { key: 'mon-orienteering', title: 'Orientierungslauf', description: 'Mit Karte und Kompass rund um die Schule, in Zweierteams.', location: 'Treffpunkt Haupteingang', sessions: [periods(MONDAY, 3, 5)], grades: LOWER, places: 150, categories: [sport], companions: 1 },
  { key: 'mon-swimming', title: 'Schwimmen', description: 'Spiele und Staffeln im Hallenbad; Badesachen mitbringen.', location: 'Hallenbad', sessions: [periods(MONDAY, 3, 5)], grades: [6, 7, 8], feeCents: 350, feeNote: 'Eintritt', categories: [sport], popularity: 1.3, companions: 1 },
  { key: 'mon-dodgeball', title: 'Völkerballturnier', description: 'Klassenteams spielen um den Wanderpokal.', location: 'Sporthalle', sessions: [periods(MONDAY, 2, 6)], grades: LOWER, categories: [sport], popularity: 1.2, companions: 1 },
  { key: 'mon-football', title: 'Fußballturnier', description: 'Gemischte Teams, kurze Spiele, ein Turnier über den Vormittag.', location: 'Fußballplatz', sessions: [periods(MONDAY, 2, 6)], grades: LOWER, categories: [sport], popularity: 1.4, companions: 1 },
  { key: 'mon-skipping', title: 'Seilspringen', description: 'Vom Einzelsprung bis zum Doppelseil.', location: 'Schulhof', sessions: [periods(MONDAY, 2, 2)], grades: LOWER, categories: [sport], popularity: 0.8 },
  { key: 'mon-yoga', title: 'Yoga', description: 'Ruhige Übungen zum Aufwärmen in den Tag.', location: 'Gymnastikraum', sessions: [periods(MONDAY, 2, 2)], grades: LOWER, categories: [sport], popularity: 0.7 },
  { key: 'mon-table-tennis', title: 'Tischtennis', description: 'Rundlauf und kleine Matches.', location: 'Pausenhalle', sessions: [periods(MONDAY, 3, 3)], grades: LOWER, categories: [sport] },
  { key: 'mon-badminton', title: 'Badminton', description: 'Schlagtechnik und Doppel.', location: 'Turnsaal 3', sessions: [periods(MONDAY, 3, 3)], grades: LOWER, categories: [sport] },
  { key: 'mon-slackline', title: 'Slackline', description: 'Balancieren auf dem Band, gesichert und mit Hilfe.', location: 'Schulgarten', sessions: [periods(MONDAY, 4, 4)], grades: LOWER, categories: [sport], popularity: 1.1 },
  { key: 'mon-archery', title: 'Bogenschießen', description: 'Sicher zielen und treffen, mit Leihbögen.', location: 'Sportplatz Süd', sessions: [periods(MONDAY, 4, 4)], grades: LOWER, categories: [sport], popularity: 1.4, companions: 1 },
  { key: 'mon-bouldering', title: 'Boulderwand', description: 'Klettern in Absprunghöhe, mit Matten.', location: 'Kletterraum', sessions: [periods(MONDAY, 5, 5)], grades: LOWER, categories: [sport], popularity: 1.2 },
  { key: 'mon-juggling', title: 'Jonglieren', description: 'Tücher, Bälle, Teller: Jonglieren für Anfängerinnen und Anfänger.', location: 'Aula', sessions: [periods(MONDAY, 5, 5)], grades: LOWER, categories: [sport], popularity: 0.8 },
  { key: 'mon-canoe', title: 'Kanu', description: 'Paddeln auf ruhigem Wasser, mit Einschulung; Schwimmen können ist Voraussetzung.', location: 'Bootshaus', sessions: [periods(MONDAY, 2, 5)], grades: UPPER, feeCents: 1800, feeNote: 'Leihboot und Einschulung', min: 6, cancellable: true, categories: [sport], popularity: 1.6, companions: 1 },
  { key: 'mon-climbing', title: 'Hochseilgarten', description: 'Sichern lernen und über Seilbrücken und Balken balancieren.', location: 'Hochseilgarten', sessions: [periods(MONDAY, 2, 5)], grades: UPPER, feeCents: 1200, feeNote: 'Eintritt und Leihausrüstung', min: 6, cancellable: true, categories: [sport], popularity: 1.4, companions: 1 },
  { key: 'mon-escape', title: 'Escape Room', description: 'Rätsel lösen gegen die Zeit, in Teams zu fünft.', location: 'Treffpunkt Haupteingang', sessions: [periods(MONDAY, 2, 5)], grades: UPPER, feeCents: 1500, feeNote: 'Eintritt', min: 10, cancellable: true, categories: [community], popularity: 1.8 },
  { key: 'mon-podcast', title: 'Podcast-Studio', description: 'Eine eigene Folge planen, aufnehmen und schneiden.', location: 'Medienraum', sessions: [periods(MONDAY, 2, 5)], grades: UPPER, categories: [creative], popularity: 1.2 },
  { key: 'mon-first-aid', title: 'Erste Hilfe', description: 'Der Kurs mit Bestätigung: Notruf, stabile Seitenlage, Wiederbelebung.', location: 'Biologiesaal', sessions: [periods(MONDAY, 2, 5)], grades: UPPER, categories: [community], popularity: 0.8 },
  { key: 'mon-helpers', title: 'Helferteam Sporttag', description: 'Stationen betreuen, Zeiten nehmen, Urkunden schreiben: der Sporttag der Unterstufe braucht euch.', location: 'Turnsaal-Foyer', sessions: [periods(MONDAY, 2, 6)], grades: UPPER, places: 16, categories: [community], popularity: 0.7, companions: 1 },
  // Monday and Tuesday: the 7th classes away.
  {
    key: 'mon-tue-7th-trip', title: 'Rad- und Wandertage der 7. Klassen', description: 'Zwei Tage mit dem Rad und zu Fuß, mit Übernachtung in einer Jugendherberge.', location: 'Treffpunkt Haupteingang',
    sessions: [{ date: MONDAY, from: '07:30', to: '18:00', minutes: 360 }, { date: TUESDAY, from: '08:00', to: '16:00', minutes: 300 }],
    fixed: ['7A', '7B', '7G'], places: 0, feeCents: 8500, feeNote: 'Fahrt, Übernachtung und Verpflegung', categories: [sport, nature], companions: 1,
  },
  // Tuesday: class trips for the 1st classes, full mornings for the 2nd, careers guidance and courses for the 3rd and 4th, courses upstairs.
  { key: 'tue-1a-zoo', title: 'Ausflug in den Tierpark', description: 'Fütterung, Führung und ein Picknick.', location: 'Treffpunkt Haupteingang', sessions: [{ date: TUESDAY, from: '08:00', to: '13:00', minutes: 250 }], fixed: ['1A'], places: 0, feeCents: 900, feeNote: 'Fahrt und Eintritt', categories: [nature], companions: 1 },
  { key: 'tue-1b-hike', title: 'Wandertag', description: 'Eine Runde über die Hügel, mit Jause am Aussichtspunkt.', location: 'Treffpunkt Haupteingang', sessions: [{ date: TUESDAY, from: '08:00', to: '12:30', minutes: 250 }], fixed: ['1B'], places: 0, categories: [nature], companions: 1 },
  { key: 'tue-1c-museum', title: 'Besuch im Freilichtmuseum', description: 'Wie man früher wohnte, kochte und arbeitete.', location: 'Treffpunkt Haupteingang', sessions: [{ date: TUESDAY, from: '07:45', to: '13:00', minutes: 250 }], fixed: ['1C'], places: 0, feeCents: 1100, feeNote: 'Fahrt und Eintritt', categories: [culture], companions: 1 },
  { key: 'tue-1d-cave', title: 'Höhlenwanderung', description: 'Mit Führung durch eine Tropfsteinhöhle.', location: 'Treffpunkt Haupteingang', sessions: [{ date: TUESDAY, from: '07:30', to: '13:30', minutes: 250 }], fixed: ['1D'], places: 0, feeCents: 1200, feeNote: 'Fahrt und Führung', categories: [nature], companions: 1 },
  { key: 'tue-1e-farm', title: 'Erlebnistag am Bauernhof', description: 'Tiere versorgen, Brot backen, Traktor fahren.', location: 'Treffpunkt Haupteingang', sessions: [{ date: TUESDAY, from: '08:00', to: '12:30', minutes: 250 }], fixed: ['1E'], places: 0, feeCents: 700, feeNote: 'Fahrt', categories: [nature], companions: 1 },
  { key: 'tue-cooking', title: 'Kochen und Backen', description: 'Ein Menü aus der Schulküche, vom Einkauf bis zum Abwasch.', location: 'Schulküche', sessions: [periods(TUESDAY, 1, 5)], grades: [6], feeCents: 400, feeNote: 'Lebensmittel', min: 8, cancellable: true, categories: [community], popularity: 1.4, companions: 1 },
  { key: 'tue-upcycling', title: 'Upcycling-Werkstatt', description: 'Aus Altem Neues: Taschen, Lampen und Spiele aus Fundstücken.', location: 'Werkraum', sessions: [periods(TUESDAY, 1, 5)], grades: [6], categories: [creative] },
  { key: 'tue-board-games', title: 'Brettspielturnier', description: 'Von Klassikern bis zu neuen Spielen, mit Turnier am Ende.', location: 'Bibliothek', sessions: [periods(TUESDAY, 1, 5)], grades: [6], categories: [community], popularity: 1.1 },
  { key: 'tue-circus', title: 'Zirkuswerkstatt', description: 'Jonglieren, Balancieren, Akrobatik: am Ende eine kleine Vorstellung.', location: 'Turnsaal 1', sessions: [periods(TUESDAY, 1, 5)], grades: [6], categories: [sport], popularity: 1.2 },
  // Leaves five minutes before the first period: its own time group.
  { key: 'tue-forest', title: 'Naturerlebnis Wald', description: 'Spurensuche, Bachforschung und ein Lager aus Ästen.', location: 'Treffpunkt Haupteingang', sessions: [{ date: TUESDAY, from: '07:30', to: '12:15', minutes: 250 }], grades: [6], categories: [nature], companions: 1 },
  { key: 'tue-applications', title: 'Bewerbungstraining', description: 'Lebenslauf, Bewerbungsschreiben und ein geübtes Gespräch.', location: 'EDV-Saal 1', sessions: [periods(TUESDAY, 2, 5)], grades: [7, 8], weight: 2, categories: [careers], popularity: 0.8 },
  { key: 'tue-crafts', title: 'Betriebserkundung Handwerk', description: 'Zu Besuch in Werkstätten: was Lehrlinge dort lernen.', location: 'Treffpunkt Haupteingang', sessions: [periods(TUESDAY, 2, 5)], grades: [7, 8], weight: 2, feeCents: 300, feeNote: 'Fahrt', categories: [careers], companions: 1 },
  { key: 'tue-job-stations', title: 'Berufe-Parcours', description: 'Zwanzig Berufe an Stationen ausprobieren.', location: 'Aula', sessions: [periods(TUESDAY, 2, 5)], grades: [7, 8], weight: 2, categories: [careers], popularity: 1.1 },
  { key: 'tue-future', title: 'Zukunftswerkstatt', description: 'Stärken entdecken und Pläne für nach der Pflichtschule schmieden.', location: 'Klassenraum 3A', sessions: [periods(TUESDAY, 2, 5)], grades: [7, 8], weight: 2, categories: [careers], popularity: 0.7 },
  { key: 'tue-robotics', title: 'LEGO-Robotik', description: 'Roboter bauen und programmieren, bis sie den Parcours schaffen.', location: 'Physiksaal', sessions: [periods(TUESDAY, 2, 5)], grades: [7, 8], categories: [nature], popularity: 1.7 },
  { key: 'tue-screen-print', title: 'Siebdruck', description: 'Eigene Motive auf T-Shirts und Taschen drucken.', location: 'Zeichensaal', sessions: [periods(TUESDAY, 2, 5)], grades: [7, 8], feeCents: 600, feeNote: 'Material', categories: [creative], popularity: 1.3 },
  { key: 'tue-theatre', title: 'Theaterwerkstatt', description: 'Improvisieren und eine kurze Szene einstudieren.', location: 'Festsaal', sessions: [periods(TUESDAY, 2, 5)], grades: [7, 8], categories: [culture], popularity: 0.9 },
  { key: 'tue-bouldering', title: 'Bouldern', description: 'Bouldern in der Halle, für alle Niveaus.', location: 'Kletterhalle', sessions: [periods(TUESDAY, 2, 5)], grades: [7, 8], feeCents: 1000, feeNote: 'Eintritt', min: 6, cancellable: true, categories: [sport], popularity: 1.3, companions: 1 },
  { key: 'tue-world-kitchen', title: 'Küche der Welt', description: 'Gerichte aus fünf Ländern kochen und gemeinsam essen.', location: 'Lehrküche', sessions: [periods(TUESDAY, 2, 5)], grades: [7, 8], feeCents: 500, feeNote: 'Lebensmittel', min: 8, cancellable: true, categories: [community], popularity: 1.2 },
  { key: 'tue-debating', title: 'Debattierclub', description: 'Argumentieren, zuhören, überzeugen: Debatten nach festen Regeln.', location: 'Klassenraum 5A', sessions: [periods(TUESDAY, 1, 5)], grades: UPPER, categories: [community], popularity: 0.8 },
  { key: 'tue-photography', title: 'Fotografie', description: 'Licht, Bildaufbau und Bearbeitung, mit eigener Kamera oder Handy.', location: 'Medienraum', sessions: [periods(TUESDAY, 1, 5)], grades: UPPER, categories: [creative], popularity: 1.3 },
  { key: 'tue-city-rally', title: 'Stadtrallye', description: 'In Teams durch die Stadt: Aufgaben, Rätsel und Geschichte.', location: 'Treffpunkt Haupteingang', sessions: [periods(TUESDAY, 1, 5)], grades: UPPER, feeCents: 250, feeNote: 'Fahrt', categories: [culture], popularity: 1.1, companions: 1 },
  { key: 'tue-chess', title: 'Schach', description: 'Eröffnungen, Taktik und ein Schnellschachturnier.', location: 'Klassenraum 5B', sessions: [periods(TUESDAY, 1, 5)], grades: UPPER, categories: [community], popularity: 0.7 },
  { key: 'tue-film', title: 'Filmwerkstatt', description: 'Drehbuch, Dreh und Schnitt eines Kurzfilms.', location: 'EDV-Saal 2', sessions: [periods(TUESDAY, 1, 5)], grades: UPPER, categories: [creative], popularity: 1.4 },
  // Wednesday: a concert for 1A with places for anyone of the lower school, a theatre visit for 6B with ten for 6A, workshops.
  { key: 'wed-concert', title: 'Konzertbesuch', description: 'Ein Jugendkonzert im Konzertsaal, mit Gespräch mit dem Orchester.', location: 'Treffpunkt Haupteingang', sessions: [periods(WEDNESDAY, 3, 5)], fixed: ['1A'], grades: LOWER, places: 98, feeCents: 800, feeNote: 'Eintritt', categories: [culture], companions: 2 },
  { key: 'wed-6b-theatre', title: 'Theaterbesuch', description: 'Eine Vormittagsvorstellung im Stadttheater, mit Führung hinter die Bühne.', location: 'Treffpunkt Haupteingang', sessions: [periods(WEDNESDAY, 2, 5)], fixed: ['6B'], classes: ['6A'], places: 10, feeCents: 1200, feeNote: 'Eintritt und Fahrt', categories: [culture], companions: 1 },
  { key: 'wed-robotics', title: 'LEGO-Robotik für Einsteiger', description: 'Einfache Roboter bauen und mit Blöcken programmieren.', location: 'Physiksaal', sessions: [periods(WEDNESDAY, 2, 3)], grades: LOWER, categories: [nature], popularity: 1.7 },
  { key: 'wed-fabric-print', title: 'Stoffdruck', description: 'Stempel schneiden und Stoffbeutel bedrucken.', location: 'Zeichensaal', sessions: [periods(WEDNESDAY, 2, 3)], grades: LOWER, categories: [creative], popularity: 1.1 },
  { key: 'wed-radio-play', title: 'Hörspiel-Werkstatt', description: 'Geräusche erfinden und ein kurzes Hörspiel aufnehmen.', location: 'Medienraum', sessions: [periods(WEDNESDAY, 2, 3)], grades: LOWER, categories: [creative] },
  { key: 'wed-lab', title: 'Experimente-Labor', description: 'Versuche mit Wasser, Luft und Strom zum Selbermachen.', location: 'Chemiesaal', sessions: [periods(WEDNESDAY, 2, 3)], grades: LOWER, categories: [nature], popularity: 1.2 },
  { key: 'wed-chess', title: 'Schach für Einsteiger', description: 'Die Regeln, erste Taktiken und viele kurze Partien.', location: 'Bibliothek', sessions: [periods(WEDNESDAY, 2, 3)], grades: LOWER, categories: [community], popularity: 0.7 },
  { key: 'wed-puzzle-room', title: 'Rätselraum', description: 'Ein Escape-Spiel im Schulhaus, in Teams zu fünft.', location: 'Klassenraum 2A', sessions: [periods(WEDNESDAY, 4, 5)], grades: LOWER, categories: [community], popularity: 1.8 },
  { key: 'wed-dance', title: 'Tanzworkshop', description: 'Hip-Hop-Schritte und eine gemeinsame Choreografie.', location: 'Turnsaal 1', sessions: [periods(WEDNESDAY, 4, 5)], grades: LOWER, categories: [sport] },
  { key: 'wed-comics', title: 'Comic zeichnen', description: 'Figuren entwerfen und eine eigene Comicseite gestalten.', location: 'Zeichensaal 2', sessions: [periods(WEDNESDAY, 4, 5)], grades: LOWER, categories: [creative], popularity: 1.2 },
  { key: 'wed-football', title: 'Fußball', description: 'Training und kleine Spiele auf dem Kunstrasen.', location: 'Fußballplatz', sessions: [periods(WEDNESDAY, 4, 5)], grades: LOWER, categories: [sport], popularity: 1.4 },
  { key: 'wed-yoga', title: 'Yoga und Entspannung', description: 'Übungen für Körper und Atem, ruhig und ohne Leistungsdruck.', location: 'Gymnastikraum', sessions: [periods(WEDNESDAY, 4, 5)], grades: LOWER, categories: [sport], popularity: 0.8 },
  { key: 'wed-canoe-tour', title: 'Kanutour', description: 'Eine Halbtagestour flussabwärts, mit Rücktransport.', location: 'Bootshaus', sessions: [periods(WEDNESDAY, 2, 5)], grades: UPPER, feeCents: 2000, feeNote: 'Leihboot und Transport', min: 6, cancellable: true, categories: [sport], popularity: 1.5, companions: 1 },
  { key: 'wed-volleyball', title: 'Volleyball', description: 'Technik und Spiel, am Ende ein Turnier.', location: 'Turnsaal 2', sessions: [periods(WEDNESDAY, 2, 5)], grades: UPPER, categories: [sport], popularity: 1.1 },
  { key: 'wed-print-advanced', title: 'Siebdruck für Fortgeschrittene', description: 'Mehrfarbige Motive auf Shirts und Plakaten.', location: 'Zeichensaal 3', sessions: [periods(WEDNESDAY, 2, 5)], grades: UPPER, feeCents: 600, feeNote: 'Material', categories: [creative] },
  { key: 'wed-game-design', title: 'Spieleentwicklung', description: 'Ein eigenes Brettspiel entwerfen, bauen und testen.', location: 'Werkraum', sessions: [periods(WEDNESDAY, 2, 5)], grades: UPPER, categories: [creative], popularity: 1.1 },
  // The 7th classes' only day to choose, deliberately short of the target (though not of places), so the marker shows.
  { key: 'wed-beach-volleyball', title: 'Beachvolleyball', description: 'Spielen im Sand, mit Turnier.', location: 'Beachplatz', sessions: [periods(WEDNESDAY, 2, 5)], grades: [11], categories: [sport], popularity: 1.4 },
  { key: 'wed-rhetoric', title: 'Rhetorik', description: 'Frei sprechen und präsentieren, mit Rückmeldung per Video.', location: 'Klassenraum 7A', sessions: [periods(WEDNESDAY, 2, 5)], grades: [11], categories: [community], popularity: 0.9 },
  { key: 'wed-study-paths', title: 'Studien- und Berufswege', description: 'Gespräche mit Studierenden und Berufstätigen über ihren Weg.', location: 'Aula', sessions: [periods(WEDNESDAY, 2, 5)], grades: [11], categories: [careers], popularity: 0.8 },
  { key: 'wed-photo-walk', title: 'Fotowalk', description: 'Mit der Kamera durch die Stadt: Architektur, Menschen, Licht.', location: 'Treffpunkt Haupteingang', sessions: [periods(WEDNESDAY, 2, 5)], grades: [11], categories: [creative], popularity: 1.2 },
]

/** The grade-day the catalogue leaves short of the target on purpose: grade 11 on Wednesday, offered the need and two. */
export const SHORT_GRADE_DAY = { grade: 11, date: WEDNESDAY, beyondNeed: 2 } as const

export function scenario(seed = SCENARIO_SEED): Scenario {
  const rng = random(seed)
  const people = peopleOf(rng.fork('people'))
  const classes = CLASSES.map(([name, grade, size]) => classOf(people, name, grade, size, rng.fork(`group:${name}`)))
  const leavers = LEAVERS.map(([name, grade, size]) => classOf(people, name, grade, size, rng.fork(`group:${name}`)))
  const teachers = teachersOf(people, classes.length, TEACHER_COUNT)
  // Bernd teaches 5A; the other class teachers are drawn from the generated teachers.
  const generated = teachers.filter((t) => ![ANNA.oid, BERND.oid, CARLA.oid].includes(t.oid))
  const draw = rng.fork('class-teachers').shuffled(generated)
  let next = 0
  for (const c of classes) c.classTeacher = c.name === '5A' ? BERND.oid : (draw[next++] as ScenarioTeacher).oid
  const organizer = (draw[next] as ScenarioTeacher).oid
  availabilityOf(teachers, classes, rng.fork('availability'))
  const items = itemsOf(classes, teachers, organizer, rng.fork('items'))
  const choices = choicesOf(classes, rng.fork('choices'))
  return {
    seed,
    schoolYear: SCHOOL_YEAR,
    projectDays: PROJECT_DAYS,
    campaign: {
      name: 'Projekttage 2034',
      opensAt: STORY.opens,
      closesAt: STORY.closes,
      lateUntil: STORY.lateUntil,
      swapFrom: STORY.swapFrom,
      swapUntil: STORY.swapUntil,
      wishesPerGroup: 3,
      dailyMinimum: { 5: 100, 6: 100, 7: 100, 8: 100, 9: 200, 10: 200, 11: 200 },
      showTeachers: true,
      reminderDays: 2,
      placeHeadroomPercent: 20,
      rules: [
        { category: sport, grades: [5, 6, 7, 8, 9, 10, 11], classes: [], unit: 'items', minimum: 1 },
        { category: careers, grades: [7], classes: [], unit: 'minutes', minimum: 200 },
      ],
    },
    admin: ANNA.oid,
    organizer,
    organizerReason: 'Organisation der Projekttage',
    classes,
    leavers,
    teachers,
    teachersGroup: { groupId: TEACHERS_GROUP, groupName: 'Lehrkräfte' },
    categories: Object.values(CATEGORIES),
    items,
    choices,
    preferences: preferencesOf(classes, items, rng.fork('taste')),
  }
}

/** Draws people with full names nobody else in the school bears, and addresses that differ in more than case. */
function peopleOf(rng: Random) {
  const names = new Set<string>()
  const addresses = new Set<string>([ANNA, BERND, CARLA, SARA, TIM].map((p) => p.email ?? ''))
  for (const persona of [ANNA, BERND, CARLA, SARA, TIM]) names.add(persona.name)
  const oids = rng.fork('oids')
  return {
    draw(firstNames: readonly string[]): ScenarioPerson {
      for (;;) {
        const givenName = rng.pick(firstNames)
        const familyName = rng.pick(FAMILY_NAMES)
        const name = `${givenName} ${familyName}`
        if (names.has(name)) continue
        names.add(name)
        const local = `${ascii(givenName)}.${ascii(familyName)}`
        let email = `${local}@${DOMAIN}`
        for (let n = 2; addresses.has(email); n++) email = `${local}${n}@${DOMAIN}`
        addresses.add(email)
        return { oid: uuid(oids), givenName, familyName, name, email }
      }
    },
  }
}

type People = ReturnType<typeof peopleOf>

/** A test person as the roster knows them: first and family name split, the address as the persona has it. */
export function personaOf(person: Person): ScenarioPerson {
  const [givenName = '', ...rest] = person.name.split(' ')
  return { oid: person.oid, givenName, familyName: rest.join(' '), name: person.name, email: person.email ?? '' }
}

/** An address's local part from a name: lower case, umlauts and ß spelt out, accents dropped. */
export function ascii(name: string): string {
  return name.toLowerCase().replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]/g, '')
}

function classOf(people: People, name: string, grade: number, size: number, rng: Random): ScenarioClass {
  // Sara and Tim are in 5A, with 24 others.
  const students: ScenarioPerson[] = name === '5A' ? [personaOf(SARA), personaOf(TIM)] : []
  while (students.length < size) students.push(people.draw(STUDENT_FIRST_NAMES))
  const groupId = name === '5A' ? CLASS_5A_GROUP : uuid(rng)
  return { name, grade, groupId, groupName: `Klasse ${name}`, students, classTeacher: null }
}

function teachersOf(people: People, _classes: number, count: number): ScenarioTeacher[] {
  const teachers: ScenarioTeacher[] = [ANNA, BERND, CARLA].map((p) => ({ ...personaOf(p), availability: {}, availabilitySetAt: null }))
  while (teachers.length < count) teachers.push({ ...people.draw(TEACHER_FIRST_NAMES), availability: {}, availabilitySetAt: null })
  return teachers
}

/** About 15% of the teachers unavailable on a day and a few available only if needed; never a class teacher on their class's outing, never a test person. */
function availabilityOf(teachers: ScenarioTeacher[], classes: readonly ScenarioClass[], rng: Random): void {
  const needed = new Map<string, Set<string>>()
  for (const spec of CATALOGUE) {
    for (const className of spec.fixed ?? []) {
      const teacher = classes.find((c) => c.name === className)?.classTeacher
      if (!teacher) continue
      for (const s of spec.sessions) needed.set(teacher, (needed.get(teacher) ?? new Set()).add(s.date))
    }
  }
  const personas = new Set([ANNA.oid, BERND.oid, CARLA.oid])
  for (const teacher of teachers) {
    if (personas.has(teacher.oid)) continue
    for (const day of PROJECT_DAYS) {
      if (needed.get(teacher.oid)?.has(day)) continue
      const roll = rng.next()
      if (roll < 0.15) teacher.availability[day] = 'unavailable'
      else if (roll < 0.19) teacher.availability[day] = 'if_needed'
    }
    if (Object.keys(teacher.availability).length > 0) teacher.availabilitySetAt = momentBetween(rng, '2033-11-07', '2033-11-18', 9, 18)
  }
}

function itemsOf(classes: readonly ScenarioClass[], teachers: readonly ScenarioTeacher[], organizer: string, rng: Random): ScenarioItem[] {
  const busy = new Map<string, Set<string>>()
  const load = new Map<string, number>()
  const free = (oid: string, dates: readonly string[]) => {
    const teacher = teachers.find((t) => t.oid === oid)
    return dates.every((d) => teacher?.availability[d] === undefined && !busy.get(oid)?.has(d))
  }
  const take = (oid: string, dates: readonly string[]) => {
    for (const d of dates) busy.set(oid, (busy.get(oid) ?? new Set()).add(d))
    load.set(oid, (load.get(oid) ?? 0) + 1)
  }
  // The test people lead nothing of the school's: the journeys give them activities of their own on these days.
  const cast = new Set([ANNA.oid, BERND.oid, CARLA.oid])
  const pool = rng.fork('teachers').shuffled(teachers.filter((t) => !cast.has(t.oid)).map((t) => t.oid))
  const drawTeacher = (dates: readonly string[]) => {
    // The least busy teacher free on every date, in an order of chance among equals.
    const candidate = pool.filter((oid) => free(oid, dates)).sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0]
    if (!candidate) throw new Error(`no teacher free on ${dates.join(', ')}`)
    take(candidate, dates)
    return candidate
  }
  const datesOf = (spec: ItemSpec) => [...new Set(spec.sessions.map((s) => s.date))]
  const leadsOf = (spec: ItemSpec) => [...new Set((spec.fixed ?? []).map((className) => classes.find((c) => c.name === className)?.classTeacher).filter((oid): oid is string => oid !== null && oid !== undefined))]
  // Class activities first: their class teachers lead them (as their proposals come first); then the rest in catalogue order.
  const ordered = [...CATALOGUE.filter((s) => s.fixed), ...CATALOGUE.filter((s) => !s.fixed)]
  // Every class teacher's days are spoken for before any companion is drawn: drawn earlier, a companion could be
  // the lead of a class activity later in the order on the same day (seed 20331113 did that).
  for (const spec of ordered) for (const lead of leadsOf(spec)) take(lead, datesOf(spec))
  const items = new Map<string, ScenarioItem>()
  for (const spec of ordered) {
    const dates = datesOf(spec)
    const teachersOf = leadsOf(spec)
    if (teachersOf.length === 0) teachersOf.push(drawTeacher(dates))
    for (let i = 0; i < (spec.companions ?? 0); i++) teachersOf.push(drawTeacher(dates))
    const proposedAt = spec.fixed
      ? momentBetween(rng, '2033-11-07', '2033-11-11', 9, 18)
      : momentBetween(rng, '2033-11-14', '2033-12-15', 9, 18)
    items.set(spec.key, {
      key: spec.key,
      title: spec.title,
      description: spec.description,
      location: spec.location,
      feeCents: spec.feeCents ?? 0,
      feeNote: spec.feeNote ?? '',
      places: spec.places ?? Math.max(spec.min ?? 0, 8),
      minParticipants: spec.min ?? 0,
      cancellableBelowMin: spec.cancellable ?? false,
      fixedClasses: spec.fixed ?? [],
      eligibleGrades: spec.grades ?? [],
      eligibleClasses: spec.classes ?? [],
      teachers: teachersOf,
      sessions: spec.sessions,
      categories: spec.categories,
      proposedAt,
      approvedAt: momentBetween(rng, '2034-01-09', '2034-02-17', 9, 16),
      popularity: spec.popularity ?? 1,
    })
  }
  void organizer
  const ordered2 = CATALOGUE.map((spec) => items.get(spec.key) as ScenarioItem)
  drawPlaces(classes, ordered2)
  return ordered2
}

/** The demand as the app computes it, per day and grade, for the scenario's classes and items. */
export function scenarioDemand(classes: readonly ScenarioClass[], items: readonly ScenarioItem[]): DayDemand[] {
  const sizes: ClassSize[] = classes.map((c) => ({ className: c.name, grade: c.grade, students: c.students.length }))
  const offered: OfferedItem[] = items.map((item) => ({
    fixedClasses: item.fixedClasses,
    eligibleGrades: item.eligibleGrades,
    eligibleClasses: item.eligibleClasses,
    places: item.places,
    dates: [...new Set(item.sessions.map((s) => s.date))],
  }))
  return demandByDay(PROJECT_DAYS, sizes, offered)
}

/** The places a grade should be offered on a day: the 20% target, except the one grade-day left short on purpose. */
export function targetOf(grade: number, date: string, needing: number): number {
  if (grade === SHORT_GRADE_DAY.grade && date === SHORT_GRADE_DAY.date) return needing + SHORT_GRADE_DAY.beyondNeed
  return placeTarget(needing, 20)
}

/**
 * Places for every item whose spec leaves them open: raised step by step,
 * always on the eligible item furthest below its weight, until the demand
 * arithmetic offers every grade-day its target.
 */
function drawPlaces(classes: readonly ScenarioClass[], items: ScenarioItem[]): void {
  const open = new Set(CATALOGUE.filter((s) => s.places === undefined).map((s) => s.key))
  const weight = new Map(CATALOGUE.map((s) => [s.key, s.weight ?? 1]))
  for (let round = 0; round < 100_000; round++) {
    const short = scenarioDemand(classes, items).flatMap((day) => day.grades.map((g) => ({ date: day.date, ...g })))
      .find((g) => g.offered < targetOf(g.grade, g.date, g.needing))
    if (!short) return
    const gradeClasses = classes.filter((c) => c.grade === short.grade).map((c) => c.name)
    const candidates = items.filter((item) => open.has(item.key) && item.sessions.some((s) => s.date === short.date)
      && gradeClasses.some((c) => !item.fixedClasses.includes(c) && (item.eligibleGrades.length === 0 || item.eligibleGrades.includes(short.grade))
        && (item.eligibleClasses.length === 0 || item.eligibleClasses.includes(c))))
    const item = candidates.sort((a, b) => a.places / (weight.get(a.key) ?? 1) - b.places / (weight.get(b.key) ?? 1) || a.key.localeCompare(b.key, 'en'))[0]
    if (!item) throw new Error(`no item to raise for grade ${short.grade} on ${short.date}`)
    item.places += Math.max(1, Math.ceil((targetOf(short.grade, short.date, short.needing) - short.offered) / 4))
  }
  throw new Error('places did not settle')
}

/** 85% save in window 1, 8% in the grace week, 5% save an incomplete list, 2% never save; Sara and Tim on time. */
function choicesOf(classes: readonly ScenarioClass[], rng: Random): ScenarioChoice[] {
  const students = classes.flatMap((c) => c.students.map((s) => ({ oid: s.oid, className: c.name })))
  const order = rng.shuffled(students.filter((s) => s.oid !== SARA.oid && s.oid !== TIM.oid))
  const counts = { late: Math.round(students.length * 0.08), incomplete: Math.round(students.length * 0.05), never: Math.round(students.length * 0.02) }
  const plans = new Map<string, ChoicePlan>()
  let at = 0
  for (const [plan, n] of [['late', counts.late], ['incomplete', counts.incomplete], ['never', counts.never]] as const) {
    for (let i = 0; i < n; i++) plans.set((order[at++] as { oid: string }).oid, plan)
  }
  return students.map((s) => {
    const plan = plans.get(s.oid) ?? 'first'
    const saveAt = plan === 'never' ? null : plan === 'late' ? graceMoment(rng) : windowMoment(rng)
    return { oid: s.oid, className: s.className, plan, saveAt }
  })
}

/** A moment in window 1: many on the first day, few midweek, a rush on the last evening. */
function windowMoment(rng: Random): string {
  const days = ['2034-03-06', '2034-03-07', '2034-03-08', '2034-03-09', '2034-03-10', '2034-03-11', '2034-03-12']
  const day = days[rng.weighted([30, 18, 12, 10, 8, 7, 15])] as string
  const from = day === days[0] ? 8 : 7
  const to = day === days.at(-1) ? 19 : 21
  return moment(day, from + rng.below(to - from + 1), rng.below(60))
}

/** A moment in the grace week, after window 1 closed. */
function graceMoment(rng: Random): string {
  const days = ['2034-03-13', '2034-03-14', '2034-03-15', '2034-03-16', '2034-03-17', '2034-03-18', '2034-03-19']
  const day = days[rng.weighted([30, 20, 12, 10, 8, 6, 14])] as string
  const to = day === days.at(-1) ? 19 : 21
  return moment(day, 7 + rng.below(to - 7 + 1), rng.below(60))
}

/** A weekday moment between two dates, inclusive, in working hours. */
function momentBetween(rng: Random, fromDate: string, toDate: string, fromHour: number, toHour: number): string {
  const days: string[] = []
  for (let ms = Date.parse(`${fromDate}T12:00:00Z`); ms <= Date.parse(`${toDate}T12:00:00Z`); ms += 86_400_000) {
    const d = new Date(ms)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d.toISOString().slice(0, 10))
  }
  return moment(rng.pick(days), fromHour + rng.below(toHour - fromHour), rng.below(60))
}

/** A local time in Vienna before the clocks change on 26 March 2034. */
function moment(day: string, hour: number, minute: number): string {
  if (day > '2034-03-25') throw new Error(`${day} is after the change to summer time`)
  return `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+01:00`
}

/**
 * How much each student wants each item: its popularity, times what the
 * class makes of it (wishes cluster within a class), times the student's
 * own taste; both factors log-normal.
 */
function preferencesOf(classes: readonly ScenarioClass[], items: readonly ScenarioItem[], rng: Random): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const c of classes) {
    const classTaste = rng.fork(`class:${c.name}`)
    const affinity = new Map(items.map((item) => [item.key, Math.exp(0.5 * gaussian(classTaste))]))
    for (const student of c.students) {
      const own = rng.fork(`student:${student.oid}`)
      out[student.oid] = Object.fromEntries(items.map((item) => [item.key, round(item.popularity * (affinity.get(item.key) ?? 1) * Math.exp(0.6 * gaussian(own)))]))
    }
  }
  return out
}

function gaussian(rng: Random): number {
  const u = 1 - rng.next()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next())
}

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6
}

/** Every student of the scenario's classes, with their class. */
export function studentsOf(s: Scenario): { person: ScenarioPerson, className: string, grade: number }[] {
  return s.classes.flatMap((c) => c.students.map((person) => ({ person, className: c.name, grade: c.grade })))
}
