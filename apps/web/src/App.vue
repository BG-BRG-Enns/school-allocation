<script setup lang="ts">
// The shell: the app's name, who is signed in, and "Abmelden", around the
// page. Every page but the sign-in page is for signed-in people: it is
// shown once someone is signed in, so no page asks the API without a
// session, and without one the shell sends the browser to the sign-in
// page, which brings it back here afterwards. The sign-in page itself is
// shown once the session is known.

import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { signInUrl } from './lib/api-rules.ts'
import { withBase } from './lib/base.ts'
import { loadSession, session, signOut } from './lib/session.ts'

const route = useRoute()
const router = useRouter()
const shown = computed(() => session.value !== undefined && (session.value !== null || route.path === '/anmelden'))
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
        SchulWahl
      </RouterLink>
      <nav
        v-if="session"
        aria-label="Konto"
      >
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
          Abmelden
        </button>
      </nav>
    </header>
    <main class="shell-main">
      <p
        v-if="loadFailed"
        role="alert"
      >
        Der Server antwortet gerade nicht.
        <button
          type="button"
          class="ghost"
          @click="load"
        >
          Erneut versuchen
        </button>
      </p>
      <RouterView v-else-if="shown" />
    </main>
  </div>
</template>
