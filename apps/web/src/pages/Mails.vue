<script setup lang="ts">
// The mails: the sending's pace, what waits and until when, and the pause
// (from GET /api/admin/mail/status); below it every mail SchulWahl sent or
// will send, filtered by state, kind and registration, without subject or
// text. An organizer or the administration takes waiting mails out of the
// queue (an opening nobody meant, a text with a mistake) and sends a
// failed or discarded one again, as a copy that takes its turn anew.

import type { MailKind, MailState } from '@school-allocation/api-contracts'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadCampaigns } from '../lib/campaigns-api.ts'
import { discardMails, loadMailQueue, loadMailStatus, retryMail, setMailPaused, type MailStatusResponse, type QueueMail } from '../lib/admin-api.ts'
import { formatWhen, useFeedback } from '../lib/feedback.ts'
import { t } from '../lib/i18n.ts'
import { MAIL_KIND_LABELS, MAIL_STATE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => t.common.page.mails)
const route = useRoute()
const mayEdit = computed(() => (session.value?.roles ?? []).some((role) => role === 'school_admin' || role === 'campaign_organizer'))

const STATES: readonly MailState[] = ['queued', 'sending', 'sent', 'failed', 'expired']
const KINDS: readonly MailKind[] = ['choice_invitation', 'choice_reminder', 'grace_invitation', 'grace_reminder', 'missed_deadline', 'class_missing', 'result_published', 'class_unplaced', 'item_cancelled', 'swap_confirmed', 'assignment_changed']
const LIMIT = 200

const status = ref<MailStatusResponse | null>(null)
const campaigns = ref<{ id: string, name: string }[]>([])
const mails = ref<QueueMail[]>([])
const total = ref(0)
const selected = ref<Set<string>>(new Set())
const loading = useFeedback()
const acting = useFeedback()

// The filter: the registration may come with the link from a registration's page.
const stateFilter = ref<MailState | ''>('')
const kindFilter = ref<MailKind | ''>('')
const campaignFilter = ref(typeof route.query.campaign === 'string' ? route.query.campaign : '')

async function loadList(): Promise<void> {
  const result = await loadMailQueue({
    limit: String(LIMIT),
    ...(stateFilter.value === '' ? {} : { state: stateFilter.value }),
    ...(kindFilter.value === '' ? {} : { kind: kindFilter.value }),
    ...(campaignFilter.value === '' ? {} : { campaignId: campaignFilter.value }),
  })
  mails.value = result.mails
  total.value = result.total
  selected.value = new Set([...selected.value].filter((id) => result.mails.some((mail) => mail.id === id && mail.state === 'queued')))
}

onMounted(() => loading.run(async () => {
  const [sending, list] = [await loadMailStatus(), await loadCampaigns()]
  status.value = sending
  campaigns.value = list.campaigns.map((c) => ({ id: c.id, name: c.name }))
  await loadList()
}))

async function onFilter(): Promise<void> {
  await loading.run(loadList)
}

/** What waits, in a sentence; none when nothing does. */
const waiting = computed(() => {
  const w = status.value?.waiting
  if (!w || w.personal + w.staff + w.students === 0) return t.mailTemplates.sending.none
  return t.mailTemplates.sending.waiting(w.personal, w.staff, w.students)
})

async function onPause(paused: boolean): Promise<void> {
  await acting.run(async () => {
    status.value = await setMailPaused(paused)
  }, paused ? t.mailTemplates.sending.pausedDone : t.mailTemplates.sending.resumedDone)
}

/** A mail's state as the page says it: a discarded one by that word, the rest by the catalogue's. */
function stateOf(mail: QueueMail): string {
  if (mail.state === 'expired' && mail.detail === 'discarded') return t.mails.discardedState
  return MAIL_STATE_LABELS[mail.state] ?? mail.state
}

const waitingShown = computed(() => mails.value.filter((mail) => mail.state === 'queued'))
const campaignName = computed(() => campaigns.value.find((c) => c.id === campaignFilter.value)?.name ?? null)

function toggle(id: string, checked: boolean): void {
  const next = new Set(selected.value)
  if (checked) next.add(id)
  else next.delete(id)
  selected.value = next
}

function selectAll(all: boolean): void {
  selected.value = new Set(all ? waitingShown.value.map((mail) => mail.id) : [])
}

async function afterChange(): Promise<void> {
  status.value = await loadMailStatus()
  await loadList()
}

async function onDiscardSelected(): Promise<void> {
  const ids = [...selected.value]
  if (ids.length === 0 || !window.confirm(t.mails.discardConfirm(ids.length))) return
  let discarded = 0
  const ok = await acting.run(async () => {
    discarded = (await discardMails({ ids })).discarded
    await afterChange()
  })
  if (ok) acting.notice.value = t.mails.discarded(discarded)
}

/** Every waiting mail of the registration the filter names, the ones past the list's limit included. */
async function onDiscardCampaign(): Promise<void> {
  const campaignId = campaignFilter.value
  const count = stateFilter.value === '' || stateFilter.value === 'queued' ? total.value : waitingShown.value.length
  if (campaignId === '' || !window.confirm(t.mails.discardConfirm(count))) return
  let discarded = 0
  const ok = await acting.run(async () => {
    discarded = (await discardMails({ campaignId })).discarded
    await afterChange()
  })
  if (ok) acting.notice.value = t.mails.discarded(discarded)
}

async function onRetry(id: string): Promise<void> {
  await acting.run(async () => {
    await retryMail(id)
    await afterChange()
  }, t.mails.retried)
}
</script>

<template>
  <p>
    <RouterLink to="/verwaltung">
      ← {{ t.common.page.admin }}
    </RouterLink>
  </p>
  <h1>{{ t.common.page.mails }}</h1>
  <p
    v-if="!mayEdit"
    role="alert"
  >
    {{ t.mails.editorsOnly }}
  </p>
  <template v-else>
    <p>{{ t.mails.intro }}</p>
    <p
      v-if="loading.error.value"
      role="alert"
      class="alert"
    >
      {{ loading.error.value }}
    </p>
    <p
      v-if="acting.error.value"
      role="alert"
      class="alert"
    >
      {{ acting.error.value }}
    </p>
    <p
      v-if="acting.notice.value"
      role="status"
      class="notice"
    >
      {{ acting.notice.value }}
    </p>
    <section
      v-if="status"
      aria-labelledby="sending"
    >
      <h2 id="sending">
        {{ t.mailTemplates.sending.heading }}
      </h2>
      <p
        v-if="status.perHour === null"
        class="notice"
      >
        {{ t.mailTemplates.mailOff }}
      </p>
      <p v-else>
        {{ t.mailTemplates.sending.pace(status.perHour) }}
      </p>
      <p
        v-if="status.paused"
        class="notice"
      >
        {{ t.mailTemplates.sending.paused }}
      </p>
      <p v-else>
        {{ t.mailTemplates.sending.pauseHint }}
      </p>
      <p>{{ waiting }}</p>
      <p v-if="status.expectedEndAt">
        {{ t.mailTemplates.sending.expectedEnd(formatWhen(status.expectedEndAt)) }}
      </p>
      <p class="actions">
        <button
          type="button"
          :class="status.paused ? undefined : 'ghost'"
          :disabled="acting.busy.value"
          @click="onPause(!status.paused)"
        >
          {{ status.paused ? t.mailTemplates.sending.resume : t.mailTemplates.sending.pause }}
        </button>
      </p>
    </section>
    <section>
      <h2>{{ t.mails.heading }}</h2>
      <form
        class="filters"
        :aria-label="t.mails.heading"
        @submit.prevent="onFilter"
      >
        <p class="field">
          <label for="mails-state">{{ t.mails.filter.state }}</label>
          <select
            id="mails-state"
            v-model="stateFilter"
          >
            <option value="">
              {{ t.mails.filter.all }}
            </option>
            <option
              v-for="state in STATES"
              :key="state"
              :value="state"
            >
              {{ MAIL_STATE_LABELS[state] ?? state }}
            </option>
          </select>
        </p>
        <p class="field">
          <label for="mails-kind">{{ t.mails.filter.kind }}</label>
          <select
            id="mails-kind"
            v-model="kindFilter"
          >
            <option value="">
              {{ t.mails.filter.all }}
            </option>
            <option
              v-for="kind in KINDS"
              :key="kind"
              :value="kind"
            >
              {{ MAIL_KIND_LABELS[kind] ?? kind }}
            </option>
          </select>
        </p>
        <p class="field">
          <label for="mails-campaign">{{ t.mails.filter.campaign }}</label>
          <select
            id="mails-campaign"
            v-model="campaignFilter"
          >
            <option value="">
              {{ t.mails.filter.all }}
            </option>
            <option
              v-for="c in campaigns"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select>
        </p>
        <p class="actions">
          <button
            type="submit"
            :disabled="loading.busy.value"
          >
            {{ t.mails.filter.apply }}
          </button>
        </p>
      </form>
      <p v-if="mails.length === 0 && !loading.busy.value">
        {{ t.mails.none }}
      </p>
      <template v-else>
        <p class="muted">
          {{ t.mails.shown(mails.length, total) }}
        </p>
        <p
          v-if="waitingShown.length > 0"
          class="actions"
        >
          <button
            type="button"
            class="ghost"
            @click="selectAll(true)"
          >
            {{ t.mails.selectAll }}
          </button>
          <button
            type="button"
            class="ghost"
            @click="selectAll(false)"
          >
            {{ t.mails.selectNone }}
          </button>
          <button
            type="button"
            :disabled="selected.size === 0 || acting.busy.value"
            @click="onDiscardSelected"
          >
            {{ t.mails.discardSelected(selected.size) }}
          </button>
          <button
            v-if="campaignName !== null"
            type="button"
            class="ghost"
            :disabled="acting.busy.value"
            @click="onDiscardCampaign"
          >
            {{ t.mails.discardCampaign(campaignName) }}
          </button>
        </p>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">
                <span class="visually-hidden">{{ t.mails.selectAll }}</span>
              </th>
              <th scope="col">
                {{ t.mails.column.kind }}
              </th>
              <th scope="col">
                {{ t.mails.column.campaign }}
              </th>
              <th scope="col">
                {{ t.mails.column.to }}
              </th>
              <th scope="col">
                {{ t.mails.column.state }}
              </th>
              <th scope="col">
                {{ t.mails.column.created }}
              </th>
              <th scope="col">
                {{ t.mails.column.detail }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="mail in mails"
              :key="mail.id"
            >
              <td>
                <input
                  v-if="mail.state === 'queued'"
                  type="checkbox"
                  :checked="selected.has(mail.id)"
                  :aria-label="t.mails.select(mail.to)"
                  @change="toggle(mail.id, ($event.target as HTMLInputElement).checked)"
                >
              </td>
              <td>{{ MAIL_KIND_LABELS[mail.kind] ?? mail.kind }}</td>
              <td>{{ mail.campaignName ?? t.mails.noCampaign }}</td>
              <td>{{ mail.to }}</td>
              <td>
                {{ stateOf(mail) }}
                <button
                  v-if="mail.state === 'failed' || (mail.state === 'expired' && mail.detail === 'discarded')"
                  type="button"
                  class="ghost small"
                  :disabled="acting.busy.value"
                  @click="onRetry(mail.id)"
                >
                  {{ t.mails.retry }}
                </button>
              </td>
              <td>{{ formatWhen(mail.createdAt) }}</td>
              <td class="muted">
                {{ mail.detail ?? '' }}
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>
  </template>
</template>
