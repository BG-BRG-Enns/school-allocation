<script setup lang="ts">
// Begleitung gesucht (the school's wish 6): per project day the activities
// that still seek a companion and the ones the teacher accompanies, with
// the teacher's own availability on the day; "Ich begleite" joins,
// "Austragen" leaves until the registration opens, else the reason it is
// not possible. The server decides (companions endpoints); the page says
// what it answered. Organizers see the list too; only a teacher of the
// roster joins.

import { computed, onMounted, ref } from 'vue'
import { joinItem, leaveItem, loadCampaign, loadCompanions, type CampaignView, type CompanionsItemView, type CompanionsResponse } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, formatSpan } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { AVAILABILITY_LABELS, COMPANION_PROBLEM_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string }>()
usePageTitle(() => t.common.page.companions)

const view = ref<CampaignView | null>(null)
const list = ref<CompanionsResponse | null>(null)
const loading = useFeedback()
const action = useFeedback()

async function load(): Promise<void> {
  await loading.run(async () => {
    const [v, l] = await Promise.all([loadCampaign(props.id), loadCompanions(props.id)])
    view.value = v
    list.value = l
  })
}
onMounted(load)

const campaign = computed(() => view.value?.campaign)
const empty = computed(() => (list.value?.days ?? []).every((day) => day.items.length === 0))

/** When the activity takes place, its sessions one after the other. */
function whenText(item: CompanionsItemView): string {
  return item.sessions.map((s) => formatSpan(s.startsAt, s.endsAt)).join(' · ')
}

/** The line of the companions: "noch 1 gesucht" or that they are complete, with the count named of wanted. */
function soughtText(item: CompanionsItemView): string {
  return `${t.campaign.items.companionsOf(item.named, item.wanted)} · ${item.sought > 0 ? t.item.teachers.sought(item.sought) : t.item.teachers.complete}`
}

async function join(item: CompanionsItemView): Promise<void> {
  const ok = await action.run(async () => {
    await joinItem(item.id)
  }, t.companions.joined)
  if (ok) list.value = await loadCompanions(props.id)
}

async function leave(item: CompanionsItemView): Promise<void> {
  const ok = await action.run(async () => {
    await leaveItem(item.id)
  }, t.companions.left)
  if (ok) list.value = await loadCompanions(props.id)
}
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← {{ t.common.backToCampaign }}
    </RouterLink>
  </p>
  <h1>{{ t.companions.heading }}</h1>
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
  <template v-if="campaign && list">
    <p class="muted">
      {{ campaign.name }}
    </p>
    <p
      v-if="!list.mayJoin"
      class="notice"
    >
      {{ t.companions.teachersOnly }}
    </p>
    <p v-else>
      {{ t.companions.intro }}
    </p>
    <p v-if="empty">
      {{ t.companions.none }}
    </p>
    <section
      v-for="day in list.days"
      v-else
      :key="day.date"
      :aria-label="formatDay(day.date)"
    >
      <h2>{{ formatDay(day.date) }}</h2>
      <p
        v-if="list.mayJoin"
        class="muted"
      >
        {{ t.companions.myStatus(AVAILABILITY_LABELS[day.myStatus] ?? day.myStatus) }}
      </p>
      <p v-if="day.items.length === 0">
        {{ t.companions.noneOnDay }}
      </p>
      <table
        v-else
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              {{ t.common.field.sessions }}
            </th>
            <th scope="col">
              {{ t.item.title }}
            </th>
            <th scope="col">
              {{ t.common.field.teachers }}
            </th>
            <th scope="col">
              <span class="visually-hidden">{{ t.companions.join }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in day.items"
            :key="item.id"
          >
            <td>{{ whenText(item) }}</td>
            <td>
              <template v-if="item.number !== null">
                {{ item.number }} ·
              </template>
              {{ item.title }}
              <p
                v-if="item.state === 'proposed'"
                class="muted short"
              >
                {{ t.companions.notApproved }}
              </p>
            </td>
            <td>
              {{ t.item.participants.lead(item.lead.shortName ?? item.lead.displayName) }}
              <p class="muted short">
                {{ soughtText(item) }}
              </p>
            </td>
            <td>
              <template v-if="item.leading">
                {{ t.companions.leading }}
              </template>
              <template v-else-if="item.accompanying">
                {{ t.companions.accompanying }}
                <button
                  v-if="item.mayLeave"
                  type="button"
                  class="ghost"
                  :disabled="action.busy.value"
                  :aria-label="`${t.companions.leave}: ${item.title}`"
                  @click="leave(item)"
                >
                  {{ t.companions.leave }}
                </button>
              </template>
              <button
                v-else-if="item.join.ok"
                type="button"
                :disabled="action.busy.value"
                :aria-label="`${t.companions.join}: ${item.title}`"
                @click="join(item)"
              >
                {{ t.companions.join }}
              </button>
              <span
                v-else-if="item.join.problem"
                class="muted"
              >
                {{ COMPANION_PROBLEM_LABELS[item.join.problem] ?? item.join.problem }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</template>
