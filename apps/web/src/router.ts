// The app's pages by URL (history mode, which the API serves by sending
// index.html for every page path). Pages have German paths. All of it
// under the app's base path (lib/base.ts), which the router adds and takes
// off, so route paths here and in the pages never carry it. The
// administration's pages are for school administrators; the API refuses
// everyone else, and the pages say so.

import { createRouter, createWebHistory } from 'vue-router'
import { BASE_PATH } from './lib/base.ts'
import Account from './pages/Account.vue'
import Aktivitaet from './pages/Aktivitaet.vue'
import Ergebnis from './pages/Ergebnis.vue'
import Import from './pages/Import.vue'
import Katalog from './pages/Katalog.vue'
import Klasse from './pages/Klasse.vue'
import Klassen from './pages/Klassen.vue'
import Lehrkraefte from './pages/Lehrkraefte.vue'
import Mailvorlagen from './pages/Mailvorlagen.vue'
import Aufbewahrung from './pages/Aufbewahrung.vue'
import Personen from './pages/Personen.vue'
import SignIn from './pages/SignIn.vue'
import Stammdaten from './pages/Stammdaten.vue'
import Start from './pages/Start.vue'
import Verfuegbarkeit from './pages/Verfuegbarkeit.vue'
import Verwaltung from './pages/Verwaltung.vue'
import Wahl from './pages/Wahl.vue'
import Wahlen from './pages/Wahlen.vue'
import Wuensche from './pages/Wuensche.vue'
import Zeiten from './pages/Zeiten.vue'
import Zuteilung from './pages/Zuteilung.vue'

export const router = createRouter({
  history: createWebHistory(`${BASE_PATH}/`),
  routes: [
    { path: '/', component: Start },
    { path: '/anmelden', component: SignIn },
    { path: '/konto', component: Account },
    { path: '/wahlen', component: Wahlen },
    { path: '/wahlen/:id', component: Wahl, props: true },
    { path: '/wahlen/:id/katalog', component: Katalog, props: true },
    { path: '/wahlen/:id/aktivitaet/neu', component: Aktivitaet, props: true },
    { path: '/wahlen/:id/aktivitaet/:itemId', component: Aktivitaet, props: true },
    { path: '/wahlen/:id/klasse/:className', component: Klasse, props: true },
    { path: '/wahlen/:id/wuensche', component: Wuensche, props: true },
    { path: '/wahlen/:id/wuensche/:personId', component: Wuensche, props: true },
    { path: '/wahlen/:id/zuteilung', component: Zuteilung, props: true },
    { path: '/wahlen/:id/ergebnis', component: Ergebnis, props: true },
    { path: '/wahlen/:id/lehrkraefte', component: Lehrkraefte, props: true },
    { path: '/verfuegbarkeit', component: Verfuegbarkeit },
    { path: '/verwaltung', component: Verwaltung },
    { path: '/verwaltung/stammdaten', component: Stammdaten },
    { path: '/verwaltung/stammdaten/import/:id', component: Import, props: true },
    { path: '/verwaltung/personen', component: Personen },
    { path: '/verwaltung/klassen', component: Klassen },
    { path: '/verwaltung/zeiten', component: Zeiten },
    { path: '/verwaltung/mailvorlagen', component: Mailvorlagen },
    { path: '/verwaltung/aufbewahrung', component: Aufbewahrung },
  ],
})
