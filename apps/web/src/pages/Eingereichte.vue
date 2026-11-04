<script setup lang="ts">
// Reviewing the submitted activities one after the other (the school's
// wish 2): by the first submission, the earliest first, each with everything
// it says and, beside it, Plätze und Bedarf without and with it, the cells
// it serves marked; what it brings, its class conflicts, the lead's
// availability; approve, return with a note, withdraw with a reason, or
// skip to the next. "3 von 12" says where one is; the overview is a link
// away. Organizers only: every call the page makes is theirs.

import { describeCells, type Period } from '@school-allocation/school-core'
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '../lib/api-rules.ts'
import { loadPeriods } from '../lib/admin-api.ts'
import Collapsible from '../components/Collapsible.vue'
import DemandTable from '../components/DemandTable.vue'
import { approveItem, checkItem, loadCampaign, loadCampaignAvailability, loadCategories, loadDemand, loadItems, loadPlanning, returnItem, withdrawItem, type CampaignView, type Category, type ClassConflictView, type DayDemand, type Item, type ItemCheckResponse, type PlanningResponse } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { datesBetween, formatDay, formatFee, formatSpanOnGrid, formatWhenShort, localDateOf, localTimeOf } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { cellsText } from '../lib/offer-cells.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string }>()
usePageTitle(() => t.review.heading)

const view = ref<CampaignView | null>(null)
const items = ref<Item[]>([])
const demand = ref<DayDemand[]>([])
const grid = ref<Period[]>([])
const categories = ref<Category[]>([])
const limited = ref<{ personId: string, date: string, status: 'unavailable' | 'if_needed' }[]>([])
const planning = ref<PlanningResponse | null>(null)
const check = ref<ItemCheckResponse | null>(null)
const loading = useFeedback()
const checking = useFeedback()
const action = useFeedback()

/** Where in the queue the review stands; a skip moves it on, and past the end it starts the queue over. */
const cursor = ref(0)
/** How many were decided in this visit: "3 von 12" counts them and the ones skipped before the current one. */
const done = ref(0)

async function load(): Promise<void> {
  await loading.run(async () => {
    const [v, list, d, periods, school, availability] = await Promise.all([loadCampaign(props.id), loadItems(props.id), loadDemand(props.id), loadPeriods(), loadCategories(), loadCampaignAvailability(props.id)])
    view.value = v
    items.value = list.items
    demand.value = d.demand
    grid.value = periods.periods
    categories.value = school.categories
    limited.value = availability.limited
  })
  // The planning, for the note that the lead would then lead nothing; the page stands without it.
  try {
    planning.value = await loadPlanning(props.id)
  } catch {
    planning.value = null
  }
}
onMounted(load)
watch(() => props.id, load)

const campaign = computed(() => view.value?.campaign)
/** The submitted activities by their first submission, the earliest first, never submitted last. */
const queue = computed(() => {
  const proposed = items.value.filter((item) => item.state === 'proposed')
  return [...proposed].sort((a, b) => (a.firstProposedAt ?? '\uffff').localeCompare(b.firstProposedAt ?? '\uffff', 'en') || a.createdAt.localeCompare(b.createdAt, 'en'))
})
const at = computed(() => Math.min(cursor.value, Math.max(0, queue.value.length - 1)))
const current = computed(() => queue.value[at.value] ?? null)
/** "3 von 12": the decided ones and the ones before the current one in the queue, of what there was at the start of this visit (and whatever was submitted since). */
const total = computed(() => done.value + queue.value.length)
const position = computed(() => (current.value ? done.value + at.value + 1 : 0))

/** The check of the activity under review: the demand without and with it, the cells it serves, its conflicts. An answer for an activity no longer under review is dropped. */
watch(current, async (item) => {
  check.value = null
  if (!item) return
  await checking.run(async () => {
    try {
      const answer = await checkItem(props.id, { itemId: item.id })
      if (current.value?.id === item.id) check.value = answer
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
    }
  })
}, { immediate: true })

const categoryName = (id: string): string => categories.value.find((c) => c.id === id)?.name ?? '–'

/** The places as the catalogue says them: the capacity, or the whole classes and their extra places. */
function placesText(item: Item): string {
  if (item.fixedClasses.length === 0) return t.catalogue.places(item.places)
  return item.places > 0 ? t.catalogue.fixedAndPlaces(item.fixedClasses.join(', '), item.places) : t.catalogue.fixed(item.fixedClasses.join(', '))
}

/** Who may choose it: the grades, the classes, or everyone. */
function whoText(item: Item): string {
  const parts: string[] = []
  if (item.eligibleGrades.length > 0) parts.push(t.catalogue.grades(item.eligibleGrades))
  if (item.eligibleClasses.length > 0) parts.push(item.eligibleClasses.join(', '))
  return parts.length === 0 ? t.catalogue.allGrades : parts.join(' · ')
}

function creditedText(session: Item['sessions'][number]): string {
  return t.catalogue.credited(session.credits.map((c) => t.common.minutes(c.minutes)).join(' + '))
}

const lead = computed(() => current.value?.teachers.find((teacher) => teacher.lead) ?? null)
const companions = computed(() => (current.value?.teachers ?? []).filter((teacher) => !teacher.lead).map((teacher) => teacher.displayName))

/** The days of the activity its lead is not plainly available on; '' when none. */
const leadLimited = computed(() => {
  const item = current.value
  const who = lead.value
  if (!item || !who) return ''
  const dates = new Set(item.sessions.flatMap((s) => datesBetween(localDateOf(s.startsAt), localDateOf(new Date(Date.parse(s.endsAt) - 1).toISOString()))))
  const days = limited.value.filter((d) => d.personId === who.personId && dates.has(d.date)).map((d) => d.date).sort((a, b) => a.localeCompare(b, 'en'))
  return days.length === 0 ? '' : t.campaign.items.leadLimited(days.map(formatDay).join(', '))
})

/** What the activity brings: the served cells still short of the target, or the word that there are none; the gate's hint for the organizer when the registration locks offers. */
const brings = computed(() => {
  const c = check.value
  const item = current.value
  if (!c || !item) return ''
  if (item.fixedClasses.length > 0 && item.places === 0) return ''
  if (c.served.length === 0) return t.item.gate.servesNothing
  const under = c.served.filter((cell) => !cell.reached)
  return under.length > 0 ? t.campaign.items.brings(cellsText(describeCells(under, c.before))) : t.campaign.items.bringsNothing
})
const conflicts = computed(() => (check.value?.conflicts ?? []).map((c: ClassConflictView) => t.item.conflict(c.className, formatDay(localDateOf(c.startsAt)), localTimeOf(c.startsAt), localTimeOf(c.endsAt), c.title, c.lead.shortName ?? c.lead.displayName)))

/** The lead's only activity that may still take place, and a duty to lead: a note on the return and withdrawal forms, no bar. */
const leadsNothingAfter = computed(() => {
  const item = current.value
  const who = lead.value
  const row = who ? planning.value?.teachers.find((teacher) => teacher.personId === who.personId) : undefined
  if (!item || !who || !row || !row.leadDuty) return ''
  const others = row.days.some((day) => day.leads.some((led) => led.id !== item.id))
  return others ? '' : t.campaign.pending.leadsNothing(row.shortName ?? who.displayName)
})

// The decision: approve at once; return and withdraw ask for their words first; skip moves on.
const asking = ref<'return' | 'withdraw' | null>(null)
const text = ref('')
function ask(kind: 'return' | 'withdraw'): void {
  asking.value = kind
  text.value = ''
}
async function decide(fn: (id: string) => Promise<unknown>, notice: string): Promise<void> {
  const item = current.value
  if (!item) return
  const ok = await action.run(async () => {
    await fn(item.id)
  }, notice)
  if (ok) {
    asking.value = null
    done.value += 1
    // The list and the demand anew: the table counts the one just approved. The cursor stays, so the next one comes up; past the end, the skipped ones come again.
    await load()
    if (cursor.value >= queue.value.length) cursor.value = 0
  }
}
function skip(): void {
  if (!current.value) return
  cursor.value = at.value + 1 >= queue.value.length ? 0 : at.value + 1
  asking.value = null
}
function onSubmitAsking(): void {
  const kind = asking.value
  if (kind === 'return') void decide((id) => returnItem(id, text.value.trim()), t.review.returned)
  if (kind === 'withdraw') void decide((id) => withdrawItem(id, text.value.trim()), t.review.withdrawn)
}
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← {{ t.review.back }}
    </RouterLink>
  </p>
  <h1>{{ t.review.heading }}</h1>
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
  <template v-if="campaign">
    <p class="muted">
      {{ campaign.name }}
    </p>
    <p v-if="!current">
      {{ t.review.none }}
    </p>
    <template v-else>
      <p>
        <strong>{{ t.review.position(position, total) }}</strong>
      </p>
      <section>
        <h2>{{ current.title }}</h2>
        <p
          v-if="current.description"
          class="muted"
        >
          {{ current.description }}
        </p>
        <ul class="plain">
          <li v-if="current.firstProposedAt">
            {{ t.campaign.items.firstProposedAt }}: {{ formatWhenShort(current.firstProposedAt) }}
          </li>
          <li v-if="lead">
            {{ t.item.participants.lead(lead.displayName) }}<template v-if="companions.length > 0">
              · {{ t.item.participants.companions(companions.join(', ')) }}
            </template>
          </li>
          <li
            v-if="leadLimited"
            class="short"
          >
            {{ leadLimited }}
          </li>
          <li
            v-for="s in current.sessions"
            :key="s.id"
          >
            {{ formatSpanOnGrid(grid, s.startsAt, s.endsAt) }}<template v-if="s.location">
              · {{ s.location }}
            </template> · {{ creditedText(s) }}
          </li>
          <li v-if="current.location">
            {{ t.item.location }}: {{ current.location }}
          </li>
          <li>
            {{ placesText(current) }} · {{ t.catalogue.forWhom(whoText(current)) }}<template v-if="current.minParticipants > 0">
              · {{ t.item.participation.minParticipants }} {{ current.minParticipants }}<template v-if="current.cancellableBelowMin">
                · {{ t.item.participation.cancellable }}
              </template>
            </template>
          </li>
          <li v-if="current.feeCents > 0">
            {{ t.catalogue.fee(formatFee(current.feeCents)) }}<template v-if="current.feeNote">
              · {{ current.feeNote }}
            </template>
          </li>
          <li v-if="current.categoryIds.length > 0">
            {{ t.item.categories.heading }}: {{ current.categoryIds.map(categoryName).join(', ') }}
          </li>
          <li v-if="current.reviewNote">
            {{ t.campaign.items.reviewNote(current.reviewNote) }}
          </li>
        </ul>
        <p
          v-if="brings"
          class="notice"
        >
          {{ brings }}
        </p>
        <p
          v-for="line in conflicts"
          :key="line"
          class="alert"
          role="status"
        >
          {{ line }}
        </p>
        <p class="actions">
          <button
            type="button"
            :disabled="action.busy.value"
            @click="decide(approveItem, t.campaign.items.approved)"
          >
            {{ t.campaign.items.approve }}
          </button>
          <button
            v-if="campaign.state === 'catalogue'"
            type="button"
            class="ghost"
            :disabled="action.busy.value"
            @click="ask('return')"
          >
            {{ t.campaign.items.return }}
          </button>
          <button
            type="button"
            class="ghost"
            :disabled="action.busy.value"
            @click="ask('withdraw')"
          >
            {{ t.campaign.items.withdraw }}
          </button>
          <button
            type="button"
            class="ghost"
            :disabled="action.busy.value || queue.length < 2"
            @click="skip"
          >
            {{ t.review.skip }}
          </button>
          <RouterLink
            class="button ghost-link"
            :to="`/wahlen/${props.id}/aktivitaet/${current.id}`"
          >
            {{ t.common.edit }}
          </RouterLink>
        </p>
        <form
          v-if="asking"
          class="panel"
          :aria-label="asking === 'return' ? t.campaign.pending.returnTitle(current.title) : t.campaign.pending.withdrawTitle(current.title)"
          @submit.prevent="onSubmitAsking"
        >
          <h3>{{ asking === 'return' ? t.campaign.pending.returnTitle(current.title) : t.campaign.pending.withdrawTitle(current.title) }}</h3>
          <p
            v-if="leadsNothingAfter"
            class="notice"
          >
            {{ leadsNothingAfter }}
          </p>
          <p class="field">
            <label for="review-text">{{ asking === 'return' ? t.campaign.pending.returnNote : t.common.field.reason }}</label>
            <input
              id="review-text"
              v-model="text"
              required
              maxlength="500"
            >
          </p>
          <p class="actions">
            <button
              type="submit"
              :disabled="action.busy.value"
            >
              {{ asking === 'return' ? t.campaign.items.return : t.campaign.items.withdraw }}
            </button>
            <button
              type="button"
              class="ghost"
              @click="asking = null"
            >
              {{ t.common.cancel }}
            </button>
          </p>
        </form>
      </section>
      <section v-if="check">
        <Collapsible
          id="review:before"
          :heading="t.review.before"
        >
          <DemandTable
            :demand="check.before"
            :percent="campaign.placeHeadroomPercent"
            :highlight="check.served"
          />
        </Collapsible>
        <Collapsible
          id="review:after"
          :heading="t.review.after"
        >
          <DemandTable
            :demand="check.after"
            :percent="campaign.placeHeadroomPercent"
            :highlight="check.served"
          />
        </Collapsible>
      </section>
      <p
        v-else-if="checking.busy.value"
        class="muted"
      >
        {{ t.review.checking }}
      </p>
    </template>
  </template>
</template>
