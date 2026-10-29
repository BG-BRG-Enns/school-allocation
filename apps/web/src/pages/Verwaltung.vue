<script setup lang="ts">
// The administration's start: what a school administrator maintains.

import { usePageTitle } from '../lib/page-title.ts'
import { isSchoolAdmin } from '../lib/session.ts'

usePageTitle(() => 'Verwaltung')
</script>

<template>
  <h1>Verwaltung</h1>
  <p
    v-if="!isSchoolAdmin"
    role="alert"
  >
    Die Verwaltung ist der Administration der Schule vorbehalten.
  </p>
  <ul
    v-else
    class="cards"
  >
    <li>
      <RouterLink to="/verwaltung/stammdaten">
        Stammdaten
      </RouterLink>
      <p>Die Personenliste der Schule: aus den Entra-Gruppen oder aus einer CSV-Datei, mit Klassen und Schulstufen.</p>
    </li>
    <li>
      <RouterLink to="/verwaltung/personen">
        Konten und Rollen
      </RouterLink>
      <p>Wer sich angemeldet hat, wem das Konto zugeordnet ist, wer eine Wahl organisiert, wer gesperrt ist.</p>
    </li>
    <li>
      <RouterLink to="/verwaltung/klassen">
        Klassenvorstände
      </RouterLink>
      <p>Wer welche Klasse führt und ihren Stand in einer Wahl sieht.</p>
    </li>
    <li>
      <RouterLink to="/verwaltung/zeiten">
        Stundenraster
      </RouterLink>
      <p>Die Unterrichtseinheiten der Schule, in denen Lehrkräfte ihre Termine angeben.</p>
    </li>
  </ul>
</template>
