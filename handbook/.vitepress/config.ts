// The handbooks' site: one handbook each for the administration, the
// organisation and the teachers, in German at the root and in English
// under /en/, built by VitePress from the Markdown beside this folder and
// the pictures the journeys cut (npm run handbook:shots, into
// public/bilder). It is published to GitHub Pages from release tags only
// (.github/workflows/handbook.yml), so it describes what schools run, and
// a dead link fails the build. The operator's guide is deploy/README.md,
// linked from the navigation.

import { defineConfig, type DefaultTheme } from 'vitepress'
import { HANDBOOKS } from './pages.ts'

const BASE = '/school-allocation/'
const REPOSITORY = 'https://github.com/BG-BRG-Enns/school-allocation'

/** The sidebar of every handbook in a language, under `prefix` ('' for German, '/en' for English). */
function sidebar(prefix: string, language: 'de' | 'en'): DefaultTheme.SidebarMulti {
  return Object.fromEntries(HANDBOOKS.map((handbook) => [`${prefix}/${handbook.folder}/`, [{
    text: handbook[language],
    items: handbook.pages.map(([file, de, en]) => ({ text: language === 'de' ? de : en, link: `${prefix}/${handbook.folder}/${file}` })),
  }]]))
}

function nav(prefix: string, language: 'de' | 'en', operations: string): DefaultTheme.NavItem[] {
  return [
    ...HANDBOOKS.map((handbook) => ({ text: handbook[language], link: `${prefix}/${handbook.folder}/`, activeMatch: `^${prefix}/${handbook.folder}/` })),
    { text: operations, link: `${REPOSITORY}/blob/main/deploy/README.md` },
  ]
}

export default defineConfig({
  base: BASE,
  title: 'SchulWahl',
  cleanUrls: true,
  // The licences of every package bundled into the site's files (VitePress's
  // theme and Vue among them), next to the pages; the footer links it, as
  // the app's account page links its own (third-party-notices/README.md).
  vite: { build: { license: { fileName: 'third-party-licenses.txt' } } },
  locales: {
    root: {
      label: 'Deutsch',
      lang: 'de-AT',
      description: 'Die Handbücher zu SchulWahl: für die Verwaltung, die Organisation und die Lehrkräfte.',
      themeConfig: {
        nav: nav('', 'de', 'Betrieb'),
        sidebar: sidebar('', 'de'),
        outline: { level: [2, 3], label: 'Auf dieser Seite' },
        docFooter: { prev: 'Zurück', next: 'Weiter' },
        footer: { message: `SchulWahl ist freie Software unter der MIT-Lizenz. <a href="${BASE}third-party-licenses.txt">Lizenzen der Programmbibliotheken dieser Seiten</a>` },
        darkModeSwitchLabel: 'Darstellung',
        lightModeSwitchTitle: 'Zur hellen Darstellung wechseln',
        darkModeSwitchTitle: 'Zur dunklen Darstellung wechseln',
        sidebarMenuLabel: 'Menü',
        returnToTopLabel: 'Nach oben',
        langMenuLabel: 'Sprache wechseln',
        navMenuLabel: 'Hauptnavigation',
        mobileMenuLabel: 'Menü',
        extraMenuLabel: 'Weitere Links',
        skipToContentLabel: 'Zum Inhalt springen',
        notFound: {
          title: 'Seite nicht gefunden',
          quote: 'Diese Seite gibt es nicht (mehr). Die Suche oder die Startseite hilft weiter.',
          linkLabel: 'Zur Startseite',
          linkText: 'Zur Startseite',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en-GB',
      link: '/en/',
      description: 'The SchulWahl handbooks: for the administration, the organisation and teachers.',
      themeConfig: {
        nav: nav('/en', 'en', 'Operations'),
        sidebar: sidebar('/en', 'en'),
        outline: { level: [2, 3], label: 'On this page' },
        footer: { message: `SchulWahl is free software under the MIT licence. <a href="${BASE}third-party-licenses.txt">Licences of the libraries in these pages</a>` },
      },
    },
  },
  themeConfig: {
    socialLinks: [{ icon: 'github', link: REPOSITORY, ariaLabel: 'GitHub' }],
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: 'Suchen', buttonAriaLabel: 'Suchen' },
              modal: {
                displayDetails: 'Details anzeigen',
                resetButtonTitle: 'Suche zurücksetzen',
                backButtonTitle: 'Suche schließen',
                noResultsText: 'Nichts gefunden für',
                footer: {
                  selectText: 'öffnen',
                  selectKeyAriaLabel: 'Eingabetaste',
                  navigateText: 'auswählen',
                  navigateUpKeyAriaLabel: 'Pfeil nach oben',
                  navigateDownKeyAriaLabel: 'Pfeil nach unten',
                  closeText: 'schließen',
                  closeKeyAriaLabel: 'Escape',
                },
              },
            },
          },
        },
      },
    },
  },
})
