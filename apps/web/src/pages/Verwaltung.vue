<script setup lang="ts">
// The administration's start: what a school administrator maintains.

import { t } from '../lib/i18n.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { isSchoolAdmin } from '../lib/session.ts'

usePageTitle(() => t.common.page.admin)
</script>

<template>
  <h1>{{ t.common.page.admin }}</h1>
  <p
    v-if="!isSchoolAdmin"
    role="alert"
  >
    {{ t.admin.adminsOnly }}
  </p>
  <ul
    v-else
    class="cards"
  >
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
</template>
