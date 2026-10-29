<script setup lang="ts">
// The school's period grid (D-25): the lesson periods a teacher places a
// session in. Replaced as a whole; the rules (numbered without a gap, in
// order, each ending after it starts) are the server's, and a refusal
// names them here.

import { onMounted, ref } from 'vue'
import { loadPeriods, savePeriods, type Period } from '../lib/admin-api.ts'
import { ApiError } from '../lib/api-rules.ts'
import { useFeedback } from '../lib/feedback.ts'
import { PERIOD_PROBLEM_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { isSchoolAdmin } from '../lib/session.ts'

usePageTitle(() => 'Stundenraster')
const periods = ref<Period[]>([])
const loading = useFeedback()
const saving = useFeedback()
const problems = ref<string[]>([])

onMounted(() => loading.run(async () => {
  periods.value = (await loadPeriods()).periods
}))

function addPeriod(): void {
  const last = periods.value.at(-1)
  periods.value.push({ period: periods.value.length + 1, starts: last ? shifted(last.ends, 5) : '07:35', ends: last ? shifted(last.ends, 55) : '08:25' })
}

function removeLast(): void {
  periods.value.pop()
}

/** A clock time `minutes` later, on the same day at most. */
function shifted(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

async function onSave(): Promise<void> {
  problems.value = []
  await saving.run(async () => {
    try {
      periods.value = (await savePeriods(periods.value.map((p, index) => ({ period: index + 1, starts: p.starts, ends: p.ends })))).periods
    } catch (err) {
      if (err instanceof ApiError && err.code === 'period_grid_invalid') {
        const codes = Array.isArray(err.body.problems) ? err.body.problems as string[] : []
        problems.value = codes.map((code) => PERIOD_PROBLEM_LABELS[code] ?? code)
      }
      throw err
    }
  }, 'Stundenraster gespeichert.')
}
</script>

<template>
  <p>
    <RouterLink to="/verwaltung">
      ← Verwaltung
    </RouterLink>
  </p>
  <h1>Stundenraster</h1>
  <p
    v-if="!isSchoolAdmin"
    role="alert"
  >
    Das Stundenraster ändert die Administration der Schule.
  </p>
  <template v-else>
    <p>Die Unterrichtseinheiten der Schule, in denen Lehrkräfte ihre Termine angeben („ab der 2. Einheit, 2 Einheiten lang“). Termine mit anderen Zeiten, etwa Ausflüge, werden nach der Uhr eingegeben.</p>
    <p
      v-if="loading.error.value"
      role="alert"
      class="alert"
    >
      {{ loading.error.value }}
    </p>
    <form @submit.prevent="onSave">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">
              Einheit
            </th>
            <th scope="col">
              Beginn
            </th>
            <th scope="col">
              Ende
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(p, index) in periods"
            :key="index"
          >
            <td>{{ index + 1 }}. EH</td>
            <td>
              <input
                v-model="p.starts"
                :aria-label="`Beginn ${index + 1}. Einheit`"
                type="time"
                required
              >
            </td>
            <td>
              <input
                v-model="p.ends"
                :aria-label="`Ende ${index + 1}. Einheit`"
                type="time"
                required
              >
            </td>
          </tr>
        </tbody>
      </table>
      <p class="actions">
        <button
          type="button"
          class="ghost"
          :disabled="periods.length >= 20"
          @click="addPeriod"
        >
          Einheit anfügen
        </button>
        <button
          type="button"
          class="ghost"
          :disabled="periods.length <= 1"
          @click="removeLast"
        >
          Letzte entfernen
        </button>
        <button
          type="submit"
          :disabled="saving.busy.value"
        >
          Speichern
        </button>
      </p>
      <ul
        v-if="problems.length > 0"
        class="alert"
        role="alert"
      >
        <li
          v-for="problem in problems"
          :key="problem"
        >
          {{ problem }}
        </li>
      </ul>
      <p
        v-else-if="saving.error.value"
        role="alert"
        class="alert"
      >
        {{ saving.error.value }}
      </p>
      <p
        v-if="saving.notice.value"
        role="status"
        class="notice"
      >
        {{ saving.notice.value }}
      </p>
    </form>
  </template>
</template>
