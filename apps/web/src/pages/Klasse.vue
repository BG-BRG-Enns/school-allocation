<script setup lang="ts">
// A class as its class teacher sees it in a campaign: the students, and
// the class activities that take the class on which days; who has chosen,
// once the window is open; from publication on each one's places and the
// minutes they miss, and for those short of minutes the placement into an
// activity with free places that fits the gap (D-06), with a reason; and
// the attendance per project day and session (D-16), recorded here.

import { computed, onMounted, ref, watch } from 'vue'
import { classAttendanceExportPath, loadClassAttendance, placeStudent, recordAttendance, type AttendanceStatus, type ClassAttendanceResponse } from '../lib/allocation-api.ts'
import { withBase } from '../lib/base.ts'
import { loadCampaign, loadClassStatus, type Campaign, type ClassStatus } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, formatSpan } from '../lib/format.ts'
import { ASSIGNMENT_SOURCE_LABELS, ATTENDANCE_STATUS_LABELS, CHOICE_STATE_LABELS, ITEM_STATE_LABELS, MOVE_PROBLEM_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string, className: string }>()
const campaign = ref<Campaign | null>(null)
const status = ref<ClassStatus | null>(null)
const loading = useFeedback()
const action = useFeedback()
usePageTitle(() => `Klasse ${props.className}`)
const published = computed(() => status.value?.students.some((s) => s.placement !== null && s.placement !== undefined) ?? false)
const unplaced = computed(() => status.value?.students.filter((s) => (s.placement?.deficit ?? 0) > 0) ?? [])
const placementText = (s: ClassStatus['students'][number]): string => s.placement?.items.map((i) => `${i.title} (${ASSIGNMENT_SOURCE_LABELS[i.source] ?? i.source})`).join(', ') || 'kein Platz'
/** The placement form's choice and reason, per student. */
const chosen = ref<Record<string, string>>({})
const reasons = ref<Record<string, string>>({})
type Offer = NonNullable<ClassStatus['students'][number]['placement']>['offers'][number]
const offerLabel = (o: Offer): string => `${o.number === null ? '' : `${o.number}. `}${o.title} – ${o.problems.length > 0 ? (MOVE_PROBLEM_LABELS[o.problems[0] ?? ''] ?? o.problems[0]) : `${o.free} ${o.free === 1 ? 'freier Platz' : 'freie Plätze'}`}`

async function onPlace(personId: string): Promise<void> {
  const itemId = chosen.value[personId] ?? ''
  const reason = (reasons.value[personId] ?? '').trim()
  if (itemId === '' || reason === '') return
  const ok = await action.run(async () => {
    status.value = await placeStudent(props.id, props.className, personId, itemId, reason)
  }, 'Zugeteilt; die Schülerin oder der Schüler wird benachrichtigt.')
  if (ok) {
    delete chosen.value[personId]
    delete reasons.value[personId]
  }
}

/** The attendance, from publication on; the marks as edited, per session and student, saved per project day. */
const attendance = ref<ClassAttendanceResponse | null>(null)
const marks = ref<Record<string, AttendanceStatus | ''>>({})
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
}

/** Saves a day's marks: one request per session, the students of the class in it, each with the note already recorded; the other days' unsaved marks stay. */
async function onSaveAttendance(date: string): Promise<void> {
  const day = attendance.value?.days.find((d) => d.date === date)
  if (!day) return
  const bySession = new Map<string, { personId: string, status: AttendanceStatus, note: string }[]>()
  for (const r of day.rows) {
    const status = marks.value[markKey(r.sessionId, r.personId)]
    if (status === '' || status === undefined) continue
    const list = bySession.get(r.sessionId) ?? []
    list.push({ personId: r.personId, status, note: r.note })
    bySession.set(r.sessionId, list)
  }
  await action.run(async () => {
    for (const [sessionId, entries] of bySession) await recordAttendance(sessionId, entries)
    const fresh = await loadClassAttendance(props.id, props.className)
    attendance.value = fresh
    for (const r of fresh.days.find((d) => d.date === date)?.rows ?? []) marks.value[markKey(r.sessionId, r.personId)] = r.status ?? ''
  }, 'Anwesenheit gespeichert.')
}

async function load(): Promise<void> {
  await loading.run(async () => {
    const [view, s] = await Promise.all([loadCampaign(props.id), loadClassStatus(props.id, props.className)])
    campaign.value = view.campaign
    status.value = s
    await loadAttendance()
  })
}
onMounted(load)
watch(() => [props.id, props.className], load)
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← Zur Wahl
    </RouterLink>
  </p>
  <h1>Klasse {{ props.className }}</h1>
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
      {{ campaign.name }} · Schuljahr {{ campaign.schoolYear }}
    </p>
    <section>
      <h2>Klassenaktivitäten</h2>
      <p v-if="status.classActivities.length === 0">
        Keine Aktivität nimmt die ganze Klasse mit.
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
      <h2>Nicht vollständig zugeteilt ({{ unplaced.length }})</h2>
      <p
        v-if="unplaced.length === 0"
        class="muted"
      >
        Alle Schüler/innen der Klasse haben an jedem Tag ihr Programm.
      </p>
      <ul v-else>
        <li
          v-for="s in unplaced"
          :key="s.personId"
        >
          <strong>{{ s.displayName }}</strong>: {{ s.placement?.deficit }} Minuten fehlen<template v-if="s.placement && s.placement.items.length > 0">
            · bisher {{ s.placement.items.map((i) => i.title).join(', ') }}
          </template>
          <form
            v-if="campaign.state === 'results'"
            class="inline-form"
            :aria-label="`${s.displayName} zuteilen`"
            @submit.prevent="onPlace(s.personId)"
          >
            <p
              v-if="(s.placement?.offers.length ?? 0) === 0"
              class="muted"
            >
              Keine Aktivität mit freien Plätzen passt in die Lücke; die Organisation kann anders zuteilen.
            </p>
            <template v-else>
              <p class="field">
                <label :for="`place-item-${s.personId}`">Aktivität für {{ s.displayName }}</label>
                <select
                  :id="`place-item-${s.personId}`"
                  v-model="chosen[s.personId]"
                  required
                >
                  <option value="">
                    Bitte wählen
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
                <label :for="`place-reason-${s.personId}`">Begründung für {{ s.displayName }}</label>
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
                  Zuteilen
                </button>
              </p>
            </template>
          </form>
        </li>
      </ul>
      <p class="muted">
        Die Zuteilung in eine Lücke ist der Weg des Klassenvorstands; die Schülerin oder der Schüler wird benachrichtigt, die Organisation sieht jede Änderung mit ihrer Begründung.
      </p>
    </section>
    <section v-if="attendance">
      <h2>Anwesenheit</h2>
      <p class="muted">
        Je Projekttag und Termin, für die Schüler/innen der Klasse; getrennt von der Zuteilung. {{ attendance.recordable ? 'Eintragen und speichern, Korrekturen jederzeit bis zum Abschluss der Wahl.' : 'Nur lesen.' }}
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
          An diesem Tag hat niemand aus der Klasse einen Termin.
        </p>
        <form
          v-else
          :aria-label="`Anwesenheit ${formatDay(day.date)}`"
          @submit.prevent="onSaveAttendance(day.date)"
        >
          <table>
            <thead>
              <tr>
                <th>Schüler/in</th>
                <th>Aktivität</th>
                <th>Anwesenheit</th>
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
                    :aria-label="`Anwesenheit ${r.displayName}, ${r.title}`"
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
              Anwesenheit speichern
            </button>
          </p>
        </form>
      </div>
      <p class="actions">
        <a
          class="button ghost-link"
          :href="withBase(classAttendanceExportPath(props.id, props.className))"
        >Anwesenheit als Excel</a>
      </p>
    </section>
    <section>
      <h2>Schüler/innen ({{ status.students.length }})</h2>
      <p
        v-if="status.students.every((s) => s.choice === null)"
        class="muted"
      >
        Wer schon gewählt hat, zeigt diese Seite, sobald die Wahl läuft.
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
