<script setup lang="ts">
// The classes of the roster in force and their class teachers (D-17): the
// ones the roster names by address, which stay as the roster says, and
// the ones assigned here by an administrator or an organizer, audited.

import { computed, onMounted, ref, watch } from 'vue'
import type { TeacherListPreview } from '@school-allocation/api-contracts'
import { applyTeacherList, loadClasses, previewTeacherList, saveClassTeachers, searchClassTeachers, teacherListTemplatePath, type ClassWithTeachers } from '../lib/admin-api.ts'
import { withBase } from '../lib/base.ts'
import { useFeedback } from '../lib/feedback.ts'
import { t } from '../lib/i18n.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => t.common.page.classTeachers)
const classes = ref<ClassWithTeachers[]>([])
const loading = useFeedback()
const saving = useFeedback()
const mayEdit = computed(() => (session.value?.roles ?? []).some((role) => role === 'school_admin' || role === 'campaign_organizer'))

/** The class whose assigned teachers are being changed, with the list as it will be saved. */
const editing = ref<{ className: string, teachers: { personId: string, displayName: string }[] } | null>(null)
const query = ref('')
const results = ref<{ personId: string, displayName: string, shortName: string | null }[]>([])
/** The search sent last; an answer to an earlier one is dropped, so typing fast never shows stale results. */
let latestSearch = 0

onMounted(() => loading.run(async () => {
  classes.value = (await loadClasses()).classes
}))

/** The class teachers as the table names them, with the abbreviation where one is known; the ones the roster names are marked. */
function teacherNames(c: ClassWithTeachers): string {
  if (c.teachers.length === 0) return '–'
  return c.teachers.map((teacher) => {
    const name = teacher.shortName === null ? teacher.displayName : t.classTeachers.csv.withShortName(teacher.displayName, teacher.shortName)
    return teacher.source === 'roster' ? t.classTeachers.byRoster(name) : name
  }).join(', ')
}

// The teacher list: a file or pasted text, checked first, then the checked text applied.
const csvText = ref('')
const checkedCsv = ref('')
const preview = ref<TeacherListPreview | null>(null)
const checking = useFeedback()
const applying = useFeedback()
const PROBLEM_LABELS: Readonly<Record<string, string>> = t.labels.teacherListProblem
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
    const result = await previewTeacherList(text)
    if (check !== latestCheck || text !== csvText.value) return
    checkedCsv.value = text
    preview.value = result
  })
}

async function onApply(): Promise<void> {
  const text = checkedCsv.value
  let applied = { shortNames: 0, classesChanged: 0 }
  const ok = await applying.run(async () => {
    const result = await applyTeacherList(text)
    classes.value = result.classes
    applied = { shortNames: result.shortNames, classesChanged: result.classesChanged }
  })
  if (ok) {
    applying.notice.value = t.classTeachers.csv.applied(applied.shortNames, applied.classesChanged)
    preview.value = null
    csvText.value = ''
    checkedCsv.value = ''
  }
}

/** The people of a class's list, as a key: the same people in any order or spelling are no change. */
const peopleOf = (list: readonly { personId: string }[]) => [...new Set(list.map((x) => x.personId))].sort((a, b) => a.localeCompare(b, 'en')).join('\n')
/** Whether the preview would change anything at all. */
const previewChanges = computed(() => (preview.value?.teachers.some((x) => x.shortName !== null) ?? false) || (preview.value?.classes.some((c) => peopleOf(c.before) !== peopleOf(c.after)) ?? false))

function startEditing(c: ClassWithTeachers): void {
  editing.value = { className: c.className, teachers: c.teachers.filter((t) => t.source === 'app').map((t) => ({ personId: t.personId, displayName: t.displayName })) }
  query.value = ''
  results.value = []
}

async function find(): Promise<void> {
  const q = query.value.trim()
  if (q === '' || !editing.value) {
    results.value = []
    return
  }
  const chosen = new Set(editing.value.teachers.map((t) => t.personId))
  const search = ++latestSearch
  const found = (await searchClassTeachers(q)).teachers
  if (search !== latestSearch) return
  results.value = found.filter((t) => !chosen.has(t.personId))
}

function add(person: { personId: string, displayName: string }): void {
  editing.value?.teachers.push({ personId: person.personId, displayName: person.displayName })
  query.value = ''
  results.value = []
}

function remove(personId: string): void {
  if (editing.value) editing.value.teachers = editing.value.teachers.filter((t) => t.personId !== personId)
}

async function onSave(): Promise<void> {
  const e = editing.value
  if (!e) return
  const ok = await saving.run(async () => {
    classes.value = (await saveClassTeachers(e.className, e.teachers.map((t) => t.personId))).classes
  }, t.classTeachers.saved)
  if (ok) editing.value = null
}
</script>

<template>
  <p>
    <RouterLink to="/verwaltung">
      ← {{ t.common.page.admin }}
    </RouterLink>
  </p>
  <h1>{{ t.common.page.classTeachers }}</h1>
  <p
    v-if="!mayEdit"
    role="alert"
  >
    {{ t.classTeachers.editorsOnly }}
  </p>
  <template v-else>
    <p>{{ t.classTeachers.intro }}</p>
    <p
      v-if="loading.error.value"
      role="alert"
      class="alert"
    >
      {{ loading.error.value }}
    </p>
    <p v-if="!loading.busy.value && classes.length === 0">
      {{ t.classTeachers.noClasses }}
    </p>
    <table
      v-else
      class="table"
    >
      <thead>
        <tr>
          <th scope="col">
            {{ t.common.field.className }}
          </th>
          <th scope="col">
            {{ t.common.field.grade }}
          </th>
          <th scope="col">
            {{ t.common.field.students }}
          </th>
          <th scope="col">
            {{ t.classTeachers.classTeacher }}
          </th>
          <th scope="col">
            <span class="visually-hidden">{{ t.common.field.actions }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="c in classes"
          :key="c.className"
        >
          <td>{{ c.className }}</td>
          <td>{{ c.grade }}.</td>
          <td>{{ c.students }}</td>
          <td>{{ teacherNames(c) }}</td>
          <td class="row-actions">
            <button
              type="button"
              class="ghost"
              @click="startEditing(c)"
            >
              {{ t.classTeachers.assign }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <form
      v-if="editing"
      class="panel"
      :aria-label="t.classTeachers.assignTo(editing.className)"
      @submit.prevent="onSave"
    >
      <h3>{{ t.classTeachers.of(editing.className) }}</h3>
      <div class="chips">
        <button
          v-for="teacher in editing.teachers"
          :key="teacher.personId"
          type="button"
          class="ghost"
          :aria-label="t.classTeachers.removeTeacher(teacher.displayName)"
          @click="remove(teacher.personId)"
        >
          {{ teacher.displayName }} ✕
        </button>
      </div>
      <p class="field">
        <label for="kv-search">{{ t.classTeachers.addTeacher }}</label>
        <input
          id="kv-search"
          v-model="query"
          type="search"
          maxlength="100"
          @input="find"
        >
      </p>
      <ul
        v-if="results.length > 0"
        class="plain choices"
      >
        <li
          v-for="p in results"
          :key="p.personId"
        >
          <button
            type="button"
            class="ghost"
            @click="add(p)"
          >
            {{ t.classTeachers.addPerson(p.displayName) }}<span
              v-if="p.shortName !== null"
              class="muted"
            > ({{ p.shortName }})</span>
          </button>
        </li>
      </ul>
      <p class="actions">
        <button
          type="submit"
          :disabled="saving.busy.value"
        >
          {{ t.common.save }}
        </button>
        <button
          type="button"
          class="ghost"
          @click="editing = null"
        >
          {{ t.common.cancel }}
        </button>
      </p>
      <p
        v-if="saving.error.value"
        role="alert"
        class="alert"
      >
        {{ saving.error.value }}
      </p>
    </form>
    <p
      v-if="saving.notice.value"
      role="status"
      class="notice"
    >
      {{ saving.notice.value }}
    </p>

    <section>
      <h2>{{ t.classTeachers.csv.title }}</h2>
      <p>
        {{ t.classTeachers.csv.intro }}
        <a :href="withBase(teacherListTemplatePath)">{{ t.classTeachers.csv.template }}</a>
      </p>
      <form
        :aria-label="t.classTeachers.csv.title"
        @submit.prevent="onCheck"
      >
        <p class="field">
          <label for="teacher-csv-file">{{ t.classTeachers.csv.file }}</label>
          <input
            id="teacher-csv-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            @change="onFile"
          >
        </p>
        <p class="field">
          <label for="teacher-csv-text">{{ t.classTeachers.csv.paste }}</label>
          <textarea
            id="teacher-csv-text"
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
            {{ t.classTeachers.csv.check }}
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
        <p
          v-if="preview.ignoredColumns.length > 0"
          class="muted"
        >
          {{ t.classTeachers.csv.ignored(preview.ignoredColumns.join(', ')) }}
        </p>
        <template v-if="preview.fileProblems.length > 0">
          <p
            role="alert"
            class="alert"
          >
            {{ t.classTeachers.csv.fileProblems }}
          </p>
          <ul>
            <li
              v-for="(problem, i) in preview.fileProblems"
              :key="i"
            >
              {{ FILE_PROBLEM_LABELS[problem.code] ?? problem.code }}<template v-if="problem.column !== undefined">
                – {{ problem.column }}
              </template><template v-if="problem.line !== undefined">
                ({{ t.classTeachers.csv.line(problem.line) }})
              </template>
            </li>
          </ul>
        </template>
        <template v-if="preview.problems.length > 0">
          <p
            role="alert"
            class="alert"
          >
            {{ t.classTeachers.csv.problems }}
          </p>
          <ul>
            <li
              v-for="(problem, i) in preview.problems"
              :key="i"
            >
              {{ t.classTeachers.csv.line(problem.line) }}: {{ PROBLEM_LABELS[problem.code] ?? problem.code }}<template v-if="problem.key !== undefined">
                – {{ problem.key }}
              </template>
            </li>
          </ul>
        </template>
        <p v-if="!previewChanges && preview.problems.length === 0 && preview.fileProblems.length === 0">
          {{ t.classTeachers.csv.nothing }}
        </p>
        <template v-if="preview.teachers.some((x) => x.shortName !== null)">
          <h3>{{ t.classTeachers.csv.shortNames }}</h3>
          <ul class="plain">
            <template
              v-for="teacher in preview.teachers"
              :key="teacher.personId"
            >
              <li v-if="teacher.shortName !== null">
                {{ teacher.displayName }}: {{ teacher.shortName.before ?? t.classTeachers.csv.none }} → {{ teacher.shortName.after }}
              </li>
            </template>
          </ul>
        </template>
        <template v-if="preview.classes.length > 0">
          <h3>{{ t.classTeachers.csv.classes }}</h3>
          <table class="table">
            <thead>
              <tr>
                <th scope="col">
                  {{ t.common.field.className }}
                </th>
                <th scope="col">
                  {{ t.classTeachers.csv.before }}
                </th>
                <th scope="col">
                  {{ t.classTeachers.csv.after }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in preview.classes"
                :key="c.className"
              >
                <td>{{ c.className }}</td>
                <td>{{ c.before.map((x) => x.displayName).join(', ') || t.classTeachers.csv.none }}</td>
                <td>{{ c.after.map((x) => x.displayName).join(', ') || t.classTeachers.csv.none }}</td>
              </tr>
            </tbody>
          </table>
        </template>
        <p class="actions">
          <button
            type="button"
            :disabled="!preview.applicable || !previewChanges || applying.busy.value"
            @click="onApply"
          >
            {{ t.classTeachers.csv.apply }}
          </button>
        </p>
        <p
          v-if="applying.error.value"
          role="alert"
          class="alert"
        >
          {{ applying.error.value }}
        </p>
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
