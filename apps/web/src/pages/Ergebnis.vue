<script setup lang="ts">
// A student's result (docs/domain-and-api.md §5, "Explanation per student"):
// per project day the activities they are in, with the wish number, the
// minutes and the fee; what they miss, if anything; the rule in one
// paragraph with the seed; the swap window (§3 rule 7): its dates, and
// while it is open the activities with free places the student could move
// into, what each move would leave, and why one is not possible; the
// student's own changes since publication.

import { computed, onMounted, ref, watch } from 'vue'
import type { Period } from '@school-allocation/school-core'
import { loadMyResult, swapInto, type MoveOffer, type MyResultResponse } from '../lib/allocation-api.ts'
import { loadPeriods } from '../lib/admin-api.ts'
import { ApiError } from '../lib/api-rules.ts'
import { useFeedback } from '../lib/feedback.ts'
import { datesBetween, formatDay, formatFee, formatSpanOnGrid, formatWhenShort, localDateOf } from '../lib/format.ts'
import { CHANGE_KIND_LABELS, MOVE_PROBLEM_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string }>()
usePageTitle(() => 'Mein Ergebnis')

const result = ref<MyResultResponse | null>(null)
const grid = ref<Period[]>([])
const notYet = ref(false)
const loading = useFeedback()
const action = useFeedback()

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

/** The local dates a session touches, an end at midnight belonging to the day before. */
const touches = (session: { startsAt: string, endsAt: string }, date: string) => datesBetween(localDateOf(session.startsAt), localDateOf(new Date(Date.parse(session.endsAt) - 1).toISOString())).includes(date)

const byDay = computed(() => {
  if (!result.value) return []
  const r = result.value
  return r.campaign.projectDays.map((date) => {
    const day = r.explanation.days.find((d) => d.date === date)
    // An activity belongs to every day a session of it touches, credited minutes or not: a trip leaving on Monday evening is Monday's too.
    const entries = r.explanation.items
      .map((e) => {
        const item = r.items.find((i) => i.id === e.itemId)
        // The day's sessions alone: a trip over the night is on both days, Monday's workshop not on Wednesday.
        return { ...e, item, minutes: e.minutesByDate[date] ?? 0, sessions: item?.sessions.filter((s) => touches(s, date)) ?? [] }
      })
      .filter((e) => e.minutes > 0 || e.sessions.length > 0)
      .sort((a, b) => (a.sessions[0]?.startsAt ?? '').localeCompare(b.sessions[0]?.startsAt ?? ''))
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

const itemOf = (itemId: string) => result.value?.items.find((i) => i.id === itemId)
const itemTitle = (itemId: string): string => {
  const item = itemOf(itemId)
  return item === undefined ? '?' : item.number === null ? item.title : `${item.number}. ${item.title}`
}

/** The offers of the open swap window by project day, the possible moves first; an item on two days is listed under its first. */
const offersByDay = computed(() => {
  const r = result.value
  if (!r || r.offers === null) return []
  const offers = r.offers
  return r.campaign.projectDays.map((date) => ({
    date,
    offers: offers
      .filter((o) => {
        const item = itemOf(o.itemId)
        const first = item?.sessions.map((s) => localDateOf(s.startsAt)).sort()[0]
        return first === date
      })
      .sort((a, b) => Number(a.problems.length > 0) - Number(b.problems.length > 0) || itemTitle(a.itemId).localeCompare(itemTitle(b.itemId), 'de')),
  })).filter((d) => d.offers.length > 0)
})
const offerText = (o: MoveOffer): string => o.problems.length > 0 ? (MOVE_PROBLEM_LABELS[o.problems[0]?.code ?? ''] ?? o.problems[0]?.code ?? '') : `${o.free} ${o.free === 1 ? 'freier Platz' : 'freie Plätze'}`

async function onSwap(o: MoveOffer): Promise<void> {
  const leaving = o.leaves.map(itemTitle).join(', ')
  const question = leaving === '' ? `In „${itemTitle(o.itemId)}“ wechseln?` : `In „${itemTitle(o.itemId)}“ wechseln und „${leaving}“ verlassen?`
  if (!window.confirm(question)) return
  await action.run(async () => {
    result.value = await swapInto(props.id, o.itemId)
  }, 'Dein Tausch ist eingetragen.')
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
              v-for="s in e.sessions"
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
        Von {{ formatWhenShort(result.swapWindow.from) }} bis {{ formatWhenShort(result.swapWindow.until) }} kannst du in eine Aktivität mit freien Plätzen wechseln. Wer zuerst kommt, bekommt den Platz; eine Aktivität deiner Klasse bleibt, und es dürfen danach nicht mehr Minuten fehlen als jetzt.
      </p>
      <template v-if="result.offers !== null">
        <p
          v-if="offersByDay.length === 0"
          class="muted"
        >
          Zur Zeit steht keine andere Aktivität für dich zur Wahl.
        </p>
        <div
          v-for="day in offersByDay"
          :key="day.date"
        >
          <h3>{{ formatDay(day.date) }}</h3>
          <ul class="catalogue-item">
            <li
              v-for="o in day.offers"
              :key="o.itemId"
            >
              <strong>{{ itemTitle(o.itemId) }}</strong>
              <span :class="['badge', o.problems.length === 0 ? 'badge-approved' : '']">{{ offerText(o) }}</span>
              <ul class="plain">
                <li
                  v-for="s in itemOf(o.itemId)?.sessions ?? []"
                  :key="s.id"
                >
                  {{ formatSpanOnGrid(grid, s.startsAt, s.endsAt) }}<template v-if="s.location">
                    · {{ s.location }}
                  </template>
                </li>
                <li v-if="(itemOf(o.itemId)?.feeCents ?? 0) > 0">
                  Beitrag {{ formatFee(itemOf(o.itemId)?.feeCents ?? 0) }}
                </li>
                <li v-if="o.leaves.length > 0">
                  Dafür verlässt du: {{ o.leaves.map(itemTitle).join(', ') }}
                </li>
              </ul>
              <p class="actions">
                <button
                  type="button"
                  :disabled="o.problems.length > 0 || action.busy.value"
                  @click="onSwap(o)"
                >
                  Wechseln
                </button>
              </p>
            </li>
          </ul>
        </div>
      </template>
    </section>
    <section v-if="result.changes.length > 0">
      <h2>Änderungen seit der Veröffentlichung</h2>
      <ul>
        <li
          v-for="c in result.changes"
          :key="c.changedAt"
        >
          {{ formatWhenShort(c.changedAt) }} · {{ CHANGE_KIND_LABELS[c.kind] ?? c.kind }}<template v-if="c.leftItemIds.length > 0">
            · nicht mehr {{ c.leftItemIds.map(itemTitle).join(', ') }}
          </template><template v-if="c.toItemId !== null">
            · neu {{ itemTitle(c.toItemId) }}
          </template>
        </li>
      </ul>
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
