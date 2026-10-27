<script setup lang="ts">
// The campaigns the person may see, and, for organizers, the form that
// sets a new one up: its name, school year and project days.

import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createCampaign, loadCampaigns, type Campaign } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay } from '../lib/format.ts'
import { CAMPAIGN_STATE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => 'Wahlen')
const router = useRouter()
const campaigns = ref<Campaign[] | null>(null)
const loading = useFeedback()
const organizes = computed(() => (session.value?.roles ?? []).some((role) => role === 'campaign_organizer' || role === 'school_admin'))

const name = ref('')
const schoolYear = ref('')
const days = ref<string[]>([''])
const creating = useFeedback()

onMounted(() => loading.run(async () => {
  campaigns.value = (await loadCampaigns()).campaigns
}))

function addDay(): void {
  days.value.push('')
}

function removeDay(index: number): void {
  days.value.splice(index, 1)
}

async function onCreate(): Promise<void> {
  let created: Campaign | undefined
  const ok = await creating.run(async () => {
    created = await createCampaign({ kind: 'project_week', name: name.value.trim(), schoolYear: schoolYear.value.trim(), projectDays: days.value.filter(Boolean) })
  })
  if (ok && created) await router.push(`/wahlen/${created.id}`)
}
</script>

<template>
  <h1>Wahlen</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <template v-if="campaigns">
    <p v-if="campaigns.length === 0">
      Noch keine Wahl.
    </p>
    <table
      v-else
      class="table"
    >
      <thead>
        <tr>
          <th scope="col">
            Wahl
          </th>
          <th scope="col">
            Schuljahr
          </th>
          <th scope="col">
            Projekttage
          </th>
          <th scope="col">
            Stand
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
    <h2>Neue Wahl</h2>
    <form @submit.prevent="onCreate">
      <p class="field">
        <label for="campaign-name">Bezeichnung</label>
        <input
          id="campaign-name"
          v-model="name"
          required
          maxlength="200"
          placeholder="Projektwoche 2027"
        >
      </p>
      <p class="field">
        <label for="campaign-year">Schuljahr</label>
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
        <legend>Projekttage</legend>
        <p
          v-for="(_, index) in days"
          :key="index"
          class="actions"
        >
          <input
            v-model="days[index]"
            :aria-label="`Projekttag ${index + 1}`"
            type="date"
            required
          >
          <button
            v-if="days.length > 1"
            type="button"
            class="ghost"
            @click="removeDay(index)"
          >
            Entfernen
          </button>
        </p>
        <p>
          <button
            type="button"
            class="ghost"
            :disabled="days.length >= 10"
            @click="addDay"
          >
            Tag hinzufügen
          </button>
        </p>
      </fieldset>
      <p class="actions">
        <button
          type="submit"
          :disabled="creating.busy.value"
        >
          Wahl anlegen
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
