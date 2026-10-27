<script setup lang="ts">
// Who the app takes the signed-in person for, and which roles they hold.

import { ROLE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => 'Mein Konto')
</script>

<template>
  <h1>Mein Konto</h1>
  <dl v-if="session">
    <dt>Name</dt>
    <dd>{{ session.displayName }}</dd>
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
</template>
