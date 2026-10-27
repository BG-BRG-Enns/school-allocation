// The app's pages by URL (history mode, which the API serves by sending
// index.html for every page path). Pages have German paths. All of it
// under the app's base path (lib/base.ts), which the router adds and takes
// off, so route paths here and in the pages never carry it. The
// administration's pages are for school administrators; the API refuses
// everyone else, and the pages say so.

import { createRouter, createWebHistory } from 'vue-router'
import { BASE_PATH } from './lib/base.ts'
import Account from './pages/Account.vue'
import Import from './pages/Import.vue'
import Personen from './pages/Personen.vue'
import SignIn from './pages/SignIn.vue'
import Stammdaten from './pages/Stammdaten.vue'
import Start from './pages/Start.vue'
import Verwaltung from './pages/Verwaltung.vue'

export const router = createRouter({
  history: createWebHistory(`${BASE_PATH}/`),
  routes: [
    { path: '/', component: Start },
    { path: '/anmelden', component: SignIn },
    { path: '/konto', component: Account },
    { path: '/verwaltung', component: Verwaltung },
    { path: '/verwaltung/stammdaten', component: Stammdaten },
    { path: '/verwaltung/stammdaten/import/:id', component: Import, props: true },
    { path: '/verwaltung/personen', component: Personen },
  ],
})
