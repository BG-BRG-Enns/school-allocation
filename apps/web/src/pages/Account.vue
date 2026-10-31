<script setup lang="ts">
// Who the app takes the signed-in person for: the roster person behind the
// account, with class and grade, and the roles they hold.

import { computed } from 'vue'
import { withBase } from '../lib/base.ts'
import { t } from '../lib/i18n.ts'
import { KIND_LABELS, ROLE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => t.common.page.account)

/** The licences of the packages the web build bundles, which it writes next to the app (third-party-notices/README.md). */
const LICENCES = 'third-party-licenses.txt'

const personText = computed(() => {
  const person = session.value?.person
  if (!person) return null
  if (person.kind === null) return t.account.notInRoster
  const kind = KIND_LABELS[person.kind] ?? person.kind
  if (person.kind === 'student' && person.className !== null) {
    return t.account.student(kind, person.className, person.grade)
  }
  return kind
})
</script>

<template>
  <h1>{{ t.common.page.account }}</h1>
  <dl v-if="session">
    <dt>{{ t.common.field.name }}</dt>
    <dd>{{ session.displayName }}</dd>
    <dt>{{ t.account.atSchool }}</dt>
    <dd v-if="personText">
      {{ personText }}
    </dd>
    <dd v-else>
      {{ t.account.unbound }}
    </dd>
    <dt>{{ t.account.roles }}</dt>
    <dd v-if="session.roles.length === 0">
      {{ t.account.noRoles }}
    </dd>
    <dd v-else>
      <ul>
        <li
          v-for="role in session.roles"
          :key="role"
        >
          {{ ROLE_LABELS[role] ?? role }}
        </li>
      </ul>
    </dd>
  </dl>
  <p>
    {{ t.account.licences }}
    <a :href="withBase(`/${LICENCES}`)">{{ LICENCES }}</a>
  </p>
</template>
