<script setup lang="ts">
// The organization's overview of the teachers: per teacher and project day
// their availability, what they lead and what they accompany, or free; who
// leads nothing on any day; a workbook of it. An organizer changes anyone's
// availability here until the registration is archived; the read-only role
// reads along.

import { AVAILABILITY_STATUSES } from '@school-allocation/school-core'
import { computed, onMounted, ref, watch } from 'vue'
import Collapsible from '../components/Collapsible.vue'
import ListFilter from '../components/ListFilter.vue'
import { withBase } from '../lib/base.ts'
import type { AvailabilityImportPreview } from '@school-allocation/api-contracts'
import { setTeacherLeadDuty, setTeacherShortName } from '../lib/admin-api.ts'
import { applyAvailabilityImport, availabilityTemplatePath, loadPlanning, planningExportPath, previewAvailabilityImport, setAvailabilityFor, type AvailabilityStatus, type PlanningResponse } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { filtered, matchesText, useListFilter, type FilterField } from '../lib/list-filter.ts'
import { formatDay } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { AVAILABILITY_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

const props = defineProps<{ id: string }>()

// The teachers filtered by name or abbreviation, and to those not plainly available on some day.
const teacherFilter = useListFilter('planning:teachers', { restricted: false, text: '' })
const teacherFields: FilterField[] = [
  { key: 'restricted', kind: 'check', label: t.filters.onlyRestricted },
  { key: 'text', kind: 'text', label: t.filters.nameOrShortName },
]
const teachersShown = filtered(() => planning.value?.teachers ?? [], teacherFilter, (teacher, f) => (f.restricted !== true || teacher.days.some((day) => day.status !== 'available')) && matchesText([teacher.displayName, teacher.shortName], f.text))

usePageTitle(() => t.common.page.planning)
const planning = ref<PlanningResponse | null>(null)
const loading = useFeedback()
const saving = useFeedback()

// The planning alone: the read-only role reads it in every state, but not the registration's own view before the catalogue is out.
onMounted(() => loading.run(async () => {
  planning.value = await loadPlanning(props.id)
}))

/** Whether the caller changes availability here: an organizer, until the archive. */
const mayOrganize = computed(() => (session.value?.roles ?? []).some((role) => role === 'campaign_organizer' || role === 'school_admin'))
const editable = computed(() => mayOrganize.value && (planning.value?.editable ?? false))

type Day = PlanningResponse['teachers'][number]['days'][number]

/** The activities as "3. Klettern, 7. Wien". */
function named(items: Day['leads']): string {
  return items.map((item) => (item.number === null ? item.title : `${item.number}. ${item.title}`)).join(', ')
}

/** What a teacher does on a day, in a line: leads, accompanies, or free. */
function doing(day: Day): string {
  const parts = [
    ...(day.leads.length > 0 ? [t.planning.leads(named(day.leads))] : []),
    ...(day.accompanies.length > 0 ? [t.planning.accompanies(named(day.accompanies))] : []),
  ]
  return parts.length > 0 ? parts.join('; ') : t.planning.free
}

/** The teachers with a duty to lead who lead nothing on any of the days; the ones without the duty are named apart, so nobody disappears from the overview. */
const leadingNothing = computed(() => (planning.value?.teachers ?? []).filter((teacher) => teacher.leadDuty && teacher.days.every((day) => day.leads.length === 0)).map((teacher) => teacher.displayName))
const withoutDuty = computed(() => (planning.value?.teachers ?? []).filter((teacher) => !teacher.leadDuty).map((teacher) => teacher.displayName))

async function onChange(personId: string, date: string, status: AvailabilityStatus): Promise<void> {
  await saving.run(async () => {
    planning.value = await setAvailabilityFor(props.id, personId, date, status)
  }, t.planning.saved)
}

// One teacher's abbreviation and duty to lead, set beside the name: the row's edit opens a small form; saving reloads the overview.
const editingShortName = ref<{ personId: string, value: string, noDuty: boolean } | null>(null)
function startShortName(teacher: { personId: string, shortName: string | null, leadDuty: boolean }): void {
  editingShortName.value = { personId: teacher.personId, value: teacher.shortName ?? '', noDuty: !teacher.leadDuty }
}
async function onSaveShortName(): Promise<void> {
  const editing = editingShortName.value
  if (!editing) return
  const value = editing.value.trim()
  const ok = await saving.run(async () => {
    await setTeacherShortName(editing.personId, value === '' ? null : value)
    await setTeacherLeadDuty(editing.personId, !editing.noDuty)
    planning.value = await loadPlanning(props.id)
  }, t.planning.shortName.saved)
  if (ok) {
    editingShortName.value = null
    // A checked list may have skipped a row for this very abbreviation: what it would apply has changed, so it is checked again.
    preview.value = null
    latestCheck++
  }
}

// The availability list: a file or pasted text, checked first, then the checked text applied.
const csvText = ref('')
const checkedCsv = ref('')
const preview = ref<AvailabilityImportPreview | null>(null)
const checking = useFeedback()
const applying = useFeedback()
const IMPORT_PROBLEM_LABELS: Readonly<Record<string, string>> = t.labels.availabilityImportProblem
const FILE_PROBLEM_LABELS: Readonly<Record<string, string>> = t.labels.csvFileProblem
let latestCheck = 0

// A text edited after the check is not the one checked: the preview goes until the next check, and a check still
// pending answers for a text no longer shown, so its answer is dropped too.
watch(csvText, (text) => {
  if (text === checkedCsv.value) return
  preview.value = null
  latestCheck++
})

function onFile(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    csvText.value = typeof reader.result === 'string' ? reader.result : ''
  }
  reader.readAsText(file)
}

async function onCheck(): Promise<void> {
  const text = csvText.value
  const check = ++latestCheck
  preview.value = null
  await checking.run(async () => {
    const result = await previewAvailabilityImport(props.id, text)
    if (check !== latestCheck || text !== csvText.value) return
    checkedCsv.value = text
    preview.value = result
  })
}

async function onApply(): Promise<void> {
  const text = checkedCsv.value
  let applied = { changedDays: 0, changedNotes: 0, changedLeadDuty: 0, skipped: 0 }
  const ok = await applying.run(async () => {
    const result = await applyAvailabilityImport(props.id, text)
    planning.value = result.planning
    applied = { changedDays: result.changedDays, changedNotes: result.changedNotes, changedLeadDuty: result.changedLeadDuty, skipped: result.skipped }
  })
  if (ok) {
    applying.notice.value = t.planning.csv.applied(applied.changedDays, applied.changedNotes, applied.skipped, applied.changedLeadDuty)
    preview.value = null
    csvText.value = ''
    checkedCsv.value = ''
  }
}

/** Whether the preview would change anything at all. */
const previewChanges = computed(() => (preview.value?.changedDays ?? 0) > 0 || (preview.value?.changedNotes ?? 0) > 0 || (preview.value?.changedLeadDuty ?? 0) > 0)
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← {{ t.common.backToCampaign }}
    </RouterLink>
  </p>
  <h1>{{ t.common.page.planning }}</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <template v-if="planning">
    <p class="muted">
      {{ planning.name }}
    </p>
    <p>{{ t.planning.intro }}</p>
    <p
      v-if="!planning.editable"
      class="notice"
    >
      {{ t.planning.readOnly }}
    </p>
    <p
      v-if="saving.error.value"
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
    <p class="actions">
      <a
        class="button ghost-link"
        :href="withBase(planningExportPath(props.id))"
      >{{ t.planning.export }}</a>
    </p>
    <p v-if="planning.teachers.length === 0">
      {{ t.planning.none }}
    </p>
    <template v-else>
      <p>{{ leadingNothing.length > 0 ? t.planning.leadsNothing(leadingNothing.join(', ')) : t.planning.everyoneLeads }}</p>
      <p v-if="withoutDuty.length > 0">
        {{ t.planning.withoutDuty(withoutDuty.join(', ')) }}
      </p>
      <ListFilter
        id="teachers"
        v-model="teacherFilter"
        :fields="teacherFields"
        :shown="teachersShown.length"
        :total="planning.teachers.length"
      />
      <table
        v-if="teachersShown.length > 0"
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              {{ t.common.field.name }}
            </th>
            <th
              v-for="date in planning.days"
              :key="date"
              scope="col"
            >
              {{ formatDay(date) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="teacher in teachersShown"
            :key="teacher.personId"
          >
            <th scope="row">
              {{ teacher.displayName }}<template v-if="teacher.shortName !== null">
                ({{ teacher.shortName }})
              </template>
              <form
                v-if="editingShortName?.personId === teacher.personId"
                class="inline-form"
                :aria-label="t.planning.shortName.label(teacher.displayName)"
                @submit.prevent="onSaveShortName"
              >
                <input
                  v-model="editingShortName.value"
                  type="text"
                  maxlength="8"
                  size="8"
                  :aria-label="t.planning.shortName.label(teacher.displayName)"
                  :disabled="saving.busy.value"
                >
                <label>
                  <input
                    v-model="editingShortName.noDuty"
                    type="checkbox"
                    :disabled="saving.busy.value"
                  >
                  {{ t.planning.duty.none }}
                </label>
                <button
                  type="submit"
                  class="small"
                  :disabled="saving.busy.value"
                >
                  {{ t.planning.shortName.save }}
                </button>
                <button
                  type="button"
                  class="ghost small"
                  :disabled="saving.busy.value"
                  @click="editingShortName = null"
                >
                  {{ t.common.cancel }}
                </button>
              </form>
              <button
                v-else-if="editable"
                type="button"
                class="ghost small"
                :aria-label="t.planning.shortName.edit(teacher.displayName)"
                @click="startShortName(teacher)"
              >
                {{ t.common.edit }}
              </button>
              <span
                v-if="!teacher.leadDuty"
                class="muted"
              ><br>{{ t.planning.duty.none }}</span>
              <span
                v-if="teacher.note !== null"
                class="muted"
              ><br>{{ teacher.note }}</span>
            </th>
            <td
              v-for="day in teacher.days"
              :key="day.date"
              :class="{ short: day.status !== 'available' }"
            >
              <select
                v-if="editable"
                :value="day.status"
                :aria-label="t.planning.statusOf(teacher.displayName, formatDay(day.date))"
                :disabled="saving.busy.value"
                @change="onChange(teacher.personId, day.date, ($event.target as HTMLSelectElement).value as AvailabilityStatus)"
              >
                <option
                  v-for="status in AVAILABILITY_STATUSES"
                  :key="status"
                  :value="status"
                >
                  {{ AVAILABILITY_LABELS[status] }}
                </option>
              </select>
              <span v-else>{{ AVAILABILITY_LABELS[day.status] }}</span>
              <br>
              {{ doing(day) }}
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <section v-if="editable">
      <h2>{{ t.planning.csv.title }}</h2>
      <p>
        {{ t.planning.csv.intro }}
        <a :href="withBase(availabilityTemplatePath(props.id))">{{ t.planning.csv.template }}</a>
      </p>
      <form
        :aria-label="t.planning.csv.title"
        @submit.prevent="onCheck"
      >
        <p class="field">
          <label for="availability-csv-file">{{ t.planning.csv.file }}</label>
          <input
            id="availability-csv-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            @change="onFile"
          >
        </p>
        <p class="field">
          <label for="availability-csv-text">{{ t.planning.csv.paste }}</label>
          <textarea
            id="availability-csv-text"
            v-model="csvText"
            rows="6"
            spellcheck="false"
          />
        </p>
        <p class="actions">
          <button
            type="submit"
            :disabled="checking.busy.value || csvText.trim() === ''"
          >
            {{ t.planning.csv.check }}
          </button>
        </p>
        <p
          v-if="checking.error.value"
          role="alert"
          class="alert"
        >
          {{ checking.error.value }}
        </p>
      </form>
      <div
        v-if="preview"
        class="panel"
      >
        <Collapsible
          id="planning:preview"
          :heading="t.planning.csv.preview"
          :level="3"
        >
          <p
            v-if="preview.ignoredColumns.length > 0"
            class="muted"
          >
            {{ t.planning.csv.ignored(preview.ignoredColumns.join(', ')) }}
          </p>
          <template v-if="preview.fileProblems.length > 0">
            <p
              role="alert"
              class="alert"
            >
              {{ t.planning.csv.fileProblems }}
            </p>
            <ul>
              <li
                v-for="(problem, i) in preview.fileProblems"
                :key="i"
              >
                {{ FILE_PROBLEM_LABELS[problem.code] ?? problem.code }}<template v-if="problem.column !== undefined">
                  – {{ problem.column }}
                </template><template v-if="problem.line !== undefined">
                  ({{ t.planning.csv.line(problem.line) }})
                </template><template v-if="problem.days !== undefined">
                  {{ t.planning.csv.registrationDays(problem.days.map(formatDay).join(', ')) }}
                </template>
              </li>
            </ul>
          </template>
          <template v-if="preview.problems.length > 0">
            <p
              role="alert"
              class="alert"
            >
              {{ t.planning.csv.problems }}
            </p>
            <ul>
              <li
                v-for="(problem, i) in preview.problems"
                :key="i"
              >
                {{ t.planning.csv.line(problem.line) }}: {{ IMPORT_PROBLEM_LABELS[problem.code] ?? problem.code }}<template v-if="problem.key !== undefined">
                  – {{ problem.key }}
                </template>
              </li>
            </ul>
          </template>
          <p v-if="preview.fileProblems.length === 0 && preview.problems.length === 0 && !previewChanges">
            {{ t.planning.csv.nothing }}
          </p>
          <table
            v-if="preview.teachers.length > 0"
            class="table"
          >
            <thead>
              <tr>
                <th scope="col">
                  {{ t.common.field.name }}
                </th>
                <th
                  v-for="date in preview.days"
                  :key="date"
                  scope="col"
                >
                  {{ formatDay(date) }}
                </th>
                <th scope="col">
                  {{ t.planning.duty.head }}
                </th>
                <th scope="col">
                  {{ t.planning.csv.noteHead }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="teacher in preview.teachers"
                :key="teacher.personId"
              >
                <th scope="row">
                  {{ teacher.displayName }}<template v-if="teacher.shortName !== null">
                    ({{ teacher.shortName }})
                  </template>
                </th>
                <td
                  v-for="day in teacher.days"
                  :key="day.date"
                  :class="{ short: day.before !== day.after }"
                >
                  <template v-if="day.before === day.after">
                    {{ AVAILABILITY_LABELS[day.after] }}
                  </template>
                  <template v-else>
                    {{ AVAILABILITY_LABELS[day.before] }} → {{ AVAILABILITY_LABELS[day.after] }}
                  </template>
                </td>
                <td :class="{ short: teacher.leadDuty !== null }">
                  <template v-if="teacher.leadDuty === null">
                    {{ t.planning.csv.none }}
                  </template>
                  <template v-else>
                    {{ teacher.leadDuty.before ? t.planning.duty.has : t.planning.duty.none }} → {{ teacher.leadDuty.after ? t.planning.duty.has : t.planning.duty.none }}
                  </template>
                </td>
                <td>
                  <template v-if="teacher.note === null">
                    {{ t.planning.csv.none }}
                  </template>
                  <template v-else>
                    {{ teacher.note.before ?? t.planning.csv.none }} → {{ teacher.note.after ?? t.planning.csv.none }}
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="actions">
            <button
              type="button"
              :disabled="!preview.applicable || !previewChanges || applying.busy.value"
              @click="onApply"
            >
              {{ t.planning.csv.apply }}
            </button>
          </p>
          <p
            v-if="applying.error.value"
            role="alert"
            class="alert"
          >
            {{ applying.error.value }}
          </p>
        </Collapsible>
      </div>
      <p
        v-if="applying.notice.value"
        role="status"
        class="notice"
      >
        {{ applying.notice.value }}
      </p>
    </section>
  </template>
</template>
