<script setup lang="ts">
// One import: what it would change against the list in force, what is
// wrong with it, and the decision: it becomes the list, or it is set aside.

import { computed, onMounted, ref, watch } from 'vue'
import { commitBatch, discardBatch, loadBatch, type BatchDetail, type StoredEntry } from '../lib/admin-api.ts'
import { formatWhen, useFeedback } from '../lib/feedback.ts'
import { BATCH_STATE_LABELS, FIELD_LABELS, KIND_LABELS, PROBLEM_LABELS, SOURCE_LABELS, WARNING_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string }>()
usePageTitle(() => 'Import')

const batch = ref<BatchDetail | null>(null)
const loading = useFeedback()
const decision = useFeedback()

async function load(): Promise<void> {
  await loading.run(async () => {
    batch.value = await loadBatch(props.id)
  })
}
onMounted(load)
watch(() => props.id, load)

async function onCommit(): Promise<void> {
  await decision.run(async () => {
    batch.value = await commitBatch(props.id)
  }, 'Die Liste gilt jetzt.')
}

async function onDiscard(): Promise<void> {
  await decision.run(async () => {
    batch.value = await discardBatch(props.id)
  }, 'Der Import wurde verworfen.')
}

/** A name a problem's key belongs to, where the batch has the entry; the key itself otherwise. */
const names = computed(() => {
  const map = new Map<string, string>()
  for (const entry of [...(batch.value?.diff.added ?? []), ...(batch.value?.diff.changed.map((c) => c.after) ?? [])]) {
    const key = entry.oid ?? entry.mail?.toLowerCase() ?? entry.upn?.toLowerCase()
    if (key !== undefined) map.set(key, entry.displayName)
  }
  return map
})

function describe(entry: StoredEntry): string {
  const kind = KIND_LABELS[entry.kind] ?? entry.kind
  return entry.kind === 'student' && entry.className ? `${kind}, ${entry.className}` : kind
}

function field(entry: StoredEntry, name: string): string {
  const value = entry[name as keyof StoredEntry]
  if (value === undefined || value === null) return '–'
  if (name === 'kind') return KIND_LABELS[String(value)] ?? String(value)
  return String(value)
}
</script>

<template>
  <p>
    <RouterLink to="/verwaltung/stammdaten">
      ← Stammdaten
    </RouterLink>
  </p>
  <h1>Import</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <template v-if="batch">
    <dl>
      <dt>Stand</dt>
      <dd><span :class="['badge', `badge-${batch.state}`]">{{ BATCH_STATE_LABELS[batch.state] ?? batch.state }}</span></dd>
      <dt>Quelle</dt>
      <dd>{{ SOURCE_LABELS[batch.source] ?? batch.source }}</dd>
      <dt>Schuljahr</dt>
      <dd>{{ batch.schoolYear }}</dd>
      <dt>Gelesen</dt>
      <dd>{{ formatWhen(batch.fetchedAt) }} von {{ batch.triggeredBy }}</dd>
      <dt>Personen</dt>
      <dd>{{ batch.rowCount }}</dd>
      <dt v-if="batch.decidedAt">
        Entschieden
      </dt>
      <dd v-if="batch.decidedAt">
        {{ formatWhen(batch.decidedAt) }}
      </dd>
    </dl>

    <section v-if="batch.problems.length > 0">
      <h2>Probleme</h2>
      <p>Die Liste wurde abgelehnt. Beheben Sie die Probleme in der Quelle und importieren Sie noch einmal.</p>
      <ul>
        <li
          v-for="(problem, i) in batch.problems"
          :key="i"
        >
          {{ PROBLEM_LABELS[problem.code] ?? problem.code }}<template v-if="problem.line !== undefined">
            – Zeile {{ problem.line }}
          </template><template v-if="problem.key !== undefined">
            – {{ names.get(problem.key) ?? problem.key }}
          </template>
        </li>
      </ul>
    </section>

    <section v-if="batch.warnings.length > 0">
      <h2>Hinweise</h2>
      <ul>
        <li
          v-for="(warning, i) in batch.warnings"
          :key="i"
        >
          {{ names.get(warning.key) ?? warning.key }}: {{ WARNING_LABELS[warning.code] ?? warning.code }}
        </li>
      </ul>
    </section>

    <section v-if="batch.state !== 'rejected'">
      <h2>Änderungen gegenüber der aktuellen Liste</h2>
      <p>
        {{ batch.summary.added }} neu, {{ batch.summary.removed }} entfernt, {{ batch.summary.changed }} geändert, {{ batch.summary.unchanged }} unverändert.
      </p>
      <p
        v-if="batch.state === 'pending'"
        class="actions"
      >
        <button
          type="button"
          :disabled="decision.busy.value"
          @click="onCommit"
        >
          Übernehmen
        </button>
        <button
          type="button"
          class="ghost"
          :disabled="decision.busy.value"
          @click="onDiscard"
        >
          Verwerfen
        </button>
      </p>
      <p
        v-if="decision.error.value"
        role="alert"
        class="alert"
      >
        {{ decision.error.value }}
      </p>
      <p
        v-if="decision.notice.value"
        role="status"
        class="notice"
      >
        {{ decision.notice.value }}
      </p>

      <h3 v-if="batch.diff.added.length > 0">
        Neu
      </h3>
      <table
        v-if="batch.diff.added.length > 0"
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              Name
            </th>
            <th scope="col">
              Art, Klasse
            </th>
            <th scope="col">
              E-Mail
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in batch.diff.added"
            :key="entry.id"
          >
            <td>{{ entry.displayName }}</td>
            <td>{{ describe(entry) }}</td>
            <td>{{ entry.mail ?? entry.upn ?? '–' }}</td>
          </tr>
        </tbody>
      </table>

      <h3 v-if="batch.diff.removed.length > 0">
        Entfernt
      </h3>
      <table
        v-if="batch.diff.removed.length > 0"
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              Name
            </th>
            <th scope="col">
              Art, Klasse
            </th>
            <th scope="col">
              E-Mail
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in batch.diff.removed"
            :key="entry.id"
          >
            <td>{{ entry.displayName }}</td>
            <td>{{ describe(entry) }}</td>
            <td>{{ entry.mail ?? entry.upn ?? '–' }}</td>
          </tr>
        </tbody>
      </table>

      <h3 v-if="batch.diff.changed.length > 0">
        Geändert
      </h3>
      <table
        v-if="batch.diff.changed.length > 0"
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              Name
            </th>
            <th scope="col">
              Änderung
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="change in batch.diff.changed"
            :key="change.key"
          >
            <td>{{ change.after.displayName }}</td>
            <td>
              <ul class="plain">
                <li
                  v-for="name in change.fields"
                  :key="name"
                >
                  {{ FIELD_LABELS[name] ?? name }}: {{ field(change.before, name) }} → {{ field(change.after, name) }}
                </li>
              </ul>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</template>
