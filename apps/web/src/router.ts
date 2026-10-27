// The app's pages by URL (history mode, which the API serves by sending
// index.html for every page path). Pages have German paths. All of it
// under the app's base path (lib/base.ts), which the router adds and takes
// off, so route paths here and in the pages never carry it.

import { createRouter, createWebHistory } from 'vue-router'
import { BASE_PATH } from './lib/base.ts'
import Account from './pages/Account.vue'
import SignIn from './pages/SignIn.vue'
import Start from './pages/Start.vue'

export const router = createRouter({
  history: createWebHistory(`${BASE_PATH}/`),
  routes: [
    { path: '/', component: Start },
    { path: '/anmelden', component: SignIn },
    { path: '/konto', component: Account },
  ],
})
