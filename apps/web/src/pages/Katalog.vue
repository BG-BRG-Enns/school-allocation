<script setup lang="ts">
// The catalogue as students read it and as the school prints it: every
// approved activity with its number, teachers, sessions, places and fee.
// The browser's print function makes the PDF; the page hides the shell
// around it when printing.

import { onMounted, ref, watch } from 'vue'
import { loadCatalogue, type Campaign, type Item } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, formatFee, formatSpan } from '../lib/format.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string }>()
const campaign = ref<Campaign | null>(null)
const items = ref<Item[]>([])
const loading = useFeedback()
usePageTitle(() => campaign.value ? `Katalog ${campaign.value.name}` : 'Katalog')

async function load(): Promise<void> {
  await loading.run(async () => {
    const result = await loadCatalogue(props.id)
    campaign.value = result.campaign
    items.value = result.items
  })
}
onMounted(load)
watch(() => props.id, load)

function places(item: Item): string {
  if (item.fixedClasses.length === 0) return `${item.places} Plätze`
  return item.places > 0 ? `fix für ${item.fixedClasses.join(', ')}, dazu ${item.places} Plätze` : `fix für ${item.fixedClasses.join(', ')}`
}

function print(): void {
  window.print()
}

function who(item: Item): string {
  const parts: string[] = []
  if (item.eligibleGrades.length > 0) parts.push(`${item.eligibleGrades.join('., ')}. Schulstufe`)
  if (item.eligibleClasses.length > 0) parts.push(item.eligibleClasses.join(', '))
  return parts.length === 0 ? 'alle Schulstufen' : parts.join(' · ')
}
</script>

<template>
  <p class="no-print">
    <RouterLink :to="`/wahlen/${props.id}`">
      ← Zur Wahl
    </RouterLink>
  </p>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <template v-if="campaign">
    <h1>Katalog {{ campaign.name }}</h1>
    <p>Projekttage: {{ campaign.projectDays.map(formatDay).join(', ') }}</p>
    <p class="actions no-print">
      <button
        type="button"
        class="ghost"
        @click="print"
      >
        Drucken
      </button>
    </p>
    <p v-if="items.length === 0">
      Der Katalog ist noch leer.
    </p>
    <article
      v-for="item in items"
      :key="item.id"
      class="catalogue-item"
    >
      <h2>{{ item.number === null ? item.title : `${item.number} · ${item.title}` }}</h2>
      <p class="muted">
        {{ item.teachers.map((t) => t.displayName).join(', ') }}<template v-if="item.location">
          · {{ item.location }}
        </template>
      </p>
      <p
        v-if="item.description"
        class="description"
      >
        {{ item.description }}
      </p>
      <ul class="plain">
        <li
          v-for="s in item.sessions"
          :key="s.id"
        >
          {{ formatSpan(s.startsAt, s.endsAt) }}<template v-if="s.location">
            · {{ s.location }}
          </template>
          <span class="muted"> · angerechnet {{ s.credits.map((c) => `${c.minutes} min`).join(' + ') }}</span>
        </li>
      </ul>
      <p>
        {{ places(item) }} · für {{ who(item) }}<template v-if="item.feeCents > 0">
          · Beitrag {{ formatFee(item.feeCents) }}<template v-if="item.feeNote">
            ({{ item.feeNote }})
          </template>
        </template>
      </p>
    </article>
  </template>
</template>
