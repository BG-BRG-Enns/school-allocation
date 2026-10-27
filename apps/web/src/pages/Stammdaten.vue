<script setup lang="ts">
// The roster: which list is in force, the Entra groups the import reads,
// a refresh from them, a CSV upload, and the imports so far. A new import
// goes to its own page, where the diff is shown and the decision made.

import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { csvTemplatePath, graphStartPath, loadRoster, saveGroups, uploadCsv, type RosterGroup, type RosterOverview } from '../lib/admin-api.ts'
import { withBase } from '../lib/base.ts'
import { formatWhen, useFeedback } from '../lib/feedback.ts'
import { BATCH_STATE_LABELS, KIND_LABELS, REFRESH_ERROR_LABELS, SOURCE_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

usePageTitle(() => 'Stammdaten')
const route = useRoute()
const router = useRouter()

const overview = ref<RosterOverview | null>(null)
const loading = useFeedback()
/** What the refresh's callback reported, as its query says. */
const refreshError = computed(() => {
  const code = route.query.fehler
  return typeof code === 'string' ? (REFRESH_ERROR_LABELS[code] ?? REFRESH_ERROR_LABELS.import_failed ?? code) : null
})

interface GroupRow extends RosterGroup {
  key: number
}
const groups = ref<GroupRow[]>([])
const groupsFeedback = useFeedback()
let nextKey = 1

const schoolYear = ref('')
const csvText = ref('')
const csvFeedback = useFeedback()

async function load(): Promise<void> {
  await loading.run(async () => {
    overview.value = await loadRoster()
    groups.value = overview.value.groups.map((group) => ({ ...group, key: nextKey++ }))
    if (schoolYear.value === '') schoolYear.value = overview.value.current?.schoolYear ?? overview.value.suggestedSchoolYear
  })
}
onMounted(load)

function addGroup(): void {
  groups.value.push({ key: nextKey++, groupId: '', label: '', kind: 'student', className: '', grade: undefined })
}

function removeGroup(key: number): void {
  groups.value = groups.value.filter((group) => group.key !== key)
}

async function onSaveGroups(): Promise<void> {
  const payload: RosterGroup[] = groups.value.map((group) => {
    const saved: RosterGroup = { groupId: group.groupId.trim(), label: group.label.trim(), kind: group.kind }
    if (group.kind === 'student') {
      if (group.className?.trim()) saved.className = group.className.trim()
      if (group.grade !== undefined && group.grade !== null && String(group.grade) !== '') saved.grade = Number(group.grade)
    }
    return saved
  })
  await groupsFeedback.run(async () => {
    const saved = await saveGroups(payload)
    groups.value = saved.groups.map((group) => ({ ...group, key: nextKey++ }))
    if (overview.value) overview.value.groups = saved.groups
  }, 'Gruppen gespeichert.')
}

const graphStart = computed(() => withBase(graphStartPath(schoolYear.value)))
const canRefresh = computed(() => (overview.value?.groups.length ?? 0) > 0 && /^\d{4}\/\d{2}$/.test(schoolYear.value))

function onFile(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    csvText.value = typeof reader.result === 'string' ? reader.result : ''
  }
  reader.readAsText(file)
}

async function onUpload(): Promise<void> {
  let id: string | undefined
  const ok = await csvFeedback.run(async () => {
    id = (await uploadCsv(csvText.value, schoolYear.value)).id
  })
  if (ok && id !== undefined) await router.push(`/verwaltung/stammdaten/import/${id}`)
}

function summaryText(batch: RosterOverview['batches'][number]): string {
  if (batch.state === 'rejected') return `${batch.problems.length} Problem${batch.problems.length === 1 ? '' : 'e'}`
  const { added, removed, changed } = batch.summary
  return `+${added} −${removed} ~${changed}`
}
</script>

<template>
  <h1>Stammdaten</h1>
  <p
    v-if="refreshError"
    role="alert"
    class="alert"
  >
    {{ refreshError }}
  </p>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>

  <section v-if="overview">
    <h2>Aktuelle Personenliste</h2>
    <p v-if="!overview.current">
      Noch keine Personenliste übernommen. Importieren Sie die Personen aus den Entra-Gruppen oder aus einer CSV-Datei.
    </p>
    <dl v-else>
      <dt>Übernommen</dt>
      <dd>{{ formatWhen(overview.current.decidedAt) }}</dd>
      <dt>Quelle</dt>
      <dd>{{ SOURCE_LABELS[overview.current.source] ?? overview.current.source }}</dd>
      <dt>Schuljahr</dt>
      <dd>{{ overview.current.schoolYear }}</dd>
      <dt>Personen</dt>
      <dd>{{ overview.current.rowCount }}</dd>
    </dl>
  </section>

  <section v-if="overview">
    <h2>Entra-Gruppen</h2>
    <p>Die Gruppen der Schule, aus denen die Personenliste gelesen wird: je Klasse eine Schülergruppe mit Klasse und Schulstufe, dazu die Gruppe der Lehrkräfte. Die Gruppen-ID steht in Entra bei der Gruppe (Objekt-ID).</p>
    <form @submit.prevent="onSaveGroups">
      <table
        v-if="groups.length > 0"
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              Gruppen-ID
            </th>
            <th scope="col">
              Bezeichnung
            </th>
            <th scope="col">
              Art
            </th>
            <th scope="col">
              Klasse
            </th>
            <th scope="col">
              Schulstufe
            </th>
            <th scope="col">
              <span class="visually-hidden">Entfernen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="group in groups"
            :key="group.key"
          >
            <td>
              <input
                v-model="group.groupId"
                :aria-label="`Gruppen-ID ${group.label || 'neue Gruppe'}`"
                required
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                size="36"
              >
            </td>
            <td>
              <input
                v-model="group.label"
                :aria-label="`Bezeichnung ${group.groupId || 'neue Gruppe'}`"
                required
                maxlength="200"
              >
            </td>
            <td>
              <select
                v-model="group.kind"
                :aria-label="`Art ${group.label || 'neue Gruppe'}`"
              >
                <option value="student">
                  {{ KIND_LABELS.student }}
                </option>
                <option value="teacher">
                  {{ KIND_LABELS.teacher }}
                </option>
              </select>
            </td>
            <td>
              <input
                v-model="group.className"
                :aria-label="`Klasse ${group.label || 'neue Gruppe'}`"
                :disabled="group.kind !== 'student'"
                :required="group.kind === 'student'"
                maxlength="16"
                size="6"
              >
            </td>
            <td>
              <input
                v-model.number="group.grade"
                :aria-label="`Schulstufe ${group.label || 'neue Gruppe'}`"
                :disabled="group.kind !== 'student'"
                :required="group.kind === 'student'"
                type="number"
                min="1"
                max="13"
                size="3"
              >
            </td>
            <td>
              <button
                type="button"
                class="ghost"
                @click="removeGroup(group.key)"
              >
                Entfernen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>
        Noch keine Gruppen eingetragen.
      </p>
      <p class="actions">
        <button
          type="button"
          class="ghost"
          @click="addGroup"
        >
          Gruppe hinzufügen
        </button>
        <button
          type="submit"
          :disabled="groupsFeedback.busy.value"
        >
          Gruppen speichern
        </button>
      </p>
      <p
        v-if="groupsFeedback.error.value"
        role="alert"
        class="alert"
      >
        {{ groupsFeedback.error.value }}
      </p>
      <p
        v-if="groupsFeedback.notice.value"
        role="status"
        class="notice"
      >
        {{ groupsFeedback.notice.value }}
      </p>
    </form>

    <h3>Aus den Entra-Gruppen aktualisieren</h3>
    <p>Sie werden zu Microsoft weitergeleitet und erlauben SchulWahl, mit Ihrem Konto die Mitglieder der Gruppen zu lesen ({{ overview.graphScopes.join(', ') }}). Die Liste wird gelesen und Ihnen zur Prüfung gezeigt, bevor sie gilt.</p>
    <p class="field">
      <label for="school-year">Schuljahr</label>
      <input
        id="school-year"
        v-model="schoolYear"
        pattern="[0-9]{4}/[0-9]{2}"
        placeholder="2026/27"
        size="8"
        required
      >
    </p>
    <p>
      <a
        v-if="canRefresh"
        class="button"
        :href="graphStart"
      >Aus Entra-Gruppen aktualisieren</a>
      <span
        v-else
        class="muted"
      >Tragen Sie zuerst die Gruppen ein und speichern Sie sie.</span>
    </p>
  </section>

  <section v-if="overview">
    <h2>CSV-Datei hochladen</h2>
    <p>
      Eine Zeile je Person mit den Spalten der
      <a :href="withBase(csvTemplatePath)">Vorlage</a>: E-Mail-Adresse, Vorname, Nachname, Klasse, Schulstufe, Art (student oder teacher), optional die E-Mail-Adresse des Klassenvorstands. Trennzeichen Semikolon oder Komma. Die Personen werden beim ersten Anmelden über ihre Schul-E-Mail-Adresse erkannt.
    </p>
    <form @submit.prevent="onUpload">
      <p class="field">
        <label for="csv-file">Datei</label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv,text/plain"
          @change="onFile"
        >
      </p>
      <p class="field">
        <label for="csv-text">Oder Inhalt einfügen</label>
        <textarea
          id="csv-text"
          v-model="csvText"
          rows="6"
          spellcheck="false"
        />
      </p>
      <p class="field">
        <label for="csv-school-year">Schuljahr</label>
        <input
          id="csv-school-year"
          v-model="schoolYear"
          pattern="[0-9]{4}/[0-9]{2}"
          size="8"
          required
        >
      </p>
      <p class="actions">
        <button
          type="submit"
          :disabled="csvFeedback.busy.value || csvText.trim() === ''"
        >
          Importieren
        </button>
      </p>
      <p
        v-if="csvFeedback.error.value"
        role="alert"
        class="alert"
      >
        {{ csvFeedback.error.value }}
      </p>
    </form>
  </section>

  <section v-if="overview && overview.batches.length > 0">
    <h2>Importe</h2>
    <table class="table">
      <thead>
        <tr>
          <th scope="col">
            Gelesen
          </th>
          <th scope="col">
            Quelle
          </th>
          <th scope="col">
            Schuljahr
          </th>
          <th scope="col">
            Personen
          </th>
          <th scope="col">
            Änderungen
          </th>
          <th scope="col">
            Stand
          </th>
          <th scope="col">
            <span class="visually-hidden">Ansehen</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="batch in overview.batches"
          :key="batch.id"
        >
          <td>{{ formatWhen(batch.fetchedAt) }}</td>
          <td>{{ SOURCE_LABELS[batch.source] ?? batch.source }}</td>
          <td>{{ batch.schoolYear }}</td>
          <td>{{ batch.rowCount }}</td>
          <td>{{ summaryText(batch) }}</td>
          <td>
            <span :class="['badge', `badge-${batch.state}`]">{{ BATCH_STATE_LABELS[batch.state] ?? batch.state }}</span>
          </td>
          <td>
            <RouterLink :to="`/verwaltung/stammdaten/import/${batch.id}`">
              Ansehen
            </RouterLink>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
