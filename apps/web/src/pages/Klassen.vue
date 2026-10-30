<script setup lang="ts">
// The classes of the roster in force and their class teachers (D-17): the
// ones the roster names by address, which stay as the roster says, and
// the ones assigned here by an administrator or an organizer, audited.

import { computed, onMounted, ref } from 'vue'
import { loadClasses, saveClassTeachers, searchClassTeachers, type ClassWithTeachers } from '../lib/admin-api.ts'
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
const results = ref<{ personId: string, displayName: string }[]>([])
/** The search sent last; an answer to an earlier one is dropped, so typing fast never shows stale results. */
let latestSearch = 0

onMounted(() => loading.run(async () => {
  classes.value = (await loadClasses()).classes
}))

/** The class teachers as the table names them; the ones the roster names are marked. */
function teacherNames(c: ClassWithTeachers): string {
  if (c.teachers.length === 0) return '–'
  return c.teachers.map((teacher) => (teacher.source === 'roster' ? t.classTeachers.byRoster(teacher.displayName) : teacher.displayName)).join(', ')
}

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
            {{ t.classTeachers.addPerson(p.displayName) }}
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
  </template>
</template>
