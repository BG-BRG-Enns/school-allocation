<script setup lang="ts">
// A class as its class teacher sees it in a campaign: the students, and
// the class activities that take the class on which days; who has chosen,
// once the window is open; from publication on each one's places and the
// minutes they miss, and for those short of minutes the placement into an
// activity with free places that fits the gap (D-06), with a reason.

import { computed, onMounted, ref, watch } from 'vue'
import { placeStudent } from '../lib/allocation-api.ts'
import { loadCampaign, loadClassStatus, type Campaign, type ClassStatus } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatSpan } from '../lib/format.ts'
import { ASSIGNMENT_SOURCE_LABELS, CHOICE_STATE_LABELS, ITEM_STATE_LABELS, MOVE_PROBLEM_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string, className: string }>()
const campaign = ref<Campaign | null>(null)
const status = ref<ClassStatus | null>(null)
const loading = useFeedback()
const action = useFeedback()
usePageTitle(() => `Klasse ${props.className}`)
const published = computed(() => status.value?.students.some((s) => s.placement !== null && s.placement !== undefined) ?? false)
const unplaced = computed(() => status.value?.students.filter((s) => (s.placement?.deficit ?? 0) > 0) ?? [])
const placementText = (s: ClassStatus['students'][number]): string => s.placement?.items.map((i) => `${i.title} (${ASSIGNMENT_SOURCE_LABELS[i.source] ?? i.source})`).join(', ') || 'kein Platz'
/** The placement form's choice and reason, per student. */
const chosen = ref<Record<string, string>>({})
const reasons = ref<Record<string, string>>({})
type Offer = NonNullable<ClassStatus['students'][number]['placement']>['offers'][number]
const offerLabel = (o: Offer): string => `${o.number === null ? '' : `${o.number}. `}${o.title} – ${o.problems.length > 0 ? (MOVE_PROBLEM_LABELS[o.problems[0] ?? ''] ?? o.problems[0]) : `${o.free} ${o.free === 1 ? 'freier Platz' : 'freie Plätze'}`}`

async function onPlace(personId: string): Promise<void> {
  const itemId = chosen.value[personId] ?? ''
  const reason = (reasons.value[personId] ?? '').trim()
  if (itemId === '' || reason === '') return
  const ok = await action.run(async () => {
    status.value = await placeStudent(props.id, props.className, personId, itemId, reason)
  }, 'Zugeteilt; die Schülerin oder der Schüler wird benachrichtigt.')
  if (ok) {
    delete chosen.value[personId]
    delete reasons.value[personId]
  }
}

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
          <form
            v-if="campaign.state === 'results'"
            class="inline-form"
            :aria-label="`${s.displayName} zuteilen`"
            @submit.prevent="onPlace(s.personId)"
          >
            <p
              v-if="(s.placement?.offers.length ?? 0) === 0"
              class="muted"
            >
              Keine Aktivität mit freien Plätzen passt in die Lücke; die Organisation kann anders zuteilen.
            </p>
            <template v-else>
              <p class="field">
                <label :for="`place-item-${s.personId}`">Aktivität für {{ s.displayName }}</label>
                <select
                  :id="`place-item-${s.personId}`"
                  v-model="chosen[s.personId]"
                  required
                >
                  <option value="">
                    Bitte wählen
                  </option>
                  <option
                    v-for="o in s.placement?.offers ?? []"
                    :key="o.itemId"
                    :value="o.itemId"
                    :disabled="o.problems.length > 0"
                  >
                    {{ offerLabel(o) }}
                  </option>
                </select>
              </p>
              <p class="field">
                <label :for="`place-reason-${s.personId}`">Begründung für {{ s.displayName }}</label>
                <input
                  :id="`place-reason-${s.personId}`"
                  v-model="reasons[s.personId]"
                  type="text"
                  maxlength="500"
                  required
                >
              </p>
              <p class="actions">
                <button
                  type="submit"
                  :disabled="action.busy.value"
                >
                  Zuteilen
                </button>
              </p>
            </template>
          </form>
        </li>
      </ul>
      <p class="muted">
        Die Zuteilung in eine Lücke ist der Weg des Klassenvorstands; die Schülerin oder der Schüler wird benachrichtigt, die Organisation sieht jede Änderung mit ihrer Begründung.
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
