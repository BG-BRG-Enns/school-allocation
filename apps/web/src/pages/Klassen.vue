<script setup lang="ts">
// The classes of the roster in force and their class teachers (D-17): the
// ones the roster names by address, which stay as the roster says, and
// the ones assigned here by an administrator or an organizer, audited.

import { computed, onMounted, ref } from 'vue'
import { loadClasses, saveClassTeachers, searchPersons, type ClassWithTeachers, type RosterPerson } from '../lib/admin-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

usePageTitle(() => 'Klassenvorstände')
const classes = ref<ClassWithTeachers[]>([])
const loading = useFeedback()
const saving = useFeedback()
const mayEdit = computed(() => (session.value?.roles ?? []).some((role) => role === 'school_admin' || role === 'campaign_organizer'))

/** The class whose assigned teachers are being changed, with the list as it will be saved. */
const editing = ref<{ className: string, teachers: { personId: string, displayName: string }[] } | null>(null)
const query = ref('')
const results = ref<RosterPerson[]>([])

onMounted(() => loading.run(async () => {
  classes.value = (await loadClasses()).classes
}))

/** The class teachers as the table names them; the ones the roster names are marked. */
function teacherNames(c: ClassWithTeachers): string {
  if (c.teachers.length === 0) return '–'
  return c.teachers.map((t) => (t.source === 'roster' ? `${t.displayName} (laut Personenliste)` : t.displayName)).join(', ')
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
  results.value = (await searchPersons(q)).persons.filter((p) => p.kind === 'teacher' && !chosen.has(p.personId))
}

function add(person: RosterPerson): void {
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
  }, 'Klassenvorstände gespeichert.')
  if (ok) editing.value = null
}
</script>

<template>
  <p>
    <RouterLink to="/verwaltung">
      ← Verwaltung
    </RouterLink>
  </p>
  <h1>Klassenvorstände</h1>
  <p
    v-if="!mayEdit"
    role="alert"
  >
    Die Klassenvorstände ordnen die Administration und die Organisation einer Wahl zu.
  </p>
  <template v-else>
    <p>Wer eine Klasse führt, sieht ihren Stand in jeder Wahl und meldet nach der Zuteilung Schüler/innen ohne Platz nach. Nennt die Personenliste einen Klassenvorstand (Spalte class_teacher_email), gilt er hier auch.</p>
    <p
      v-if="loading.error.value"
      role="alert"
      class="alert"
    >
      {{ loading.error.value }}
    </p>
    <p v-if="!loading.busy.value && classes.length === 0">
      Es gilt noch keine Personenliste mit Klassen.
    </p>
    <table
      v-else
      class="table"
    >
      <thead>
        <tr>
          <th scope="col">
            Klasse
          </th>
          <th scope="col">
            Schulstufe
          </th>
          <th scope="col">
            Schüler/innen
          </th>
          <th scope="col">
            Klassenvorstand
          </th>
          <th scope="col">
            <span class="visually-hidden">Aktionen</span>
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
              Zuordnen
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <form
      v-if="editing"
      class="panel"
      :aria-label="`Klassenvorstand der ${editing.className} zuordnen`"
      @submit.prevent="onSave"
    >
      <h3>Klassenvorstand der {{ editing.className }}</h3>
      <div class="chips">
        <button
          v-for="t in editing.teachers"
          :key="t.personId"
          type="button"
          class="ghost"
          :aria-label="`${t.displayName} entfernen`"
          @click="remove(t.personId)"
        >
          {{ t.displayName }} ✕
        </button>
      </div>
      <p class="field">
        <label for="kv-search">Lehrkraft hinzufügen</label>
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
            {{ p.displayName }} hinzufügen
          </button>
        </li>
      </ul>
      <p class="actions">
        <button
          type="submit"
          :disabled="saving.busy.value"
        >
          Speichern
        </button>
        <button
          type="button"
          class="ghost"
          @click="editing = null"
        >
          Abbrechen
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
