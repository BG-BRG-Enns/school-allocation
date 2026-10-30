<script setup lang="ts">
// The catalogue as students read it and as the school prints it: every
// approved activity with its number, teachers, sessions, places and fee.
// The browser's print function makes the PDF; the page hides the shell
// around it when printing.

import { onMounted, ref, watch } from 'vue'
import type { Period } from '@school-allocation/school-core'
import { loadPeriods } from '../lib/admin-api.ts'
import { loadCatalogue, type Campaign, type Item } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, formatFee, formatSpanOnGrid } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string }>()
const campaign = ref<Campaign | null>(null)
const items = ref<Item[]>([])
const grid = ref<Period[]>([])
const loading = useFeedback()
usePageTitle(() => campaign.value ? t.catalogue.titleOf(campaign.value.name) : t.catalogue.title)

async function load(): Promise<void> {
  await loading.run(async () => {
    const [result, periods] = await Promise.all([loadCatalogue(props.id), loadPeriods()])
    campaign.value = result.campaign
    items.value = result.items
    grid.value = periods.periods
  })
}
onMounted(load)
watch(() => props.id, load)

function places(item: Item): string {
  if (item.fixedClasses.length === 0) return t.catalogue.places(item.places)
  return item.places > 0 ? t.catalogue.fixedAndPlaces(item.fixedClasses.join(', '), item.places) : t.catalogue.fixed(item.fixedClasses.join(', '))
}

function print(): void {
  window.print()
}

/** What a session credits, as "angerechnet 240 min + 60 min". */
function credited(session: Item['sessions'][number]): string {
  return t.catalogue.credited(session.credits.map((c) => t.common.minutes(c.minutes)).join(' + '))
}

function who(item: Item): string {
  const parts: string[] = []
  if (item.eligibleGrades.length > 0) parts.push(t.catalogue.grades(item.eligibleGrades))
  if (item.eligibleClasses.length > 0) parts.push(item.eligibleClasses.join(', '))
  return parts.length === 0 ? t.catalogue.allGrades : parts.join(' · ')
}
</script>

<template>
  <p class="no-print">
    <RouterLink :to="`/wahlen/${props.id}`">
      ← {{ t.common.backToCampaign }}
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
    <h1>{{ t.catalogue.titleOf(campaign.name) }}</h1>
    <p>{{ t.catalogue.projectDays(campaign.projectDays.map(formatDay).join(', ')) }}</p>
    <p class="actions no-print">
      <button
        type="button"
        class="ghost"
        @click="print"
      >
        {{ t.catalogue.print }}
      </button>
    </p>
    <p v-if="items.length === 0">
      {{ t.catalogue.empty }}
    </p>
    <article
      v-for="item in items"
      :key="item.id"
      class="catalogue-item"
    >
      <h2>{{ item.number === null ? item.title : `${item.number} · ${item.title}` }}</h2>
      <p
        v-if="item.teachers.length > 0 || item.location"
        class="muted"
      >
        {{ item.teachers.map((teacher) => teacher.displayName).join(', ') }}<template v-if="item.location">
          {{ item.teachers.length > 0 ? '· ' : '' }}{{ item.location }}
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
          {{ formatSpanOnGrid(grid, s.startsAt, s.endsAt) }}<template v-if="s.location">
            · {{ s.location }}
          </template>
          <span class="muted"> · {{ credited(s) }}</span>
        </li>
      </ul>
      <p>
        {{ places(item) }} · {{ t.catalogue.forWhom(who(item)) }}<template v-if="item.feeCents > 0">
          · {{ t.catalogue.fee(formatFee(item.feeCents)) }}<template v-if="item.feeNote">
            ({{ item.feeNote }})
          </template>
        </template>
      </p>
    </article>
  </template>
</template>
