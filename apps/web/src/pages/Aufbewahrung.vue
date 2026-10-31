<script setup lang="ts">
// Retention (D-15): the school years with their records and when each may
// go; the administrator's purge of one, a year after its end, with a reason
// and the year typed again. Nothing is deleted automatically.

import { computed, onMounted, ref } from 'vue'
import { loadRetention, purgeSchoolYear, type RetentionYear } from '../lib/admin-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDateOf } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { CAMPAIGN_STATE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { isSchoolAdmin, session } from '../lib/session.ts'

usePageTitle(() => t.common.page.retention)
const years = ref<RetentionYear[]>([])
const loading = useFeedback()
const action = useFeedback()
const chosen = ref('')
const confirmYear = ref('')
const reason = ref('')
const removed = ref<{ relation: string, count: number }[] | null>(null)
/** Administrators and auditors read the overview; administrators purge. */
const mayRead = computed(() => isSchoolAdmin.value || (session.value?.roles.includes('read_only_auditor') ?? false))

const candidate = computed(() => years.value.find((y) => y.schoolYear === chosen.value))
const ready = computed(() => candidate.value !== undefined && candidate.value.reached && candidate.value.campaigns.every((c) => c.state === 'archived') && confirmYear.value.trim() === chosen.value && reason.value.trim() !== '')

async function load(): Promise<void> {
  if (!mayRead.value) return
  await loading.run(async () => {
    years.value = (await loadRetention()).years
  })
}
onMounted(load)

async function onPurge(): Promise<void> {
  if (!ready.value) return
  const ok = await action.run(async () => {
    removed.value = (await purgeSchoolYear(chosen.value, reason.value.trim())).removed
  }, t.retention.purged)
  if (ok) {
    chosen.value = ''
    confirmYear.value = ''
    reason.value = ''
    await load()
  }
}
</script>

<template>
  <p>
    <RouterLink to="/verwaltung">
      ← {{ t.common.backToAdmin }}
    </RouterLink>
  </p>
  <h1>{{ t.common.page.retention }}</h1>
  <p
    v-if="!mayRead"
    role="alert"
  >
    {{ t.retention.adminsOnly }}
  </p>
  <template v-else>
    <p class="muted">
      {{ t.retention.intro }}
    </p>
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
    <section>
      <h2>{{ t.retention.years }}</h2>
      <p
        v-if="years.length === 0"
        class="muted"
      >
        {{ t.retention.none }}
      </p>
      <table
        v-else
        class="table"
      >
        <thead>
          <tr>
            <th>{{ t.common.field.schoolYear }}</th>
            <th>{{ t.retention.campaigns }}</th>
            <th>{{ t.retention.batches }}</th>
            <th>{{ t.retention.classTeachers }}</th>
            <th>{{ t.retention.retainedUntil }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="y in years"
            :key="y.schoolYear"
          >
            <td>{{ y.schoolYear }}</td>
            <td>
              <span
                v-if="y.campaigns.length === 0"
                class="muted"
              >–</span>
              <ul
                v-else
                class="plain"
              >
                <li
                  v-for="c in y.campaigns"
                  :key="c.id"
                >
                  {{ c.name }} <span class="badge">{{ CAMPAIGN_STATE_LABELS[c.state] ?? c.state }}</span>
                </li>
              </ul>
            </td>
            <td>{{ y.batches }}</td>
            <td>{{ y.classTeachers }}</td>
            <td>
              {{ formatDateOf(y.retentionEndsAt) }} <span
                v-if="y.reached"
                class="badge"
              >{{ t.retention.expired }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="isSchoolAdmin">
      <h2>{{ t.retention.purge.title }}</h2>
      <form
        :aria-label="t.retention.purge.title"
        @submit.prevent="onPurge"
      >
        <p class="field">
          <label for="purge-year">{{ t.common.field.schoolYear }}</label>
          <select
            id="purge-year"
            v-model="chosen"
            required
          >
            <option value="">
              {{ t.common.pleaseChoose }}
            </option>
            <option
              v-for="y in years"
              :key="y.schoolYear"
              :value="y.schoolYear"
              :disabled="!y.reached || y.campaigns.some((c) => c.state !== 'archived')"
            >
              {{ y.schoolYear }}{{ !y.reached ? ` – ${t.retention.purge.stillRetained}` : y.campaigns.some((c) => c.state !== 'archived') ? ` – ${t.retention.purge.notArchived}` : '' }}
            </option>
          </select>
        </p>
        <p class="field">
          <label for="purge-confirm">{{ t.retention.purge.confirm }}</label>
          <input
            id="purge-confirm"
            v-model="confirmYear"
            type="text"
            placeholder="2026/27"
            required
          >
        </p>
        <p class="field">
          <label for="purge-reason">{{ t.common.field.reason }}</label>
          <input
            id="purge-reason"
            v-model="reason"
            type="text"
            maxlength="500"
            required
          >
        </p>
        <p class="actions">
          <button
            type="submit"
            class="danger"
            :disabled="!ready || action.busy.value"
          >
            {{ t.retention.purge.submit }}
          </button>
        </p>
      </form>
      <div v-if="removed">
        <h3>{{ t.retention.purge.removed }}</h3>
        <ul class="plain">
          <li
            v-for="r in removed"
            :key="r.relation"
          >
            {{ r.relation }}: {{ r.count }}
          </li>
        </ul>
      </div>
    </section>
  </template>
</template>
