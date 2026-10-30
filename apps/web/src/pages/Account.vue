<script setup lang="ts">
// Who the app takes the signed-in person for: the roster person behind the
// account, with class and grade, and the roles they hold.

import { computed } from 'vue'
import { withBase } from '../lib/base.ts'
import { KIND_LABELS, ROLE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => 'Mein Konto')

const personText = computed(() => {
  const person = session.value?.person
  if (!person) return null
  if (person.kind === null) return 'In der aktuellen Personenliste der Schule nicht (mehr) enthalten.'
  const kind = KIND_LABELS[person.kind] ?? person.kind
  if (person.kind === 'student' && person.className !== null) {
    return `${kind}, Klasse ${person.className}${person.grade === null ? '' : ` (${person.grade}. Schulstufe)`}`
  }
  return kind
})
</script>

<template>
  <h1>Mein Konto</h1>
  <dl v-if="session">
    <dt>Name</dt>
    <dd>{{ session.displayName }}</dd>
    <dt>An der Schule</dt>
    <dd v-if="personText">
      {{ personText }}
    </dd>
    <dd v-else>
      Noch keiner Person der Schule zugeordnet. Wenn Sie an einer Wahl teilnehmen sollen, wenden Sie sich bitte an die Verwaltung.
    </dd>
    <dt>Rollen</dt>
    <dd v-if="session.roles.length === 0">
      Keine besonderen Rollen.
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
  <!-- The licences of the packages the web build bundles, which it writes next to the app (third-party-notices/README.md). -->
  <p>
    SchulWahl ist freie Software unter der MIT-Lizenz. Die Lizenzen der Programmbibliotheken, die diese Seiten enthalten:
    <a :href="withBase('/third-party-licenses.txt')">third-party-licenses.txt</a>
  </p>
</template>
