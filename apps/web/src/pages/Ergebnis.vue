<script setup lang="ts">
// A student's result (docs/domain-and-api.md §5, "Explanation per student"):
// per project day the activities they are in, with the wish number, the
// minutes and the fee; what they miss, if anything; the rule in one
// paragraph with the seed; the swap window's dates when the campaign has
// them (the move itself comes with S5).

import { computed, onMounted, ref, watch } from 'vue'
import type { Period } from '@school-allocation/school-core'
import { loadMyResult, type MyResultResponse } from '../lib/allocation-api.ts'
import { loadPeriods } from '../lib/admin-api.ts'
import { ApiError } from '../lib/api-rules.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, formatFee, formatSpanOnGrid, formatWhenShort } from '../lib/format.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string }>()
usePageTitle(() => 'Mein Ergebnis')

const result = ref<MyResultResponse | null>(null)
const grid = ref<Period[]>([])
const notYet = ref(false)
const loading = useFeedback()

async function load(): Promise<void> {
  notYet.value = false
  await loading.run(async () => {
    try {
      const [r, periods] = await Promise.all([loadMyResult(props.id), loadPeriods()])
      result.value = r
      grid.value = periods.periods
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_published') {
        notYet.value = true
        return
      }
      throw err
    }
  })
}
onMounted(load)
watch(() => props.id, load)

const byDay = computed(() => {
  if (!result.value) return []
  const r = result.value
  return r.campaign.projectDays.map((date) => {
    const day = r.explanation.days.find((d) => d.date === date)
    const entries = r.explanation.items
      .filter((e) => (e.minutesByDate[date] ?? 0) > 0)
      .map((e) => ({ ...e, item: r.items.find((i) => i.id === e.itemId), minutes: e.minutesByDate[date] ?? 0 }))
      .sort((a, b) => (a.item?.sessions[0]?.startsAt ?? '').localeCompare(b.item?.sessions[0]?.startsAt ?? ''))
    return { date, day, entries }
  })
})

function sourceText(source: string, rank: number | null): string {
  if (source === 'fixed') return 'mit deiner Klasse'
  if (source === 'wish') return `dein ${rank}. Wunsch`
  if (source === 'fallback') return 'zugeteilt, da deine Wünsche hier nicht reichten'
  if (source === 'swap') return 'dein Tausch'
  return 'eingeteilt'
}
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← Zur Wahl
    </RouterLink>
  </p>
  <h1>Mein Ergebnis</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <p
    v-if="notYet"
    class="muted"
  >
    Das Ergebnis ist noch nicht veröffentlicht. Sobald die Organisation die Zuteilung freigibt, steht es hier.
  </p>
  <template v-if="result">
    <p class="muted">
      {{ result.campaign.name }} · veröffentlicht {{ formatWhenShort(result.run.publishedAt) }}
    </p>
    <section
      v-for="entry in byDay"
      :key="entry.date"
    >
      <h2>{{ formatDay(entry.date) }}</h2>
      <p
        v-if="entry.entries.length === 0"
        class="muted"
      >
        An diesem Tag hast du keine Aktivität.
      </p>
      <ul
        v-else
        class="catalogue-item"
      >
        <li
          v-for="e in entry.entries"
          :key="e.itemId"
        >
          <strong>{{ e.item?.number !== null && e.item?.number !== undefined ? `${e.item.number}. ` : '' }}{{ e.item?.title ?? '?' }}</strong>
          <span class="badge">{{ sourceText(e.source, e.rank) }}</span>
          <ul class="plain">
            <li
              v-for="s in e.item?.sessions ?? []"
              :key="s.id"
            >
              {{ formatSpanOnGrid(grid, s.startsAt, s.endsAt) }}<template v-if="s.location">
                · {{ s.location }}
              </template>
            </li>
            <li v-if="e.item && e.item.teachers.length > 0">
              {{ e.item.teachers.map((t) => t.displayName).join(', ') }}
            </li>
            <li>
              {{ e.minutes }} Minuten angerechnet<template v-if="e.item && e.item.feeCents > 0">
                · Beitrag {{ formatFee(e.item.feeCents) }}
              </template>
            </li>
          </ul>
        </li>
      </ul>
      <p
        v-if="entry.day && entry.day.deficit > 0"
        class="alert"
        role="status"
      >
        Hier fehlen dir noch {{ entry.day.deficit }} Minuten: dein Klassenvorstand teilt dich einer Aktivität mit freien Plätzen zu.
      </p>
    </section>
    <section>
      <h2>Beitrag</h2>
      <p>{{ result.feeCents === 0 ? 'Für deine Aktivitäten ist kein Beitrag zu zahlen.' : `Insgesamt ${formatFee(result.feeCents)}; die Schule sagt, wie und bis wann.` }}</p>
    </section>
    <section v-if="result.swapWindow">
      <h2>Tauschen</h2>
      <p>
        Von {{ formatWhenShort(result.swapWindow.from) }} bis {{ formatWhenShort(result.swapWindow.until) }} kannst du in eine Aktivität mit freien Plätzen wechseln.
      </p>
    </section>
    <section>
      <h2>So kam die Zuteilung zustande</h2>
      <p>
        Zuerst sollte niemand ohne volle Woche bleiben, dann sollten so wenige Minuten wie möglich fehlen, dann so wenige Schüler/innen wie möglich überwiegend späte Wünsche bekommen, dann das Ganze so gut wie möglich ausgehen. Wo zwei Zuteilungen gleich gut waren, hat das Los entschieden, mit der aufgezeichneten Zahl {{ result.run.seed }} (Lauf {{ result.run.seq }}).
        <template v-if="result.explanation.window === 'late'">
          Deine Wünsche kamen in der Nachfrist und wurden nach den anderen zugeteilt.
        </template>
        <template v-else-if="result.explanation.window === null && result.explanation.items.some((e) => e.source !== 'fixed')">
          Du hattest keine Wünsche abgegeben und wurdest auf freie Plätze ohne Beitrag gesetzt.
        </template>
      </p>
    </section>
  </template>
</template>
