<script setup lang="ts">
// The shell: the app's name, the help link to the handbook of the
// person's role, who is signed in, and "Ausloggen", around the page. Every page but the sign-in page is for signed-in people: it is
// shown once someone is signed in, so no page asks the API without a
// session, and without one the shell sends the browser to the sign-in
// page, which brings it back here afterwards. The sign-in page itself is
// shown once the session is known.
//
// Someone with a role who is a teacher too may lay the role down for this
// tab (lib/view-as.ts): the button in the navigation, and while the view
// lasts a bar under the header that says so and leads back. The page is
// taken away while the view changes and built anew afterwards, so
// everything on it is what the server answers in that view, and nothing
// can be typed into a page that is about to go.

import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { signInUrl } from './lib/api-rules.ts'
import { withBase } from './lib/base.ts'
import { handbookLink } from './lib/handbook.ts'
import { LOCALE, t } from './lib/i18n.ts'
import { isSchoolAdmin, loadSession, session, setView, signOut } from './lib/session.ts'
import { mayLeave, stayed } from './lib/unsaved.ts'
import { mayViewAsTeacher, viewAs, writeView, type View } from './lib/view-as.ts'

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
  } else if (who === null) {
    // Nobody is signed in: the view was the last person's, and whoever signs in next in this tab starts in their own.
    if (viewAs.value !== null) writeView(null)
    if (route.path !== '/anmelden') void router.replace(signInUrl(withBase(path)))
  }
}, { immediate: true })

/** Whether the view as a teacher is offered to the person signed in. */
const offersTeacherView = computed(() => mayViewAsTeacher(session.value, viewAs.value))
const viewFailed = ref(false)
/** A change of view is under way: the page is not shown, and the buttons wait, so a second click does not start another on top. */
const viewChanging = ref(false)

/** Into the view as a teacher, or back out of it. A page with unsaved changes asks first, as before any leaving; a change that failed leaves the tab as it was, and says so. */
async function onView(view: View): Promise<void> {
  if (viewChanging.value || !mayLeave()) return
  viewChanging.value = true
  viewFailed.value = false
  try {
    await setView(view)
  } catch {
    stayed()
    viewFailed.value = true
  } finally {
    viewChanging.value = false
  }
}

/** A page with unsaved changes asks first: the sign-out revokes the session before the browser navigates. A sign-out that failed leaves the person on the page, watched as before. */
function onSignOut(): void {
  if (!mayLeave()) return
  signOut().catch(stayed)
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
        <button
          v-if="offersTeacherView"
          type="button"
          class="ghost"
          :disabled="viewChanging"
          @click="onView('teacher')"
        >
          {{ t.viewAs.enter }}
        </button>
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
    <p
      v-if="session && viewAs === 'teacher'"
      class="view-bar no-print"
      role="status"
    >
      {{ t.viewAs.bar }}
      <button
        type="button"
        class="ghost small"
        :disabled="viewChanging"
        @click="onView(null)"
      >
        {{ t.viewAs.leave }}
      </button>
    </p>
    <p
      v-if="viewFailed"
      class="alert no-print"
      role="alert"
    >
      {{ t.viewAs.failed }}
    </p>
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
      <RouterView v-else-if="shown && !viewChanging" />
    </main>
  </div>
</template>
