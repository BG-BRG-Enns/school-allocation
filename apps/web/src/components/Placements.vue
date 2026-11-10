<script setup lang="ts">
// The students a teacher places into an activity without their choosing
// it, and, for a class activity, who of its classes does not take part
// (the project lead's decisions of 2026-11-06). A direct placement takes a
// place of the activity and beats a class placement: with its box ticked
// (the default) the student takes part in no class activity during that
// time, and the page names the class activities that means; unticked, the
// student stays in them. Nothing asks for a confirmation: the page says
// what an act means and, when it took a student out of another activity,
// whom to tell. Each list has a search of its own: the placements find
// students outside the activity's classes, the list of who does not take
// part finds those of its classes. For an activity not saved yet both
// lists are kept here and entered with the first save. What the caller may
// do is the server's.

import { computed, ref, watch, type Ref } from 'vue'
import { ApiError } from '../lib/api-rules.ts'
import { bringBackToClassActivity, findStudents, loadPlacements, placeStudent, reclaimStudent, removePlacement, takeOutOfClassActivity, type OtherActivity, type PlacementsResponse } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { t } from '../lib/i18n.ts'
import type { PendingAbsence, PendingPlacement } from '../lib/placements.ts'

interface Found {
  personId: string
  displayName: string
  className: string
}

const props = defineProps<{
  campaignId: string
  /** The stored activity; null while the form is a new one's. */
  itemId: string | null
  /** The classes the activity takes as a whole, as the form stands. */
  fixedClasses: readonly string[]
  /** Whether a session of it goes over a night. */
  overnight: boolean
  /** For a class activity not saved yet: the students of its classes a direct placement elsewhere takes out of it. */
  taken: readonly { displayName: string, className: string }[]
  /** The activities the placements of a new activity took students out of when it was first saved: whom to tell. */
  told: readonly OtherActivity[]
}>()
const pending = defineModel<PendingPlacement[]>('pending', { required: true })
const pendingAbsent = defineModel<PendingAbsence[]>('pendingAbsent', { required: true })
/** After an act on the stored activity changed its placements: the page's other readings of them (the participants) are stale. */
const emit = defineEmits<{ changed: [] }>()

const view = ref<PlacementsResponse | null>(null)
const acting = useFeedback()
const query = ref('')
const results = ref<Found[]>([])
const absentQuery = ref('')
const absentResults = ref<Found[]>([])

/** The stored activity's placements; nothing for someone who may not read them. */
async function load(): Promise<void> {
  view.value = null
  clearSearches()
  if (props.itemId === null) return
  try {
    view.value = await loadPlacements(props.itemId)
  } catch (err) {
    if (!(err instanceof ApiError && (err.status === 403 || err.status === 404))) throw err
  }
}
watch(() => props.itemId, load, { immediate: true })

function clearSearches(): void {
  query.value = ''
  results.value = []
  absentQuery.value = ''
  absentResults.value = []
}

const stored = computed(() => props.itemId !== null)
const classActivity = computed(() => props.fixedClasses.length > 0)
const mayPlace = computed(() => (stored.value ? view.value?.mayPlace === true : true))
// A new class activity's list is its author's to keep, before anything is saved.
const mayTakeOut = computed(() => (stored.value ? view.value?.mayTakeOut === true : classActivity.value))
const placed = computed(() => (stored.value ? view.value?.placed ?? [] : pending.value.map((p) => ({ ...p, leaves: [] as OtherActivity[] }))))
const inClass = (student: Found): boolean => props.fixedClasses.includes(student.className)
/** Who of the classes is not in it: the activity's list, or, before it is saved, the form's, less whoever's class the form no longer takes. */
const absent = computed<PlacementsResponse['absent']>(() => (stored.value ? view.value?.absent ?? [] : pendingAbsent.value.filter(inClass).map((a) => ({ ...a, by: 'list' as const, elsewhere: [] }))))
/** Shown for a new activity, and for a stored one the caller may read. */
const shown = computed(() => !stored.value || view.value !== null)

const othersText = (list: readonly OtherActivity[]): string => list.map((other) => t.placements.other(other.title, other.lead)).join(', ')

/** A search of students into `into`, keeping those `keep` admits; an answer to an earlier search is dropped. */
function searcher(into: Ref<Found[]>, keep: (student: Found) => boolean): (q: string) => Promise<void> {
  let seq = 0
  return async (q) => {
    const asked = ++seq
    const text = q.trim()
    if (text.length < 2) {
      into.value = []
      return
    }
    const found = await findStudents(props.campaignId, text)
    if (asked === seq) into.value = found.students.filter(keep)
  }
}
// Not those of the activity's classes, who are in it (the list below is theirs), nor those placed already: they have their own rows.
const search = searcher(results, (s) => !inClass(s) && !placed.value.some((p) => p.personId === s.personId))
// Those of the activity's classes who are in it still.
const searchAbsent = searcher(absentResults, (s) => inClass(s) && !absent.value.some((a) => a.personId === s.personId))

/** One act on the stored activity: the answer is the placements as they are then. */
async function act(change: (itemId: string) => Promise<PlacementsResponse>): Promise<void> {
  const itemId = props.itemId
  if (itemId === null) return
  await acting.run(async () => {
    view.value = await change(itemId)
    clearSearches()
    emit('changed')
  })
}

async function place(student: Found): Promise<void> {
  if (stored.value) return act((itemId) => placeStudent(itemId, student.personId, true))
  pending.value = [...pending.value, { ...student, leavesClass: true }]
  query.value = ''
  results.value = []
}

async function setLeavesClass(personId: string, leavesClass: boolean): Promise<void> {
  if (stored.value) return act((itemId) => placeStudent(itemId, personId, leavesClass))
  pending.value = pending.value.map((p) => (p.personId === personId ? { ...p, leavesClass } : p))
}

async function remove(personId: string): Promise<void> {
  if (stored.value) return act((itemId) => removePlacement(itemId, personId))
  pending.value = pending.value.filter((p) => p.personId !== personId)
}

async function takeOut(student: Found): Promise<void> {
  if (stored.value) return act((itemId) => takeOutOfClassActivity(itemId, student.personId))
  pendingAbsent.value = [...pendingAbsent.value, { personId: student.personId, displayName: student.displayName, className: student.className }]
  absentQuery.value = ''
  absentResults.value = []
}

async function bringBack(personId: string): Promise<void> {
  if (stored.value) return act((itemId) => bringBackToClassActivity(itemId, personId))
  pendingAbsent.value = pendingAbsent.value.filter((a) => a.personId !== personId)
}
</script>

<template>
  <section v-if="shown">
    <h2>{{ t.placements.heading }}</h2>
    <p class="muted">
      {{ t.placements.intro }}
    </p>
    <p
      v-if="acting.error.value"
      role="alert"
      class="alert"
    >
      {{ acting.error.value }}
    </p>
    <p
      v-for="other in [...told, ...(view?.tell ?? [])]"
      :key="other.itemId"
      role="status"
      class="notice"
    >
      {{ t.placements.tell(other.title, other.lead) }}
    </p>
    <ul
      v-if="placed.length > 0"
      class="plain"
    >
      <li
        v-for="p in placed"
        :key="p.personId"
      >
        <strong>{{ p.displayName }}</strong> ({{ p.className }})
        <label>
          <input
            type="checkbox"
            :checked="p.leavesClass"
            :disabled="!mayPlace || acting.busy.value"
            :aria-label="t.placements.leavesClassOf(p.displayName)"
            @change="setLeavesClass(p.personId, ($event.target as HTMLInputElement).checked)"
          >
          {{ t.placements.leavesClass }}
        </label>
        <span
          v-if="p.leaves.length > 0"
          class="muted"
        > · {{ t.placements.leaves(othersText(p.leaves)) }}</span>
        <button
          v-if="mayPlace"
          type="button"
          class="ghost small"
          :disabled="acting.busy.value"
          @click="remove(p.personId)"
        >
          {{ t.placements.remove(p.displayName) }}
        </button>
      </li>
    </ul>
    <p
      v-else
      class="muted"
    >
      {{ t.placements.none }}
    </p>
    <p
      v-if="placed.length > 0"
      class="muted"
    >
      {{ t.placements.leavesClassHint }}
    </p>
    <template v-if="mayPlace">
      <p class="field">
        <label for="student-search">{{ t.placements.search }}</label>
        <input
          id="student-search"
          v-model="query"
          type="search"
          maxlength="100"
          @input="search(query)"
        >
      </p>
      <ul
        v-if="results.length > 0"
        class="plain choices"
      >
        <li
          v-for="student in results"
          :key="student.personId"
        >
          <button
            type="button"
            class="ghost"
            :disabled="acting.busy.value"
            @click="place(student)"
          >
            {{ t.placements.place(student.displayName, student.className) }}
          </button>
        </li>
      </ul>
    </template>
    <template v-if="classActivity">
      <h3>{{ t.placements.absentHeading }}</h3>
      <p class="muted">
        {{ t.placements.absentIntro }}
      </p>
      <p
        v-if="overnight"
        class="notice"
      >
        {{ t.placements.overnight }}
      </p>
      <p
        v-if="!stored && taken.length > 0"
        class="notice"
      >
        {{ t.placements.taken(taken.map((s) => `${s.displayName} (${s.className})`).join(', ')) }}
      </p>
      <ul
        v-if="absent.length > 0"
        class="plain"
      >
        <li
          v-for="a in absent"
          :key="a.personId"
        >
          <strong>{{ a.displayName }}</strong> ({{ a.className }})
          <span class="muted"> · {{ a.by === 'list' ? t.placements.onList : t.placements.placedIn(othersText(a.elsewhere)) }}</span>
          <button
            v-if="mayTakeOut && a.by === 'list'"
            type="button"
            class="ghost small"
            :disabled="acting.busy.value"
            @click="bringBack(a.personId)"
          >
            {{ t.placements.bringBack(a.displayName) }}
          </button>
          <button
            v-if="mayTakeOut && a.by === 'placed'"
            type="button"
            class="ghost small"
            :disabled="acting.busy.value"
            @click="act((itemId) => reclaimStudent(itemId, a.personId))"
          >
            {{ t.placements.reclaim(a.displayName) }}
          </button>
        </li>
      </ul>
      <p
        v-else
        class="muted"
      >
        {{ t.placements.absentNone }}
      </p>
      <template v-if="mayTakeOut">
        <p class="field">
          <label for="absent-search">{{ t.placements.absentSearch }}</label>
          <input
            id="absent-search"
            v-model="absentQuery"
            type="search"
            maxlength="100"
            @input="searchAbsent(absentQuery)"
          >
        </p>
        <ul
          v-if="absentResults.length > 0"
          class="plain choices"
        >
          <li
            v-for="student in absentResults"
            :key="student.personId"
          >
            <button
              type="button"
              class="ghost"
              :disabled="acting.busy.value"
              @click="takeOut(student)"
            >
              {{ t.placements.takeOut(student.displayName, student.className) }}
            </button>
          </li>
        </ul>
      </template>
    </template>
  </section>
</template>
