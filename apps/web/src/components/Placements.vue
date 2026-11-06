<script setup lang="ts">
// The students a teacher places into an activity without their choosing
// it, and, for a class activity, who of its classes does not take part
// (the project lead's decisions of 2026-11-06). A direct placement takes a
// place of the activity and beats a class placement: with its box ticked
// (the default) the student takes part in no class activity during that
// time, and the page names the class activities that means; unticked, the
// student stays in them. Nothing asks for a confirmation: the page says
// what an act means and, when it took a student out of another activity,
// whom to tell. For an activity not saved yet the list is kept here and
// entered with the first save. What the caller may do is the server's.

import { computed, ref, watch } from 'vue'
import { ApiError } from '../lib/api-rules.ts'
import { bringBackToClassActivity, findStudents, loadPlacements, placeStudent, reclaimStudent, removePlacement, takeOutOfClassActivity, type OtherActivity, type PlacementsResponse } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { t } from '../lib/i18n.ts'
import type { PendingPlacement } from '../lib/placements.ts'

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
}>()
const pending = defineModel<PendingPlacement[]>('pending', { required: true })

const view = ref<PlacementsResponse | null>(null)
const acting = useFeedback()
const query = ref('')
const results = ref<Found[]>([])

/** The stored activity's placements; nothing for someone who may not read them. */
async function load(): Promise<void> {
  view.value = null
  results.value = []
  query.value = ''
  if (props.itemId === null) return
  try {
    view.value = await loadPlacements(props.itemId)
  } catch (err) {
    if (!(err instanceof ApiError && (err.status === 403 || err.status === 404))) throw err
  }
}
watch(() => props.itemId, load, { immediate: true })

const stored = computed(() => props.itemId !== null)
const classActivity = computed(() => props.fixedClasses.length > 0)
const mayPlace = computed(() => (stored.value ? view.value?.mayPlace === true : true))
const mayTakeOut = computed(() => stored.value && view.value?.mayTakeOut === true)
const placed = computed(() => (stored.value ? view.value?.placed ?? [] : pending.value.map((p) => ({ ...p, leaves: [] as OtherActivity[] }))))
const absent = computed(() => view.value?.absent ?? [])
/** Shown for a new activity, and for a stored one the caller may read. */
const shown = computed(() => !stored.value || view.value !== null)

const othersText = (list: readonly OtherActivity[]): string => list.map((other) => t.placements.other(other.title, other.lead)).join(', ')
const inClass = (student: Found): boolean => props.fixedClasses.includes(student.className)

/** The search last asked for: an answer to an earlier one is dropped. */
let searchSeq = 0
async function search(): Promise<void> {
  const q = query.value.trim()
  const seq = ++searchSeq
  if (q.length < 2) {
    results.value = []
    return
  }
  const found = await findStudents(props.campaignId, q)
  if (seq !== searchSeq) return
  // Not those placed already, nor those on the list: they have their own rows below.
  results.value = found.students.filter((s) => !placed.value.some((p) => p.personId === s.personId) && !absent.value.some((a) => a.personId === s.personId && a.by === 'list'))
}

/** One act on the stored activity: the answer is the placements as they are then. */
async function act(change: (itemId: string) => Promise<PlacementsResponse>): Promise<void> {
  const itemId = props.itemId
  if (itemId === null) return
  await acting.run(async () => {
    view.value = await change(itemId)
    query.value = ''
    results.value = []
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
      v-for="other in view?.tell ?? []"
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
      v-if="!stored && placed.length > 0"
      class="muted"
    >
      {{ t.placements.pending }}
    </p>
    <template v-if="mayPlace || mayTakeOut">
      <p class="field">
        <label for="student-search">{{ t.placements.search }}</label>
        <input
          id="student-search"
          v-model="query"
          type="search"
          maxlength="100"
          @input="search"
        >
      </p>
      <ul
        v-if="results.length > 0"
        class="plain choices"
      >
        <template
          v-for="student in results"
          :key="student.personId"
        >
          <li v-if="inClass(student) ? mayTakeOut : mayPlace">
            <button
              type="button"
              class="ghost"
              :disabled="acting.busy.value"
              @click="inClass(student) ? act((itemId) => takeOutOfClassActivity(itemId, student.personId)) : place(student)"
            >
              {{ inClass(student) ? t.placements.takeOut(student.displayName, student.className) : t.placements.place(student.displayName, student.className) }}
            </button>
          </li>
        </template>
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
            @click="act((itemId) => bringBackToClassActivity(itemId, a.personId))"
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
        v-else-if="stored"
        class="muted"
      >
        {{ t.placements.absentNone }}
      </p>
    </template>
  </section>
</template>
