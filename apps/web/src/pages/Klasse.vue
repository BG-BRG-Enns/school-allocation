<script setup lang="ts">
// A class as its class teacher sees it in a campaign: the students, and
// the class activities that take the class on which days. Who has chosen
// comes with the choice window.

import { computed, onMounted, ref, watch } from 'vue'
import { loadCampaign, loadClassStatus, type Campaign, type ClassStatus } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatSpan } from '../lib/format.ts'
import { ASSIGNMENT_SOURCE_LABELS, CHOICE_STATE_LABELS, ITEM_STATE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string, className: string }>()
const campaign = ref<Campaign | null>(null)
const status = ref<ClassStatus | null>(null)
const loading = useFeedback()
usePageTitle(() => `Klasse ${props.className}`)
const published = computed(() => status.value?.students.some((s) => s.placement !== null && s.placement !== undefined) ?? false)
const unplaced = computed(() => status.value?.students.filter((s) => (s.placement?.deficit ?? 0) > 0) ?? [])
const placementText = (s: ClassStatus['students'][number]): string => s.placement?.items.map((i) => `${i.title} (${ASSIGNMENT_SOURCE_LABELS[i.source] ?? i.source})`).join(', ') || 'kein Platz'

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
    <section v-if="published">
      <h2>Nicht vollständig zugeteilt ({{ unplaced.length }})</h2>
      <p
        v-if="unplaced.length === 0"
        class="muted"
      >
        Alle Schüler/innen der Klasse haben an jedem Tag ihr Programm.
      </p>
      <ul v-else>
        <li
          v-for="s in unplaced"
          :key="s.personId"
        >
          <strong>{{ s.displayName }}</strong>: {{ s.placement?.deficit }} Minuten fehlen<template v-if="s.placement && s.placement.items.length > 0">
            · bisher {{ s.placement.items.map((i) => i.title).join(', ') }}
          </template>
        </li>
      </ul>
      <p class="muted">
        Die händische Zuteilung in eine Aktivität mit freien Plätzen kommt mit dem nächsten Schritt.
      </p>
    </section>
    <section>
      <h2>Schüler/innen ({{ status.students.length }})</h2>
      <p
        v-if="status.students.every((s) => s.choice === null)"
        class="muted"
      >
        Wer schon gewählt hat, zeigt diese Seite, sobald die Wahl läuft.
      </p>
      <ul>
        <li
          v-for="s in status.students"
          :key="s.personId"
        >
          {{ s.displayName }}
          <span
            v-if="s.choice !== null && !published"
            :class="['badge', s.choice === 'complete' ? 'badge-approved' : 'badge-proposed']"
          >{{ CHOICE_STATE_LABELS[s.choice] ?? s.choice }}</span>
          <span
            v-if="s.placement"
            class="muted"
          > · {{ placementText(s) }}</span>
        </li>
      </ul>
    </section>
  </template>
</template>
