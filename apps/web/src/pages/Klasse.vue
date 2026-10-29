<script setup lang="ts">
// A class as its class teacher sees it in a campaign: the students, and
// the class activities that take the class on which days. Who has chosen
// comes with the choice window.

import { onMounted, ref, watch } from 'vue'
import { loadCampaign, loadClassStatus, type Campaign, type ClassStatus } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatSpan } from '../lib/format.ts'
import { ITEM_STATE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string, className: string }>()
const campaign = ref<Campaign | null>(null)
const status = ref<ClassStatus | null>(null)
const loading = useFeedback()
usePageTitle(() => `Klasse ${props.className}`)

async function load(): Promise<void> {
  await loading.run(async () => {
    const [view, s] = await Promise.all([loadCampaign(props.id), loadClassStatus(props.id, props.className)])
    campaign.value = view.campaign
    status.value = s
  })
}
onMounted(load)
watch(() => [props.id, props.className], load)
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← Zur Wahl
    </RouterLink>
  </p>
  <h1>Klasse {{ props.className }}</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <template v-if="campaign && status">
    <p class="muted">
      {{ campaign.name }} · Schuljahr {{ campaign.schoolYear }}
    </p>
    <section>
      <h2>Klassenaktivitäten</h2>
      <p v-if="status.classActivities.length === 0">
        Keine Aktivität nimmt die ganze Klasse mit.
      </p>
      <ul v-else>
        <li
          v-for="a in status.classActivities"
          :key="a.id"
        >
          <strong>{{ a.title }}</strong> <span class="badge">{{ ITEM_STATE_LABELS[a.state] ?? a.state }}</span>
          <ul class="plain">
            <li
              v-for="(s, index) in a.sessions"
              :key="index"
            >
              {{ formatSpan(s.startsAt, s.endsAt) }}
            </li>
          </ul>
        </li>
      </ul>
    </section>
    <section>
      <h2>Schüler/innen ({{ status.students.length }})</h2>
      <p class="muted">
        Wer schon gewählt hat, zeigt diese Seite, sobald die Wahl läuft.
      </p>
      <ul>
        <li
          v-for="s in status.students"
          :key="s.personId"
        >
          {{ s.displayName }}
        </li>
      </ul>
    </section>
  </template>
</template>
