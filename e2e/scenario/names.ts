// The names of the scenario's school, drawn once and reviewed once; the
// generator only picks from these lists (school.ts). First names look
// German, by generation: the students' born 2016 to 2023, the teachers'
// 1965 to 1995; some carry an umlaut or an accent, so sorting, the CSV and
// the workbooks meet them. The family names are made up so nobody bears
// one: an onset German does not use, an x or q where German has none, and
// an Austrian ending, some with ß. No name says whether a person is a girl
// or a boy to the app; the app has no such field. The test people
// (apps/api/test/helpers/personas.ts) keep their first names and bear
// family names from this list.

export const STUDENT_FIRST_NAMES = [
  'Amelie', 'Amira', 'Annika', 'Antonia', 'Charlotte', 'Chloé', 'Clara', 'Elena', 'Elisa', 'Ella', 'Emilia', 'Emma',
  'Eva', 'Felicitas', 'Greta', 'Hannah', 'Helena', 'Ida', 'Isabella', 'Jana', 'Johanna', 'Jördis', 'Julia', 'Katharina',
  'Laura', 'Lea', 'Lena', 'Leonie', 'Lina', 'Luisa', 'Magdalena', 'Malin', 'Marie', 'Marlene', 'Mia', 'Mila', 'Nora',
  'Paula', 'Pia', 'Rosa', 'Selina', 'Sophia', 'Theresa', 'Valentina', 'Valerie', 'Zoë',
  'Alexander', 'Anton', 'Ben', 'Benedikt', 'Björn', 'Constantin', 'David', 'Elias', 'Emil', 'Fabian', 'Felix', 'Finn',
  'Florian', 'Gabriel', 'Jakob', 'Johannes', 'Jonas', 'Julian', 'Konstantin', 'Leo', 'Leon', 'Lorenz', 'Luca', 'Lukas',
  'Matthias', 'Maximilian', 'Moritz', 'Niklas', 'Noah', 'Oskar', 'Paul', 'Raphael', 'René', 'Samuel', 'Sebastian',
  'Simon', 'Sören', 'Theo', 'Tobias', 'Valentin', 'Vincent',
] as const

export const TEACHER_FIRST_NAMES = [
  'Andrea', 'Barbara', 'Bärbel', 'Birgit', 'Brigitte', 'Christine', 'Claudia', 'Daniela', 'Doris', 'Elisabeth', 'Eva',
  'Gabriele', 'Gudrun', 'Julia', 'Karin', 'Katrin', 'Martina', 'Michaela', 'Monika', 'Nicole', 'Petra', 'Renate',
  'Sabine', 'Sandra', 'Silvia', 'Susanne', 'Tanja', 'Theresia', 'Ulrike', 'Verena',
  'Andreas', 'Bernhard', 'Christian', 'Dietmar', 'Erich', 'Ernst', 'Franz', 'Gernot', 'Gerhard', 'Günter', 'Hannes',
  'Harald', 'Helmut', 'Herbert', 'Josef', 'Jörg', 'Jürgen', 'Karl', 'Klaus', 'Manfred', 'Markus', 'Martin', 'Michael',
  'Peter', 'Reinhard', 'Robert', 'Rudolf', 'Stefan', 'Thomas', 'Walter', 'Werner', 'Wolfgang',
] as const

export const FAMILY_NAMES = [
  'Dlauxlwimmer', 'Dläxmbauer', 'Dleixtwieser', 'Dliqlhaider', 'Dliqsreiter', 'Dloqlstöger', 'Dlöxtweiß',
  'Dlüqlhaider', 'Dschnaqwimmer', 'Dschnauxgruber', 'Dschnauxtschachner', 'Dschnaxberger', 'Dschnaxlhaider',
  'Dschnäxnmayr', 'Dschnexwieser', 'Dschnuxnhofer', 'Dschnüxnreiter', 'Fnaqlbauer', 'Fnaqsgruber', 'Fnauqhuber',
  'Fnauqlberger', 'Fnauqsböck', 'Fnauxnhölzl', 'Fneixtlechner', 'Fneqlberger', 'Fnexhölzl', 'Fniqsberger',
  'Fnoxnhölzl', 'Fnöxnmoser', 'Fnuqlaigner', 'Fnuxmgrieß', 'Gmauxlberger', 'Gmexnlehner', 'Gmexnweiß',
  'Gmixnböck', 'Gmoxmhuber', 'Gmüxnwallner', 'Gmuxwieser', 'Gnauxlmoser', 'Gnäxlwallner', 'Gneiqmoser',
  'Gnexnwallner', 'Gnöxlbrunner', 'Gnöxwieser', 'Gnuqsmoser', 'Gnuxmleitner', 'Gwraqwallner', 'Gwrauqlwallner',
  'Gwreixlgießer', 'Gwreixngrieß', 'Gwrexnböck', 'Gwrextwimmer', 'Gwrixmayr', 'Gwroqlmoser', 'Gwröxnlehner',
  'Gwruxmleitner', 'Knäqlhuber', 'Knauxmgruber', 'Knaxmhölzl', 'Knäxmlechner', 'Knaxmweiß', 'Knoqlechner',
  'Knoxbrunner', 'Knoxnschachner', 'Knöxtaigner', 'Knuxlgießer', 'Kwäqbauer', 'Kwaqlechner', 'Kwauxlegger',
  'Kwauxnlechner', 'Kwaxstöger', 'Kwäxtgruber', 'Kweixmhaider', 'Kweqegger', 'Kwixmoser', 'Kwoqlegger',
  'Kwöxthaider', 'Mschwauqinger', 'Mschwaxmhuber', 'Mschwixnschachner', 'Mschwixtlehner', 'Mschwoxtstöger',
  'Mschwuqmayr', 'Mschwuxlhofer', 'Pflauxtegger', 'Pfleixmoser', 'Pfleqlstrauß', 'Pfliqberger', 'Pfliqinger',
  'Pfliqlbrunner', 'Pfliqsegger', 'Pflixtmaier', 'Pfloqmaier', 'Pfluqlstöger', 'Pfluxngrieß', 'Pfnauqlwallner',
  'Pfnaxlbauer', 'Pfnäxmberger', 'Pfnaxthuber', 'Pfnäxthuber', 'Pfnexmwimmer', 'Pfnixnweiß', 'Pfnöxlhofer',
  'Pfnuxmoser', 'Pfwaqwieser', 'Pfwauxnreiter', 'Pfwaxstöger', 'Pfwäxtstöger', 'Pfweiqmayr', 'Pfwixnaigner',
  'Pfwoxtwieser', 'Pfwüxnweiß', 'Präxlbauer', 'Praxmgrieß', 'Priqlaigner', 'Proxlberger', 'Proxtstrauß',
  'Pröxwimmer', 'Prüqsmoser', 'Prüqswallner', 'Prüxhölzl', 'Schweiqsweiß', 'Schwoqsbrunner',
  'Tschnauqswallner', 'Tschnauxmaier', 'Tschnäxlwallner', 'Tschnexlechner', 'Tschnixmegger', 'Tschnoxnhölzl',
  'Tschnüqsgießer', 'Tschwäxlehner', 'Tschwixlwallner', 'Tschwöxlweiß', 'Tschwoxmgrieß', 'Tschwuqhofer',
  'Twixlreiter', 'Twöxstrauß', 'Twuqslechner', 'Wräqseder', 'Wräqstrauß', 'Wrauxmbauer', 'Wraxbrunner',
  'Wreiqlwimmer', 'Wrexthaider', 'Wröxmhuber', 'Wrüxlhölzl', 'Wrüxtmaier', 'Zlaqstöger', 'Zlexthölzl',
  'Zlöxmpichler', 'Zlöxstrauß', 'Zluqweiß', 'Zlüxlwimmer', 'Zluxmstrauß', 'Zluxnhofer', 'Zwäxnhofer',
  'Zwäxteder', 'Zweqlaigner', 'Zwexmhofer', 'Zwüxnpichler',
] as const
