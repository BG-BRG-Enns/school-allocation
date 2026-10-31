<script setup lang="ts">
// A class as its class teacher sees it in a campaign: the students, and
// the class activities that take the class on which days; who has chosen,
// once the window is open; from publication on each one's places and the
// minutes and rules they miss, and for those short of either the placement
// into an activity with free places that fits the gap (D-06), with a reason; and
// the attendance per project day and session (D-16), recorded here.

import { computed, onMounted, ref, watch } from 'vue'
import { classAttendanceExportPath, loadClassAttendance, placeStudent, recordAttendance, type AttendanceStatus, type ClassAttendanceResponse } from '../lib/allocation-api.ts'
import { withBase } from '../lib/base.ts'
import { loadCampaign, loadCategories, loadClassStatus, type Campaign, type Category, type ClassStatus } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, formatSpan } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { ASSIGNMENT_SOURCE_LABELS, ATTENDANCE_STATUS_LABELS, CHOICE_STATE_LABELS, ITEM_STATE_LABELS, MOVE_PROBLEM_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string, className: string }>()
const campaign = ref<Campaign | null>(null)
const status = ref<ClassStatus | null>(null)
const categories = ref<Category[]>([])
const loading = useFeedback()
const action = useFeedback()
usePageTitle(() => t.schoolClass.title(props.className))
const published = computed(() => status.value?.students.some((s) => s.placement !== null && s.placement !== undefined) ?? false)
const unplaced = computed(() => status.value?.students.filter((s) => (s.placement?.deficit ?? 0) > 0 || (s.placement?.rules ?? []).some((r) => !r.met)) ?? [])
/** What a student short of minutes or of a rule misses, in a line: "120 Minuten fehlen · Sport: es fehlt 1 Aktivität". */
const gapText = (s: ClassStatus['students'][number]): string => {
  const parts: string[] = []
  if ((s.placement?.deficit ?? 0) > 0) parts.push(t.schoolClass.unplaced.minutesMissing(s.placement?.deficit ?? 0))
  for (const r of s.placement?.rules ?? []) {
    if (!r.met) parts.push(t.schoolClass.unplaced.ruleMissing(categories.value.find((c) => c.id === r.categoryId)?.name ?? '–', t.rules.missing(r.minimum - r.have, r.unit)))
  }
  return parts.join(' · ')
}
const placementText = (s: ClassStatus['students'][number]): string => s.placement?.items.map((i) => `${i.title} (${ASSIGNMENT_SOURCE_LABELS[i.source] ?? i.source})`).join(', ') || t.schoolClass.noPlace
/** The placement form's choice and reason, per student. */
const chosen = ref<Record<string, string>>({})
const reasons = ref<Record<string, string>>({})
type Offer = NonNullable<ClassStatus['students'][number]['placement']>['offers'][number]
const offerLabel = (o: Offer): string => `${o.number === null ? '' : `${o.number}. `}${o.title} – ${o.problems.length > 0 ? (MOVE_PROBLEM_LABELS[o.problems[0] ?? ''] ?? o.problems[0]) : t.schoolClass.freePlaces(o.free)}`

async function onPlace(personId: string): Promise<void> {
  const itemId = chosen.value[personId] ?? ''
  const reason = (reasons.value[personId] ?? '').trim()
  if (itemId === '' || reason === '') return
  const ok = await action.run(async () => {
    status.value = await placeStudent(props.id, props.className, personId, itemId, reason)
    // The placed student has a session to be recorded in now; the marks already set stay.
    await refreshAttendance()
  }, t.schoolClass.placed)
  if (ok) {
    delete chosen.value[personId]
    delete reasons.value[personId]
  }
}

/** The attendance, from publication on; the marks as edited, per session and student, saved per project day. */
const attendance = ref<ClassAttendanceResponse | null>(null)
const marks = ref<Record<string, AttendanceStatus | ''>>({})
const notes = ref<Record<string, string>>({})
const markKey = (sessionId: string, personId: string) => `${sessionId}\u0000${personId}`
const STATUSES: AttendanceStatus[] = ['present', 'absent', 'excused']

async function loadAttendance(): Promise<void> {
  const c = campaign.value
  if (!c || (c.state !== 'results' && c.state !== 'archived')) {
    attendance.value = null
    return
  }
  attendance.value = await loadClassAttendance(props.id, props.className)
  marks.value = Object.fromEntries(attendance.value.days.flatMap((d) => d.rows.map((r) => [markKey(r.sessionId, r.personId), r.status ?? ''])))
  notes.value = Object.fromEntries(attendance.value.days.flatMap((d) => d.rows.map((r) => [markKey(r.sessionId, r.personId), r.note])))
}

/** The rows again, the marks already set kept; new rows get what was recorded. */
async function refreshAttendance(): Promise<void> {
  if (attendance.value === null) return
  attendance.value = await loadClassAttendance(props.id, props.className)
  for (const r of attendance.value.days.flatMap((d) => d.rows)) {
    const key = markKey(r.sessionId, r.personId)
    if (!(key in marks.value)) marks.value[key] = r.status ?? ''
    if (!(key in notes.value)) notes.value[key] = r.note
  }
}

/** Saves a day's marks: one request per session, the students of the class in it, each with the note already recorded; the other days' unsaved marks stay. */
async function onSaveAttendance(date: string): Promise<void> {
  const day = attendance.value?.days.find((d) => d.date === date)
  if (!day) return
  const bySession = new Map<string, { personId: string, status: AttendanceStatus, note: string }[]>()
  for (const r of day.rows) {
    const key = markKey(r.sessionId, r.personId)
    const status = marks.value[key]
    if (status === '' || status === undefined) continue
    const list = bySession.get(r.sessionId) ?? []
    list.push({ personId: r.personId, status, note: (notes.value[key] ?? r.note).trim().slice(0, 200) })
    bySession.set(r.sessionId, list)
  }
  await action.run(async () => {
    for (const [sessionId, entries] of bySession) await recordAttendance(sessionId, entries)
    const fresh = await loadClassAttendance(props.id, props.className)
    attendance.value = fresh
    for (const r of fresh.days.find((d) => d.date === date)?.rows ?? []) {
      marks.value[markKey(r.sessionId, r.personId)] = r.status ?? ''
      notes.value[markKey(r.sessionId, r.personId)] = r.note
    }
  }, t.schoolClass.attendanceSaved)
}

async function load(): Promise<void> {
  await loading.run(async () => {
    const [view, s, school] = await Promise.all([loadCampaign(props.id), loadClassStatus(props.id, props.className), loadCategories()])
    campaign.value = view.campaign
    status.value = s
    categories.value = school.categories
    await loadAttendance()
  })
}
onMounted(load)
watch(() => [props.id, props.className], load)
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← {{ t.common.backToCampaign }}
    </RouterLink>
  </p>
  <h1>{{ t.schoolClass.title(props.className) }}</h1>
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
  <template v-if="campaign && status">
    <p class="muted">
      {{ campaign.name }} · {{ t.schoolClass.schoolYear(campaign.schoolYear) }}
    </p>
    <section>
      <h2>{{ t.schoolClass.classActivities }}</h2>
      <p v-if="status.classActivities.length === 0">
        {{ t.schoolClass.noClassActivity }}
      </p>
      <ul v-else>
        <li
          v-for="a in status.classActivities"
          :key="a.id"
        >
          <strong>{{ a.title }}</strong> <span class="badge">{{ ITEM_STATE_LABELS[a.state] ?? a.state }}</span>
          <ul class="plain">
            <li
              v-for="(s, index) in a.sessions"
              :key="index"
            >
              {{ formatSpan(s.startsAt, s.endsAt) }}
            </li>
          </ul>
        </li>
      </ul>
    </section>
    <section v-if="published">
      <h2>{{ t.schoolClass.unplaced.heading(unplaced.length) }}</h2>
      <p
        v-if="unplaced.length === 0"
        class="muted"
      >
        {{ t.schoolClass.unplaced.none }}
      </p>
      <ul v-else>
        <li
          v-for="s in unplaced"
          :key="s.personId"
        >
          <strong>{{ s.displayName }}</strong>: {{ gapText(s) }}<template v-if="s.placement && s.placement.items.length > 0">
            · {{ t.schoolClass.unplaced.sofar(s.placement.items.map((i) => i.title).join(', ')) }}
          </template>
          <form
            v-if="campaign.state === 'results'"
            class="inline-form"
            :aria-label="t.schoolClass.unplaced.form(s.displayName)"
            @submit.prevent="onPlace(s.personId)"
          >
            <p
              v-if="(s.placement?.offers.length ?? 0) === 0"
              class="muted"
            >
              {{ t.schoolClass.unplaced.noOffer }}
            </p>
            <template v-else>
              <p class="field">
                <label :for="`place-item-${s.personId}`">{{ t.schoolClass.unplaced.itemFor(s.displayName) }}</label>
                <select
                  :id="`place-item-${s.personId}`"
                  v-model="chosen[s.personId]"
                  required
                >
                  <option value="">
                    {{ t.common.pleaseChoose }}
                  </option>
                  <option
                    v-for="o in s.placement?.offers ?? []"
                    :key="o.itemId"
                    :value="o.itemId"
                    :disabled="o.problems.length > 0"
                  >
                    {{ offerLabel(o) }}
                  </option>
                </select>
              </p>
              <p class="field">
                <label :for="`place-reason-${s.personId}`">{{ t.schoolClass.unplaced.reasonFor(s.displayName) }}</label>
                <input
                  :id="`place-reason-${s.personId}`"
                  v-model="reasons[s.personId]"
                  type="text"
                  maxlength="500"
                  required
                >
              </p>
              <p class="actions">
                <button
                  type="submit"
                  :disabled="action.busy.value"
                >
                  {{ t.schoolClass.unplaced.place }}
                </button>
              </p>
            </template>
          </form>
        </li>
      </ul>
      <p class="muted">
        {{ t.schoolClass.unplaced.note }}
      </p>
    </section>
    <section v-if="attendance">
      <h2>{{ t.schoolClass.attendance.heading }}</h2>
      <p class="muted">
        {{ t.schoolClass.attendance.intro }} {{ attendance.recordable ? t.schoolClass.attendance.recordable : t.schoolClass.attendance.readOnly }}
      </p>
      <div
        v-for="day in attendance.days"
        :key="day.date"
      >
        <h3>{{ formatDay(day.date) }}</h3>
        <p
          v-if="day.rows.length === 0"
          class="muted"
        >
          {{ t.schoolClass.attendance.noSession }}
        </p>
        <form
          v-else
          :aria-label="t.schoolClass.attendance.ofDay(formatDay(day.date))"
          @submit.prevent="onSaveAttendance(day.date)"
        >
          <table>
            <thead>
              <tr>
                <th>{{ t.common.field.student }}</th>
                <th>{{ t.common.field.item }}</th>
                <th>{{ t.schoolClass.attendance.status }}</th>
                <th>{{ t.schoolClass.attendance.note }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in day.rows"
                :key="`${r.sessionId}-${r.personId}`"
              >
                <td>{{ r.displayName }}</td>
                <td>{{ r.number === null ? r.title : `${r.number}. ${r.title}` }} · {{ formatSpan(r.startsAt, r.endsAt) }}</td>
                <td>
                  <select
                    v-model="marks[markKey(r.sessionId, r.personId)]"
                    :aria-label="t.schoolClass.attendance.statusOf(r.displayName, r.title)"
                    :disabled="!attendance.recordable"
                  >
                    <option
                      value=""
                      :disabled="r.status !== null"
                    >
                      –
                    </option>
                    <option
                      v-for="st in STATUSES"
                      :key="st"
                      :value="st"
                    >
                      {{ ATTENDANCE_STATUS_LABELS[st] ?? st }}
                    </option>
                  </select>
                </td>
                <td>
                  <input
                    v-model="notes[markKey(r.sessionId, r.personId)]"
                    type="text"
                    maxlength="200"
                    :aria-label="t.schoolClass.attendance.noteOf(r.displayName, r.title)"
                    :disabled="!attendance.recordable"
                  >
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="attendance.recordable"
            class="actions"
          >
            <button
              type="submit"
              :disabled="action.busy.value"
            >
              {{ t.schoolClass.attendance.save }}
            </button>
          </p>
        </form>
      </div>
      <p class="actions">
        <a
          class="button ghost-link"
          :href="withBase(classAttendanceExportPath(props.id, props.className))"
        >{{ t.schoolClass.attendance.export }}</a>
      </p>
    </section>
    <section>
      <h2>{{ t.schoolClass.students(status.students.length) }}</h2>
      <p
        v-if="status.students.every((s) => s.choice === null)"
        class="muted"
      >
        {{ t.schoolClass.choicesLater }}
      </p>
      <ul>
        <li
          v-for="s in status.students"
          :key="s.personId"
        >
          {{ s.displayName }}
          <span
            v-if="s.choice !== null && !published"
            :class="['badge', s.choice === 'complete' ? 'badge-approved' : 'badge-proposed']"
          >{{ CHOICE_STATE_LABELS[s.choice] ?? s.choice }}</span>
          <span
            v-if="s.placement"
            class="muted"
          > · {{ placementText(s) }}</span>
        </li>
      </ul>
    </section>
  </template>
</template>
