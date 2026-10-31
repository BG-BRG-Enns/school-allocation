<script setup lang="ts">
// The administration's start: what a school administrator maintains, and
// the school's language, which applies once the page loads again.

import { LOCALES, type Locale } from '@school-allocation/messages'
import { onMounted, ref } from 'vue'
import { loadLanguage, saveLanguage } from '../lib/admin-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { t } from '../lib/i18n.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { isSchoolAdmin } from '../lib/session.ts'

usePageTitle(() => t.common.page.admin)
const locale = ref<Locale | null>(null)
const language = useFeedback()

onMounted(() => language.run(async () => {
  locale.value = (await loadLanguage()).locale
}))

async function onSaveLanguage(): Promise<void> {
  const chosen = locale.value
  if (chosen === null) return
  const ok = await language.run(async () => {
    await saveLanguage(chosen)
  }, t.admin.language.saved)
  // The words are the page's from its start: it loads again to take the new ones.
  if (ok) window.location.reload()
}
</script>

<template>
  <h1>{{ t.common.page.admin }}</h1>
  <p
    v-if="!isSchoolAdmin"
    role="alert"
  >
    {{ t.admin.adminsOnly }}
  </p>
  <template v-else>
    <ul class="cards">
      <li>
        <RouterLink to="/verwaltung/stammdaten">
          {{ t.common.page.roster }}
        </RouterLink>
        <p>{{ t.admin.roster }}</p>
      </li>
      <li>
        <RouterLink to="/verwaltung/personen">
          {{ t.common.page.people }}
        </RouterLink>
        <p>{{ t.admin.people }}</p>
      </li>
      <li>
        <RouterLink to="/verwaltung/klassen">
          {{ t.common.page.classTeachers }}
        </RouterLink>
        <p>{{ t.admin.classTeachers }}</p>
      </li>
      <li>
        <RouterLink to="/verwaltung/zeiten">
          {{ t.common.page.periods }}
        </RouterLink>
        <p>{{ t.admin.periods }}</p>
      </li>
      <li>
        <RouterLink to="/verwaltung/kategorien">
          {{ t.common.page.categories }}
        </RouterLink>
        <p>{{ t.admin.categories }}</p>
      </li>
      <li>
        <RouterLink to="/verwaltung/mailvorlagen">
          {{ t.common.page.mailTemplates }}
        </RouterLink>
        <p>{{ t.admin.mailTemplates }}</p>
      </li>
      <li>
        <RouterLink to="/verwaltung/aufbewahrung">
          {{ t.common.page.retention }}
        </RouterLink>
        <p>{{ t.admin.retention }}</p>
      </li>
    </ul>
    <section>
      <h2>{{ t.admin.language.title }}</h2>
      <p>{{ t.admin.language.intro }}</p>
      <p
        v-if="language.error.value"
        role="alert"
        class="alert"
      >
        {{ language.error.value }}
      </p>
      <p
        v-if="language.notice.value"
        role="status"
        class="notice"
      >
        {{ language.notice.value }}
      </p>
      <form
        v-if="locale !== null"
        @submit.prevent="onSaveLanguage"
      >
        <p class="field">
          <label for="school-locale">{{ t.admin.language.label }}</label>
          <select
            id="school-locale"
            v-model="locale"
          >
            <option
              v-for="code in LOCALES"
              :key="code"
              :value="code"
            >
              {{ t.labels.locale[code] }}
            </option>
          </select>
        </p>
        <p class="actions">
          <button
            type="submit"
            :disabled="language.busy.value"
          >
            {{ t.common.save }}
          </button>
        </p>
      </form>
    </section>
  </template>
</template>
