<script setup lang="ts">
// The shell: the app's name, the help link to the handbook of the
// person's role, who is signed in, and "Ausloggen", around the page. Every page but the sign-in page is for signed-in people: it is
// shown once someone is signed in, so no page asks the API without a
// session, and without one the shell sends the browser to the sign-in
// page, which brings it back here afterwards. The sign-in page itself is
// shown once the session is known.

import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { signInUrl } from './lib/api-rules.ts'
import { withBase } from './lib/base.ts'
import { handbookLink } from './lib/handbook.ts'
import { LOCALE, t } from './lib/i18n.ts'
import { isSchoolAdmin, loadSession, session, signOut } from './lib/session.ts'

const route = useRoute()
const router = useRouter()
const shown = computed(() => session.value !== undefined && (session.value !== null || route.path === '/anmelden'))
/** The handbook of the signed-in person's role, in a tab of its own; none for a student. */
const help = computed(() => session.value ? handbookLink(session.value, LOCALE) : undefined)
/** The first request did not get an answer (the connection, or a server error): say so, and offer to ask again. */
const loadFailed = ref(false)

function load(): void {
  loadFailed.value = false
  loadSession().catch(() => {
    loadFailed.value = true
  })
}

watch([session, () => route.fullPath], ([who, path]) => {
  if (who === undefined) {
    if (!loadFailed.value) load()
  } else if (who === null && route.path !== '/anmelden') {
    void router.replace(signInUrl(withBase(path)))
  }
}, { immediate: true })

function onSignOut(): void {
  void signOut()
}
</script>

<template>
  <div class="shell">
    <header class="shell-header">
      <RouterLink
        to="/"
        class="brand"
      >
        {{ t.common.appName }}
      </RouterLink>
      <nav
        v-if="session"
        :aria-label="t.shell.navigation"
      >
        <RouterLink to="/wahlen">
          {{ t.common.page.campaigns }}
        </RouterLink>
        <RouterLink
          v-if="isSchoolAdmin"
          to="/verwaltung"
        >
          {{ t.common.page.admin }}
        </RouterLink>
        <a
          v-if="help"
          :href="help"
          target="_blank"
          rel="noopener"
        >
          {{ t.shell.help }}
        </a>
        <RouterLink
          to="/konto"
          class="who"
        >
          {{ session.displayName }}
        </RouterLink>
        <button
          type="button"
          class="ghost"
          @click="onSignOut"
        >
          {{ t.shell.signOut }}
        </button>
      </nav>
    </header>
    <main class="shell-main">
      <p
        v-if="loadFailed"
        role="alert"
      >
        {{ t.shell.serverDown }}
        <button
          type="button"
          class="ghost"
          @click="load"
        >
          {{ t.shell.retry }}
        </button>
      </p>
      <RouterView v-else-if="shown" />
    </main>
  </div>
</template>
