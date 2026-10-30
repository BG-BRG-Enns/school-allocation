<script setup lang="ts">
// A student's wishes (D-05): the activities they are placed into, and per
// project day the time groups offered, each ranked up to the campaign's
// cap. The same page serves an organizer entering on a student's behalf,
// with a reason, and exempting the student from a class activity. The
// rules are the server's; completeness is shown as the server computes it.

import { computed, onMounted, ref, watch } from 'vue'
import type { Period } from '@school-allocation/school-core'
import { loadPeriods } from '../lib/admin-api.ts'
import { ApiError } from '../lib/api-rules.ts'
import { exemptStudent, loadChoiceOf, loadMyChoice, saveChoiceOf, saveMyChoice, type ChoiceView, type GroupView, type Item, type RankingInvalidBody } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, formatFee, formatSpanOnGrid, formatWhenShort, localDateOf } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { RANKING_PROBLEM_LABELS, WINDOW_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string, personId?: string }>()
const onBehalf = computed(() => props.personId !== undefined)
usePageTitle(() => onBehalf.value ? t.wishes.titleOnBehalf : t.common.page.wishes)

const view = ref<ChoiceView | null>(null)
const grid = ref<Period[]>([])
const loading = useFeedback()
const saving = useFeedback()
const problems = ref<string[]>([])
/** Group key → the item ids in wish order, as edited. */
const ranking = ref<Record<string, string[]>>({})
const reason = ref('')
const exempting = ref<Item | null>(null)
const exemptReason = ref('')

async function load(): Promise<void> {
  problems.value = []
  await loading.run(async () => {
    const [v, periods] = await Promise.all([onBehalf.value ? loadChoiceOf(props.id, props.personId as string) : loadMyChoice(props.id), loadPeriods()])
    view.value = v
    grid.value = periods.periods
    ranking.value = Object.fromEntries(Object.entries(v.ranking).map(([key, ids]) => [key, [...ids]]))
  })
}
onMounted(load)
watch(() => [props.id, props.personId], load)

const campaign = computed(() => view.value?.campaign)
const editable = computed(() => view.value?.acceptsChoices ?? false)

/** The days, in order: those with groups offered and those taken by fixed items, which show as well. */
const days = computed(() => {
  const byDay = new Map<string, GroupView[]>()
  for (const group of view.value?.groups ?? []) {
    const day = localDateOf(group.startsAt)
    byDay.set(day, [...(byDay.get(day) ?? []), group])
  }
  for (const item of view.value?.fixed ?? []) {
    for (const s of item.sessions) if (!byDay.has(localDateOf(s.startsAt))) byDay.set(localDateOf(s.startsAt), [])
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([day, groups]) => ({ day, groups, fixed: (view.value?.fixed ?? []).filter((item) => item.sessions.some((s) => localDateOf(s.startsAt) === day)) }))
})

/** The wish number of an item in its group, 1-based; 0 for none. */
function rankOf(group: GroupView, item: Item): number {
  return (ranking.value[group.key] ?? []).indexOf(item.id) + 1
}

/** Gives `item` the wish number `rank` in its group: whoever had it moves down, a 0 takes the item out. A student's change is saved at once. */
function setRank(group: GroupView, item: Item, rank: number): void {
  const without = (ranking.value[group.key] ?? []).filter((id) => id !== item.id)
  edits += 1
  if (rank <= 0) {
    ranking.value[group.key] = without
  } else {
    without.splice(Math.min(rank - 1, without.length), 0, item.id)
    ranking.value[group.key] = without.slice(0, view.value?.cap ?? 3)
  }
  // Every change to a ranking is saved at once (AGENTS.md); an organizer's entry waits for its reason.
  if (!onBehalf.value && editable.value) void save()
}

function wishesOf(group: GroupView): number {
  return ranking.value[group.key]?.length ?? 0
}

/** The local completeness as the student edits; the server's verdict comes with the save. */
const complete = computed(() => (view.value?.groups ?? []).every((group) => wishesOf(group) >= group.required))

/** Edits since the page loaded, and the one the last save carried: an answer to an older save never replaces a newer edit. */
let edits = 0
let saves: Promise<void> = Promise.resolve()

/** Saves, one after another in the order asked, each with the ranking as it is when its turn comes. */
function save(): Promise<void> {
  saves = saves.then(saveNow, saveNow)
  return saves
}

async function saveNow(): Promise<void> {
  problems.value = []
  await saving.run(async () => {
    try {
      const atEdit = edits
      const cleaned = Object.fromEntries(Object.entries(ranking.value).filter(([, ids]) => ids.length > 0))
      const saved = onBehalf.value ? await saveChoiceOf(props.id, props.personId as string, cleaned, reason.value.trim()) : await saveMyChoice(props.id, cleaned)
      view.value = saved
      // The server's view replaces the local one only when nothing was edited meanwhile; a later save carries the rest.
      if (atEdit === edits) ranking.value = Object.fromEntries(Object.entries(saved.ranking).map(([key, ids]) => [key, [...ids]]))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ranking_invalid') {
        const body = err.body as unknown as RankingInvalidBody
        problems.value = body.problems.map((p) => RANKING_PROBLEM_LABELS[p.code] ?? p.code)
      }
      throw err
    }
  }, t.common.saved)
}

async function exempt(): Promise<void> {
  const item = exempting.value
  if (!item || !props.personId) return
  const ok = await saving.run(async () => {
    view.value = await exemptStudent(props.id, props.personId as string, item.id, exemptReason.value.trim())
    edits += 1
    ranking.value = Object.fromEntries(Object.entries(view.value.ranking).map(([key, ids]) => [key, [...ids]]))
  }, t.wishes.exemptions.done)
  if (ok) {
    exempting.value = null
    exemptReason.value = ''
  }
}
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← {{ t.common.backToCampaign }}
    </RouterLink>
  </p>
  <h1>{{ onBehalf ? t.wishes.titleOnBehalf : t.common.page.wishes }}</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <template v-if="view && campaign">
    <p
      v-if="onBehalf"
      class="notice"
    >
      {{ t.wishes.onBehalf(view.student.displayName, view.student.className) }}
    </p>
    <p class="muted">
      {{ campaign.name }} · {{ t.wishes.cap(view.cap) }}
      <template v-if="campaign.closesAt">
        · {{ t.wishes.closesAt(formatWhenShort(campaign.closesAt)) }}
      </template>
      <template v-if="campaign.state === 'grace' && campaign.lateUntil">
        · {{ t.wishes.lateUntil(formatWhenShort(campaign.lateUntil)) }}
      </template>
    </p>
    <p
      v-if="!editable"
      class="notice"
    >
      {{ t.wishes.notAccepting }}
    </p>
    <p
      v-else-if="view.window === 'late' || campaign.state === 'grace'"
      class="notice"
    >
      {{ t.wishes.lateNotice }}
    </p>
    <p v-if="view.window">
      <span :class="['badge', view.complete ? 'badge-approved' : 'badge-proposed']">{{ view.complete ? t.labels.choiceState.complete : t.labels.choiceState.incomplete }}</span>
      {{ t.wishes.savedIn(WINDOW_LABELS[view.window] ?? view.window, view.version) }}
    </p>

    <p v-if="view.groups.length === 0 && view.fixed.length === 0">
      {{ t.wishes.nothingOffered }}
    </p>
    <form @submit.prevent="save">
      <section
        v-for="d in days"
        :key="d.day"
      >
        <h2>{{ formatDay(d.day) }}</h2>
        <ul
          v-if="d.fixed.length > 0"
          class="plain"
        >
          <li
            v-for="item in d.fixed"
            :key="item.id"
          >
            <strong>{{ item.title }}</strong> · {{ t.wishes.fixedForYourClass }}
            <span
              v-if="item.feeCents > 0"
              class="muted"
            > · {{ t.common.field.fee }} {{ formatFee(item.feeCents) }}</span>
          </li>
        </ul>
        <fieldset
          v-for="group in d.groups"
          :key="group.key"
          class="field"
          :disabled="!editable"
        >
          <legend>{{ formatSpanOnGrid(grid, group.startsAt, group.endsAt) }} · {{ t.wishes.groupCount(wishesOf(group), group.required) }}</legend>
          <table class="table">
            <thead>
              <tr>
                <th scope="col">
                  {{ t.wishes.wish }}
                </th>
                <th scope="col">
                  {{ t.common.field.item }}
                </th>
                <th scope="col">
                  {{ t.common.field.places }}
                </th>
                <th scope="col">
                  {{ t.common.field.fee }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in group.items"
                :key="item.id"
              >
                <td>
                  <select
                    :aria-label="t.wishes.wishFor(item.title)"
                    :value="rankOf(group, item)"
                    @change="setRank(group, item, Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option :value="0">
                      –
                    </option>
                    <option
                      v-for="n in view.cap"
                      :key="n"
                      :value="n"
                    >
                      {{ n }}.
                    </option>
                  </select>
                </td>
                <td>
                  <strong>{{ item.title }}</strong>
                  <p
                    v-if="item.description"
                    class="muted"
                  >
                    {{ item.description }}
                  </p>
                </td>
                <td>{{ item.places }}</td>
                <td>{{ formatFee(item.feeCents) }}</td>
              </tr>
            </tbody>
          </table>
        </fieldset>
      </section>
      <p
        v-if="onBehalf && editable"
        class="field"
      >
        <label for="reason">{{ t.common.field.reason }}</label>
        <input
          id="reason"
          v-model="reason"
          required
          maxlength="500"
        >
      </p>
      <ul
        v-if="problems.length > 0"
        class="alert"
        role="alert"
      >
        <li
          v-for="problem in problems"
          :key="problem"
        >
          {{ problem }}
        </li>
      </ul>
      <p
        v-else-if="saving.error.value"
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
      <p
        v-if="editable && view.groups.length > 0"
        class="actions"
      >
        <button
          v-if="onBehalf"
          type="submit"
          :disabled="saving.busy.value"
        >
          {{ t.wishes.saveWishes }}
        </button>
        <span class="muted">{{ complete ? t.wishes.allGroupsComplete : t.wishes.wishesMissing }}{{ onBehalf ? '' : ` ${t.wishes.savedAtOnce}` }}</span>
      </p>
    </form>

    <section v-if="onBehalf && editable && view.fixed.length > 0">
      <h2>{{ t.wishes.exemptions.title }}</h2>
      <ul class="plain">
        <li
          v-for="item in view.fixed"
          :key="item.id"
        >
          {{ item.title }}
          <button
            type="button"
            class="ghost"
            @click="exempting = item; exemptReason = ''"
          >
            {{ t.wishes.exemptions.exempt }}
          </button>
        </li>
      </ul>
      <form
        v-if="exempting"
        class="panel"
        :aria-label="t.wishes.exemptions.from(exempting.title)"
        @submit.prevent="exempt"
      >
        <h3>{{ t.wishes.exemptions.from(exempting.title) }}</h3>
        <p class="muted">
          {{ t.wishes.exemptions.thenChooses(view.student.displayName) }}
        </p>
        <p class="field">
          <label for="exempt-reason">{{ t.common.field.reason }}</label>
          <input
            id="exempt-reason"
            v-model="exemptReason"
            required
            maxlength="500"
          >
        </p>
        <p class="actions">
          <button
            type="submit"
            :disabled="saving.busy.value"
          >
            {{ t.wishes.exemptions.exempt }}
          </button>
          <button
            type="button"
            class="ghost"
            @click="exempting = null"
          >
            {{ t.common.cancel }}
          </button>
        </p>
      </form>
    </section>
  </template>
</template>
