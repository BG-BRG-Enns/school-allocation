<script setup lang="ts">
// The organization's overview of the teachers: per teacher and project day
// their availability, what they lead and what they accompany, or free; who
// leads nothing on any day; a workbook of it. An organizer changes anyone's
// availability here until the registration is archived; the read-only role
// reads along.

import { AVAILABILITY_STATUSES } from '@school-allocation/school-core'
import { computed, onMounted, ref } from 'vue'
import { withBase } from '../lib/base.ts'
import { loadCampaign, loadPlanning, planningExportPath, setAvailabilityFor, type AvailabilityStatus, type CampaignView, type PlanningResponse } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { AVAILABILITY_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string }>()

usePageTitle(() => t.common.page.planning)
const view = ref<CampaignView | null>(null)
const planning = ref<PlanningResponse | null>(null)
const loading = useFeedback()
const saving = useFeedback()

onMounted(() => loading.run(async () => {
  const [campaign, overview] = await Promise.all([loadCampaign(props.id), loadPlanning(props.id)])
  view.value = campaign
  planning.value = overview
}))

/** Whether the caller changes availability here: an organizer, until the archive. */
const editable = computed(() => (view.value?.may.organize ?? false) && (planning.value?.editable ?? false))

type Day = PlanningResponse['teachers'][number]['days'][number]

/** The activities as "3. Klettern, 7. Wien". */
function named(items: Day['leads']): string {
  return items.map((item) => (item.number === null ? item.title : `${item.number}. ${item.title}`)).join(', ')
}

/** What a teacher does on a day, in a line: leads, accompanies, or free. */
function doing(day: Day): string {
  const parts = [
    ...(day.leads.length > 0 ? [t.planning.leads(named(day.leads))] : []),
    ...(day.accompanies.length > 0 ? [t.planning.accompanies(named(day.accompanies))] : []),
  ]
  return parts.length > 0 ? parts.join('; ') : t.planning.free
}

/** The teachers who lead nothing on any of the days. */
const leadingNothing = computed(() => (planning.value?.teachers ?? []).filter((teacher) => teacher.days.every((day) => day.leads.length === 0)).map((teacher) => teacher.displayName))

async function onChange(personId: string, date: string, status: AvailabilityStatus): Promise<void> {
  await saving.run(async () => {
    planning.value = await setAvailabilityFor(props.id, personId, date, status)
  }, t.planning.saved)
}
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← {{ t.common.backToCampaign }}
    </RouterLink>
  </p>
  <h1>{{ t.common.page.planning }}</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <template v-if="view && planning">
    <p class="muted">
      {{ view.campaign.name }}
    </p>
    <p>{{ t.planning.intro }}</p>
    <p
      v-if="!planning.editable"
      class="notice"
    >
      {{ t.planning.readOnly }}
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
    <p class="actions">
      <a
        class="button ghost-link"
        :href="withBase(planningExportPath(props.id))"
      >{{ t.planning.export }}</a>
    </p>
    <p v-if="planning.teachers.length === 0">
      {{ t.planning.none }}
    </p>
    <template v-else>
      <p>{{ leadingNothing.length > 0 ? t.planning.leadsNothing(leadingNothing.join(', ')) : t.planning.everyoneLeads }}</p>
      <table class="table">
        <thead>
          <tr>
            <th scope="col">
              {{ t.common.field.name }}
            </th>
            <th
              v-for="date in planning.days"
              :key="date"
              scope="col"
            >
              {{ formatDay(date) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="teacher in planning.teachers"
            :key="teacher.personId"
          >
            <th scope="row">
              {{ teacher.displayName }}
            </th>
            <td
              v-for="day in teacher.days"
              :key="day.date"
              :class="{ short: day.status !== 'available' }"
            >
              <select
                v-if="editable"
                :value="day.status"
                :aria-label="t.planning.statusOf(teacher.displayName, formatDay(day.date))"
                :disabled="saving.busy.value"
                @change="onChange(teacher.personId, day.date, ($event.target as HTMLSelectElement).value as AvailabilityStatus)"
              >
                <option
                  v-for="status in AVAILABILITY_STATUSES"
                  :key="status"
                  :value="status"
                >
                  {{ AVAILABILITY_LABELS[status] }}
                </option>
              </select>
              <span v-else>{{ AVAILABILITY_LABELS[day.status] }}</span>
              <br>
              {{ doing(day) }}
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </template>
</template>
