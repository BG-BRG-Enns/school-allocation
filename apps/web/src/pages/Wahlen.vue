<script setup lang="ts">
// The campaigns the person may see, and, for organizers, the form that
// sets a new one up: its name, school year, project days and classes.

import type { Frame, Period } from '@school-allocation/school-core'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ClassPicker from '../components/ClassPicker.vue'
import FrameSelect from '../components/FrameSelect.vue'
import { loadClasses, loadPeriods } from '../lib/admin-api.ts'
import { createCampaign, loadCampaigns, type Campaign } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, nextDay } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { CAMPAIGN_STATE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => t.common.page.campaigns)
const router = useRouter()
const campaigns = ref<Campaign[] | null>(null)
const loading = useFeedback()
const organizes = computed(() => (session.value?.roles ?? []).some((role) => role === 'campaign_organizer' || role === 'school_admin'))

const name = ref('')
const schoolYear = ref('')
const days = ref<string[]>([''])
/** The attendance frame per project day, beside `days` by index; none unless chosen. */
const frames = ref<(Frame | null)[]>([null])
/** The minimum length of an activity per project day in minutes, beside `days` by index; '' for none. */
const minimums = ref<string[]>([''])
const grid = ref<Period[]>([])
/** The classes of the class lists in force, for the picker; every one preselected. */
const classOptions = ref<{ className: string, grade: number }[]>([])
const classes = ref<string[]>([])
const creating = useFeedback()

onMounted(() => loading.run(async () => {
  // The form shows with the list, so the classes are there first: a registration created before they arrived would name none.
  const [list, roster, periods] = await Promise.all([loadCampaigns(), organizes.value ? loadClasses() : Promise.resolve(null), organizes.value ? loadPeriods() : Promise.resolve(null)])
  if (roster) {
    classOptions.value = roster.classes.map((c) => ({ className: c.className, grade: c.grade }))
    classes.value = classOptions.value.map((c) => c.className)
  }
  if (periods) grid.value = periods.periods
  campaigns.value = list.campaigns
}))

/** The next day proposed is the one after the last: a project week runs on, and a wrong month shows beside the date. */
function addDay(): void {
  days.value.push(nextDay(days.value.at(-1) ?? ''))
  frames.value.push(null)
  minimums.value.push('')
}

function removeDay(index: number): void {
  days.value.splice(index, 1)
  frames.value.splice(index, 1)
  minimums.value.splice(index, 1)
}

async function onCreate(): Promise<void> {
  let created: Campaign | undefined
  const ok = await creating.run(async () => {
    const frameByDay = Object.fromEntries(days.value.flatMap((day, index) => (day && frames.value[index] ? [[day, frames.value[index]]] : [])))
    const minimumByDay = Object.fromEntries(days.value.flatMap((day, index) => (day && String(minimums.value[index] ?? '').trim() !== '' ? [[day, Number(minimums.value[index])]] : [])))
    created = await createCampaign({ kind: 'project_week', name: name.value.trim(), schoolYear: schoolYear.value.trim(), projectDays: days.value.filter(Boolean), classes: classes.value, frames: frameByDay, activityMinimums: minimumByDay })
  })
  if (ok && created) await router.push(`/wahlen/${created.id}`)
}
</script>

<template>
  <h1>{{ t.common.page.campaigns }}</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <template v-if="campaigns">
    <p v-if="campaigns.length === 0">
      {{ t.campaigns.none }}
    </p>
    <table
      v-else
      class="table"
    >
      <thead>
        <tr>
          <th scope="col">
            {{ t.campaigns.campaign }}
          </th>
          <th scope="col">
            {{ t.common.field.schoolYear }}
          </th>
          <th scope="col">
            {{ t.campaign.projectDays }}
          </th>
          <th scope="col">
            {{ t.common.field.state }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="campaign in campaigns"
          :key="campaign.id"
        >
          <td>
            <RouterLink :to="`/wahlen/${campaign.id}`">
              {{ campaign.name }}
            </RouterLink>
          </td>
          <td>{{ campaign.schoolYear }}</td>
          <td>{{ campaign.projectDays.map(formatDay).join(', ') }}</td>
          <td><span class="badge">{{ CAMPAIGN_STATE_LABELS[campaign.state] ?? campaign.state }}</span></td>
        </tr>
      </tbody>
    </table>
  </template>

  <section v-if="organizes">
    <h2>{{ t.campaigns.new }}</h2>
    <form @submit.prevent="onCreate">
      <p class="field">
        <label for="campaign-name">{{ t.campaign.settings.name }}</label>
        <input
          id="campaign-name"
          v-model="name"
          required
          maxlength="200"
          :placeholder="t.campaigns.namePlaceholder"
        >
      </p>
      <p class="field">
        <label for="campaign-year">{{ t.common.field.schoolYear }}</label>
        <input
          id="campaign-year"
          v-model="schoolYear"
          required
          pattern="[0-9]{4}/[0-9]{2}"
          placeholder="2026/27"
          size="8"
        >
      </p>
      <fieldset class="field">
        <legend>{{ t.campaign.projectDays }}</legend>
        <p class="muted">
          {{ t.campaign.settings.frameHint }}
        </p>
        <p class="muted">
          {{ t.campaign.settings.activityMinimumHint }}
        </p>
        <p
          v-for="(_, index) in days"
          :key="index"
          class="actions"
        >
          <input
            v-model="days[index]"
            :aria-label="t.campaign.settings.projectDay(index + 1)"
            type="date"
            required
          >
          <span
            v-if="days[index]"
            class="muted"
          >{{ formatDay(days[index]) }}</span>
          <FrameSelect
            :model-value="frames[index] ?? null"
            :grid="grid"
            :day="index + 1"
            @update:model-value="frames[index] = $event"
          />
          <label>
            <input
              v-model="minimums[index]"
              :aria-label="t.campaign.settings.activityMinimum(index + 1)"
              type="number"
              min="1"
              max="1440"
              step="1"
              size="5"
            >
            {{ t.campaign.settings.activityMinimumUnit }}
          </label>
          <button
            v-if="days.length > 1"
            type="button"
            class="ghost"
            @click="removeDay(index)"
          >
            {{ t.common.remove }}
          </button>
        </p>
        <p>
          <button
            type="button"
            class="ghost"
            :disabled="days.length >= 10"
            @click="addDay"
          >
            {{ t.common.addDay }}
          </button>
        </p>
      </fieldset>
      <fieldset class="field">
        <legend>{{ t.campaigns.classes.legend }}</legend>
        <p class="muted">
          {{ t.campaigns.classes.hint }}
        </p>
        <ClassPicker
          v-model="classes"
          :options="classOptions"
        />
      </fieldset>
      <p class="actions">
        <button
          type="submit"
          :disabled="creating.busy.value"
        >
          {{ t.campaigns.create }}
        </button>
      </p>
      <p
        v-if="creating.error.value"
        role="alert"
        class="alert"
      >
        {{ creating.error.value }}
      </p>
    </form>
  </section>
</template>
