<script setup lang="ts">
// A teacher's own availability: the project days of the registrations
// collecting activities, each available, unavailable or available only if
// needed, saved as soon as it is chosen. No reason is asked. Once a
// registration stops collecting, its days leave the list and the
// organization changes them (Lehrkraefte.vue).

import { AVAILABILITY_STATUSES } from '@school-allocation/school-core'
import { computed, onMounted, ref } from 'vue'
import { loadMyAvailability, setMyAvailability, type AvailabilityStatus } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { AVAILABILITY_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => t.common.page.availability)
const days = ref<{ date: string, status: AvailabilityStatus, campaigns: { id: string, name: string }[] }[] | null>(null)
const loading = useFeedback()
const saving = useFeedback()
const teacher = computed(() => session.value?.person?.kind === 'teacher')

onMounted(() => {
  if (!teacher.value) return
  void loading.run(async () => {
    days.value = (await loadMyAvailability()).days
  })
})

async function onChange(date: string, status: AvailabilityStatus): Promise<void> {
  await saving.run(async () => {
    days.value = (await setMyAvailability(date, status)).days
  }, t.availability.saved)
}
</script>

<template>
  <h1>{{ t.common.page.availability }}</h1>
  <p
    v-if="!teacher"
    role="alert"
  >
    {{ t.availability.teachersOnly }}
  </p>
  <template v-else>
    <p>{{ t.availability.intro }}</p>
    <p
      v-if="loading.error.value"
      role="alert"
      class="alert"
    >
      {{ loading.error.value }}
    </p>
    <p
      v-if="saving.error.value"
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
    <template v-if="days">
      <p v-if="days.length === 0">
        {{ t.availability.none }}
      </p>
      <table
        v-else
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              {{ t.common.field.day }}
            </th>
            <th scope="col">
              {{ t.common.page.campaigns }}
            </th>
            <th scope="col">
              {{ t.workbook.column.availability }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="day in days"
            :key="day.date"
          >
            <th scope="row">
              {{ formatDay(day.date) }}
            </th>
            <td>{{ day.campaigns.map((c) => c.name).join(', ') }}</td>
            <td>
              <select
                :value="day.status"
                :aria-label="t.availability.statusOn(formatDay(day.date))"
                :disabled="saving.busy.value"
                @change="onChange(day.date, ($event.target as HTMLSelectElement).value as AvailabilityStatus)"
              >
                <option
                  v-for="status in AVAILABILITY_STATUSES"
                  :key="status"
                  :value="status"
                >
                  {{ AVAILABILITY_LABELS[status] }}
                </option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </template>
</template>
