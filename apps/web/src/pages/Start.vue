<script setup lang="ts">
// The start page. Until campaigns exist it says who is signed in; the
// campaigns a person takes part in or organizes will be listed here.

import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => 'Startseite')
</script>

<template>
  <h1>Startseite</h1>
  <p v-if="session">
    Angemeldet als <strong>{{ session.displayName }}</strong>.
  </p>
  <p>Es gibt noch keine Wahl, an der Sie teilnehmen oder die Sie betreuen.</p>
</template>
