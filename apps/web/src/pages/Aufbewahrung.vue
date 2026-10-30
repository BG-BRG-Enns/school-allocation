<script setup lang="ts">
// Retention (D-15): the school years with their records and when each may
// go; the administrator's purge of one, a year after its end, with a reason
// and the year typed again. Nothing is deleted automatically.

import { computed, onMounted, ref } from 'vue'
import { loadRetention, purgeSchoolYear, type RetentionYear } from '../lib/admin-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatWhenShort } from '../lib/format.ts'
import { CAMPAIGN_STATE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { isSchoolAdmin, session } from '../lib/session.ts'

usePageTitle(() => 'Aufbewahrung')
const years = ref<RetentionYear[]>([])
const loading = useFeedback()
const action = useFeedback()
const chosen = ref('')
const confirmYear = ref('')
const reason = ref('')
const removed = ref<{ relation: string, count: number }[] | null>(null)
/** Administrators and auditors read the overview; administrators purge. */
const mayRead = computed(() => isSchoolAdmin.value || (session.value?.roles.includes('read_only_auditor') ?? false))

const candidate = computed(() => years.value.find((y) => y.schoolYear === chosen.value))
const ready = computed(() => candidate.value !== undefined && candidate.value.reached && candidate.value.campaigns.every((c) => c.state === 'archived') && confirmYear.value.trim() === chosen.value && reason.value.trim() !== '')

async function load(): Promise<void> {
  if (!mayRead.value) return
  await loading.run(async () => {
    years.value = (await loadRetention()).years
  })
}
onMounted(load)

async function onPurge(): Promise<void> {
  if (!ready.value) return
  const ok = await action.run(async () => {
    removed.value = (await purgeSchoolYear(chosen.value, reason.value.trim())).removed
  }, 'Die Aufzeichnungen des Schuljahrs sind gelöscht.')
  if (ok) {
    chosen.value = ''
    confirmYear.value = ''
    reason.value = ''
    await load()
  }
}
</script>

<template>
  <p>
    <RouterLink to="/verwaltung">
      ← Zur Verwaltung
    </RouterLink>
  </p>
  <h1>Aufbewahrung</h1>
  <p
    v-if="!mayRead"
    role="alert"
  >
    Die Aufbewahrung ist der Administration der Schule vorbehalten; die Einsicht liest mit.
  </p>
  <template v-else>
    <p class="muted">
      Die Aufzeichnungen einer Projektwoche werden bis ein Jahr nach dem Ende ihres Schuljahrs aufbewahrt. Danach löscht die Administration sie hier, mit Begründung; von selbst wird nichts gelöscht. Vorher die Zuteilung und die Beitragsliste als Excel sichern, falls die Buchhaltung sie noch braucht: gelöscht ist gelöscht.
    </p>
    <p
      v-if="loading.error.value"
      role="alert"
      class="alert"
    >
      {{ loading.error.value }}
    </p>
    <p
      v-if="action.error.value"
      role="alert"
      class="alert"
    >
      {{ action.error.value }}
    </p>
    <p
      v-if="action.notice.value"
      role="status"
      class="notice"
    >
      {{ action.notice.value }}
    </p>
    <section>
      <h2>Schuljahre</h2>
      <p
        v-if="years.length === 0"
        class="muted"
      >
        Noch keine Aufzeichnungen.
      </p>
      <table v-else>
        <thead>
          <tr>
            <th>Schuljahr</th>
            <th>Wahlen</th>
            <th>Personenlisten</th>
            <th>Klassenvorstände</th>
            <th>Aufbewahrung bis</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="y in years"
            :key="y.schoolYear"
          >
            <td>{{ y.schoolYear }}</td>
            <td>
              <span
                v-if="y.campaigns.length === 0"
                class="muted"
              >–</span>
              <ul
                v-else
                class="plain"
              >
                <li
                  v-for="c in y.campaigns"
                  :key="c.id"
                >
                  {{ c.name }} <span class="badge">{{ CAMPAIGN_STATE_LABELS[c.state] ?? c.state }}</span>
                </li>
              </ul>
            </td>
            <td>{{ y.batches }}</td>
            <td>{{ y.classTeachers }}</td>
            <td>
              {{ formatWhenShort(y.retentionEndsAt) }}<span
                v-if="y.reached"
                class="badge"
              >abgelaufen</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="isSchoolAdmin">
      <h2>Schuljahr löschen</h2>
      <form
        aria-label="Schuljahr löschen"
        @submit.prevent="onPurge"
      >
        <p class="field">
          <label for="purge-year">Schuljahr</label>
          <select
            id="purge-year"
            v-model="chosen"
            required
          >
            <option value="">
              Bitte wählen
            </option>
            <option
              v-for="y in years"
              :key="y.schoolYear"
              :value="y.schoolYear"
              :disabled="!y.reached || y.campaigns.some((c) => c.state !== 'archived')"
            >
              {{ y.schoolYear }}{{ !y.reached ? ' – Aufbewahrung läuft noch' : y.campaigns.some((c) => c.state !== 'archived') ? ' – eine Wahl ist nicht abgeschlossen' : '' }}
            </option>
          </select>
        </p>
        <p class="field">
          <label for="purge-confirm">Zur Bestätigung das Schuljahr noch einmal</label>
          <input
            id="purge-confirm"
            v-model="confirmYear"
            type="text"
            placeholder="2026/27"
            required
          >
        </p>
        <p class="field">
          <label for="purge-reason">Begründung</label>
          <input
            id="purge-reason"
            v-model="reason"
            type="text"
            maxlength="500"
            required
          >
        </p>
        <p class="actions">
          <button
            type="submit"
            class="danger"
            :disabled="!ready || action.busy.value"
          >
            Aufzeichnungen löschen
          </button>
        </p>
      </form>
      <div v-if="removed">
        <h3>Gelöscht</h3>
        <ul class="plain">
          <li
            v-for="r in removed"
            :key="r.relation"
          >
            {{ r.relation }}: {{ r.count }}
          </li>
        </ul>
      </div>
    </section>
  </template>
</template>
