// The scenario in English, for the journeys' English leg and the English
// handbook's pictures: the activities' texts, their places and fee notes,
// the categories and the registration's name. The people, the classes and
// the groups keep their names, as the journeys' sample texts do
// (e2e/support/sample.ts).

import { CATEGORIES, type Scenario } from './school.ts'

const CATEGORY_NAMES: Record<string, string> = {
  [CATEGORIES.sport]: 'Sport',
  [CATEGORIES.careers]: 'Careers',
  [CATEGORIES.creative]: 'Creative',
  [CATEGORIES.nature]: 'Nature and technology',
  [CATEGORIES.culture]: 'Culture',
  [CATEGORIES.community]: 'Community',
}

const ITEMS: Record<string, readonly [title: string, description: string]> = {
  'mon-athletics': ['Athletics stations', 'Sprint, long jump and ball throw at stations, with a certificate.'],
  'mon-ball-games': ['Small ball games', 'Ball games for everyone who would rather play in small teams.'],
  'mon-obstacle': ['Agility course', 'Balance, clamber, crawl: a course through the whole gym.'],
  'mon-relays': ['Relay games', 'Relays with balls, hoops and ropes, against the clock and each other.'],
  'mon-frisbee': ['Frisbee and Ultimate', 'Learn to throw and catch, then play a game of Ultimate.'],
  'mon-dance': ['Dancing', 'Simple choreographies to current music, no experience needed.'],
  'mon-orienteering': ['Orienteering', 'With map and compass around the school, in pairs.'],
  'mon-swimming': ['Swimming', 'Games and relays at the indoor pool; bring your swimming things.'],
  'mon-dodgeball': ['Dodgeball tournament', 'Class teams play for the challenge cup.'],
  'mon-football': ['Football tournament', 'Mixed teams, short matches, a tournament over the morning.'],
  'mon-skipping': ['Skipping', 'From single skips to double Dutch.'],
  'mon-yoga': ['Yoga', 'Calm exercises to warm up for the day.'],
  'mon-table-tennis': ['Table tennis', 'Round the table and short matches.'],
  'mon-badminton': ['Badminton', 'Strokes and doubles.'],
  'mon-slackline': ['Slackline', 'Balancing on the line, secured and with a helping hand.'],
  'mon-archery': ['Archery', 'Aim safely and hit the target, with hired bows.'],
  'mon-bouldering': ['Bouldering wall', 'Bouldering at jumping height, with mats.'],
  'mon-juggling': ['Juggling', 'Scarves, balls, plates: juggling for beginners.'],
  'mon-canoe': ['Canoeing', 'Paddling on calm water, with an introduction; you need to be able to swim.'],
  'mon-climbing': ['High ropes course', 'Learn to belay and balance over rope bridges and beams.'],
  'mon-escape': ['Escape room', 'Solve puzzles against the clock, in teams of five.'],
  'mon-podcast': ['Podcast studio', 'Plan, record and edit an episode of your own.'],
  'mon-first-aid': ['First aid', 'The course with a certificate: emergency call, recovery position, resuscitation.'],
  'mon-helpers': ['Sports day helpers', 'Run stations, take times, write certificates: the lower school’s sports day needs you.'],
  'mon-tue-7th-trip': ['Cycling and hiking days of the 7th classes', 'Two days by bike and on foot, with a night at a youth hostel.'],
  'tue-1a-zoo': ['Trip to the wildlife park', 'Feeding time, a guided tour and a picnic.'],
  'tue-1b-hike': ['Hiking day', 'A round over the hills, with a snack at the viewpoint.'],
  'tue-1c-museum': ['Open-air museum', 'How people used to live, cook and work.'],
  'tue-1d-cave': ['Cave walk', 'A guided tour through a dripstone cave.'],
  'tue-1e-farm': ['A day on the farm', 'Look after the animals, bake bread, drive a tractor.'],
  'tue-cooking': ['Cooking and baking', 'A menu from the school kitchen, from the shopping to the washing-up.'],
  'tue-upcycling': ['Upcycling workshop', 'New from old: bags, lamps and games from things people threw away.'],
  'tue-board-games': ['Board game tournament', 'From classics to new games, with a tournament at the end.'],
  'tue-circus': ['Circus workshop', 'Juggling, balancing, acrobatics: a small show at the end.'],
  'tue-forest': ['Into the woods', 'Tracking animals, exploring a stream and building a shelter from branches.'],
  'tue-applications': ['Job application training', 'CV, cover letter and a practised interview.'],
  'tue-crafts': ['Visiting craft businesses', 'In the workshops: what apprentices learn there.'],
  'tue-job-stations': ['Careers course', 'Try twenty jobs at stations.'],
  'tue-future': ['Future workshop', 'Find your strengths and make plans for after compulsory school.'],
  'tue-robotics': ['LEGO robotics', 'Build and program robots until they master the course.'],
  'tue-screen-print': ['Screen printing', 'Print your own designs on T-shirts and bags.'],
  'tue-theatre': ['Theatre workshop', 'Improvise and rehearse a short scene.'],
  'tue-bouldering': ['Bouldering', 'Bouldering at the centre, for every level.'],
  'tue-world-kitchen': ['World kitchen', 'Cook dishes from five countries and eat together.'],
  'tue-debating': ['Debating club', 'Argue, listen, persuade: debates by fixed rules.'],
  'tue-photography': ['Photography', 'Light, composition and editing, with your own camera or phone.'],
  'tue-city-rally': ['Town rally', 'In teams through the town: tasks, puzzles and history.'],
  'tue-chess': ['Chess club', 'Openings, tactics and a rapid chess tournament.'],
  'tue-film': ['Film workshop', 'Script, shooting and editing of a short film.'],
  'wed-concert': ['Concert visit', 'A youth concert at the concert hall, with a talk with the orchestra.'],
  'wed-6b-theatre': ['Theatre visit', 'A morning performance at the town theatre, with a tour behind the stage.'],
  'wed-robotics': ['LEGO robotics for beginners', 'Build simple robots and program them with blocks.'],
  'wed-fabric-print': ['Fabric printing', 'Cut stamps and print cloth bags.'],
  'wed-radio-play': ['Radio play workshop', 'Invent sounds and record a short radio play.'],
  'wed-lab': ['Experiment lab', 'Hands-on experiments with water, air and electricity.'],
  'wed-chess': ['Chess for beginners', 'The rules, first tactics and many short games.'],
  'wed-puzzle-room': ['Puzzle room', 'An escape game in the school building, in teams of five.'],
  'wed-dance': ['Dance workshop', 'Hip-hop steps and a choreography together.'],
  'wed-comics': ['Drawing comics', 'Design characters and a comic page of your own.'],
  'wed-football': ['Football', 'Training and small games on the artificial pitch.'],
  'wed-yoga': ['Yoga and relaxation', 'Exercises for body and breath, calm and without pressure.'],
  'wed-canoe-tour': ['Canoe tour', 'A half-day tour downstream, with transport back.'],
  'wed-volleyball': ['Volleyball', 'Technique and play, a tournament at the end.'],
  'wed-print-advanced': ['Screen printing, advanced', 'Designs in several colours on shirts and posters.'],
  'wed-game-design': ['Game design', 'Design, build and test a board game of your own.'],
  'wed-beach-volleyball': ['Beach volleyball', 'Playing in the sand, with a tournament.'],
  'wed-rhetoric': ['Public speaking', 'Speak freely and present, with feedback on video.'],
  'wed-study-paths': ['Studies and careers', 'Talks with students and working people about their paths.'],
  'wed-photo-walk': ['Photo walk', 'With the camera through the town: architecture, people, light.'],
}

const LOCATIONS: Record<string, string> = {
  'Sportplatz': 'Sports ground',
  'Turnsaal 1': 'Gym 1',
  'Turnsaal 2': 'Gym 2',
  'Turnsaal 3': 'Gym 3',
  'Turnsaal-Foyer': 'Gym foyer',
  'Schulwiese': 'School meadow',
  'Treffpunkt Haupteingang': 'Meet at the main entrance',
  'Hallenbad': 'Indoor pool',
  'Sporthalle': 'Sports hall',
  'Fußballplatz': 'Football pitch',
  'Schulhof': 'Playground',
  'Gymnastikraum': 'Exercise room',
  'Pausenhalle': 'Break hall',
  'Schulgarten': 'School garden',
  'Sportplatz Süd': 'South sports ground',
  'Kletterraum': 'Bouldering room',
  'Aula': 'Assembly hall',
  'Bootshaus': 'Boathouse',
  'Hochseilgarten': 'High ropes course',
  'Medienraum': 'Media room',
  'Biologiesaal': 'Biology room',
  'Schulküche': 'School kitchen',
  'Werkraum': 'Workshop',
  'Bibliothek': 'Library',
  'EDV-Saal 1': 'Computer room 1',
  'EDV-Saal 2': 'Computer room 2',
  'Klassenraum 2A': 'Classroom 2A',
  'Klassenraum 3A': 'Classroom 3A',
  'Klassenraum 5A': 'Classroom 5A',
  'Klassenraum 5B': 'Classroom 5B',
  'Klassenraum 7A': 'Classroom 7A',
  'Physiksaal': 'Physics room',
  'Chemiesaal': 'Chemistry room',
  'Zeichensaal': 'Art room',
  'Zeichensaal 2': 'Art room 2',
  'Zeichensaal 3': 'Art room 3',
  'Festsaal': 'Main hall',
  'Kletterhalle': 'Bouldering centre',
  'Lehrküche': 'Teaching kitchen',
  'Beachplatz': 'Beach court',
}

const FEE_NOTES: Record<string, string> = {
  'Eintritt': 'Entry',
  'Leihboot und Einschulung': 'Hired boat and introduction',
  'Eintritt und Leihausrüstung': 'Entry and hired equipment',
  'Fahrt, Übernachtung und Verpflegung': 'Travel, night and meals',
  'Fahrt und Eintritt': 'Travel and entry',
  'Fahrt und Führung': 'Travel and guided tour',
  'Fahrt': 'Travel',
  'Lebensmittel': 'Food',
  'Material': 'Materials',
  'Eintritt und Fahrt': 'Entry and travel',
  'Leihboot und Transport': 'Hired boat and transport',
}

function english(table: Record<string, string>, german: string): string {
  if (german === '') return german
  const text = table[german]
  if (text === undefined) throw new Error(`no English for ${german}`)
  return text
}

/** The scenario with its texts in English; everything else as it was drawn. */
export function inEnglish(s: Scenario): Scenario {
  return {
    ...s,
    organizerReason: 'Organises the project days',
    campaign: { ...s.campaign, name: 'Project Days 2034', rules: s.campaign.rules.map((r) => ({ ...r, category: english(CATEGORY_NAMES, r.category) })) },
    categories: s.categories.map((name) => english(CATEGORY_NAMES, name)),
    items: s.items.map((item) => {
      const texts = ITEMS[item.key]
      if (!texts) throw new Error(`no English for ${item.key}`)
      return {
        ...item,
        title: texts[0],
        description: texts[1],
        location: english(LOCATIONS, item.location),
        feeNote: english(FEE_NOTES, item.feeNote),
        categories: item.categories.map((name) => english(CATEGORY_NAMES, name)),
      }
    }),
  }
}
