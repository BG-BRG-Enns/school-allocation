<script setup lang="ts">
// Proposing or editing an activity: what it is, who teaches it, when it
// takes place and what each session credits per project day, how many may
// rank it and who, which classes are fixed into it, what it costs. A
// session is placed in the school's period grid ("from the 2nd period, 2
// periods") or, for a trip, by the clock. The rules are the server's
// (school-core); a refusal names them here.

import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { spanOfPeriods, type Period } from '@school-allocation/school-core'
import { loadPeriods } from '../lib/admin-api.ts'
import { loadParticipants, type ParticipantsResponse } from '../lib/allocation-api.ts'
import { ApiError } from '../lib/api-rules.ts'
import { createItem, loadCampaign, loadClasses, loadItems, proposeItem, searchTeachers, updateItem, type Campaign, type Item, type ItemInput, type ItemInvalidBody } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, instantInSchoolZone, localDateOf, localTimeOf, periodLabel, touchedDates } from '../lib/format.ts'
import { ASSIGNMENT_SOURCE_LABELS, CATALOGUE_PROBLEM_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

const props = defineProps<{ id: string, itemId?: string }>()
const router = useRouter()
usePageTitle(() => props.itemId ? 'Aktivität bearbeiten' : 'Neue Aktivität')

const campaign = ref<Campaign | null>(null)
const classes = ref<{ className: string, grade: number }[]>([])
const grid = ref<Period[]>([])
const existing = ref<Item | null>(null)
/** The participants of this activity in the published run, when there is one and the caller may see them. */
const participantsView = ref<ParticipantsResponse | null>(null)
const loading = useFeedback()
const saving = useFeedback()
const problems = ref<string[]>([])

const title = ref('')
const description = ref('')
const location = ref('')
const feeEuro = ref('')
const feeNote = ref('')
const places = ref(20)
const minParticipants = ref(0)
const cancellableBelowMin = ref(true)
const fixedClasses = ref<string[]>([])
const eligibleGrades = ref<number[]>([])
const eligibleClasses = ref<string[]>([])
const teachers = ref<{ personId: string, displayName: string }[]>([])
const teacherQuery = ref('')
const teacherResults = ref<{ personId: string, displayName: string }[]>([])

/** The default a session starts from: the 2nd period, two periods long. */
const DEFAULT_FROM = 2
const DEFAULT_COUNT = 2

interface SessionForm {
  /** Placed in the grid (periods) or by the clock. */
  mode: 'periods' | 'clock'
  fromPeriod: number
  count: number
  date: string
  start: string
  endDate: string
  end: string
  location: string
  credits: Record<string, number>
}
const sessions = ref<SessionForm[]>([])

const grades = computed(() => [...new Set(classes.value.map((c) => c.grade))].sort((a, b) => a - b))
const isFixed = computed(() => fixedClasses.value.length > 0)
const lastPeriod = computed(() => grid.value.at(-1)?.period ?? 0)

/** The campaign, the roster's classes, the grid and, when editing, the item; again when the route names another. */
async function load(): Promise<void> {
  problems.value = []
  sessions.value = []
  await loading.run(async () => {
    const [view, found, periods] = await Promise.all([loadCampaign(props.id), loadClasses(props.id), loadPeriods()])
    campaign.value = view.campaign
    classes.value = found.classes
    grid.value = periods.periods
    if (props.itemId) {
      const item = (await loadItems(props.id)).items.find((i) => i.id === props.itemId)
      if (!item) throw new ApiError(404, 'not_found')
      existing.value = item
      title.value = item.title
      description.value = item.description
      location.value = item.location
      feeEuro.value = item.feeCents === 0 ? '' : (item.feeCents / 100).toFixed(2).replace('.', ',')
      feeNote.value = item.feeNote
      places.value = item.places
      minParticipants.value = item.minParticipants
      cancellableBelowMin.value = item.cancellableBelowMin
      fixedClasses.value = [...item.fixedClasses]
      eligibleGrades.value = [...item.eligibleGrades]
      eligibleClasses.value = [...item.eligibleClasses]
      teachers.value = [...item.teachers]
      sessions.value = item.sessions.map(fromStored)
    } else {
      existing.value = null
      const me = session.value
      if (me?.person?.kind === 'teacher') teachers.value = [{ personId: me.person.id, displayName: me.displayName }]
      addSession()
    }
  })
  // From publication on, the people in it: the organizer's and the auditor's always, a teacher's for their own item.
  participantsView.value = null
  if (props.itemId && campaign.value && (campaign.value.state === 'results' || campaign.value.state === 'archived')) {
    try {
      participantsView.value = await loadParticipants(props.id, props.itemId)
    } catch (err) {
      if (!(err instanceof ApiError && (err.status === 403 || err.status === 409))) throw err
    }
  }
}
onMounted(load)
watch(() => [props.id, props.itemId], load)

/** A stored session as the form shows it: on the grid when its times are the grid's, by the clock otherwise. */
function fromStored(s: Item['sessions'][number]): SessionForm {
  const form: SessionForm = {
    mode: 'clock',
    ...defaultPeriods(),
    date: localDateOf(s.startsAt),
    start: localTimeOf(s.startsAt),
    endDate: localDateOf(s.endsAt),
    end: localTimeOf(s.endsAt),
    location: s.location,
    credits: Object.fromEntries(s.credits.map((c) => [c.date, c.minutes])),
  }
  const label = periodLabel(grid.value, s.startsAt, s.endsAt)
  if (label !== null) {
    const [from, to] = label.replace(' EH', '').split('.–').map((part) => Number.parseInt(part, 10))
    form.mode = 'periods'
    form.fromPeriod = from ?? DEFAULT_FROM
    form.count = (to ?? from ?? DEFAULT_FROM) - (from ?? DEFAULT_FROM) + 1
  }
  return form
}

/** The default start and length, fitted to a grid shorter than the default assumes. */
function defaultPeriods(): { fromPeriod: number, count: number } {
  const fromPeriod = Math.max(1, Math.min(DEFAULT_FROM, lastPeriod.value))
  return { fromPeriod, count: Math.max(1, Math.min(DEFAULT_COUNT, lastPeriod.value - fromPeriod + 1)) }
}

function addSession(): void {
  const day = campaign.value?.projectDays[0] ?? ''
  const s: SessionForm = { mode: grid.value.length > 0 ? 'periods' : 'clock', ...defaultPeriods(), date: day, start: '08:00', endDate: day, end: '13:00', location: '', credits: {} }
  syncPeriods(s)
  sessions.value.push(s)
}

function removeSession(index: number): void {
  sessions.value.splice(index, 1)
}

/** In period mode the clock fields follow the grid; the credit of a day not yet entered follows the clock. */
function syncPeriods(s: SessionForm): void {
  if (s.mode !== 'periods') return
  const span = spanOfPeriods(grid.value, Number(s.fromPeriod), Number(s.count))
  if (!span) return
  s.start = span.starts
  s.end = span.ends
  s.endDate = s.date
}

/** The days a session touches, which it may credit; an end at midnight does not touch the next day. */
function touched(s: SessionForm): string[] {
  return touchedDates(s.date, s.endDate, s.end)
}

/** Minutes between the session's clock times on one day: the starting point for the credit a teacher then corrects. */
function clockMinutes(s: SessionForm): number {
  const [sh = 0, sm = 0] = s.start.split(':').map(Number)
  const [eh = 0, em = 0] = s.end.split(':').map(Number)
  return Math.max(0, eh * 60 + em - (sh * 60 + sm))
}

function creditOf(s: SessionForm, date: string): number {
  if (s.credits[date] === undefined) s.credits[date] = touched(s).length === 1 ? clockMinutes(s) : 0
  return s.credits[date]
}

function setCredit(s: SessionForm, date: string, value: string): void {
  s.credits[date] = Number(value)
}

/** The periods a session may span from its first one: up to the grid's last. */
function maxCount(s: SessionForm): number {
  return Math.max(1, lastPeriod.value - Number(s.fromPeriod) + 1)
}

async function findTeachers(): Promise<void> {
  if (teacherQuery.value.trim() === '') {
    teacherResults.value = []
    return
  }
  const found = await searchTeachers(props.id, teacherQuery.value.trim())
  teacherResults.value = found.teachers.filter((t) => !teachers.value.some((chosen) => chosen.personId === t.personId))
}

function addTeacher(teacher: { personId: string, displayName: string }): void {
  teachers.value.push(teacher)
  teacherQuery.value = ''
  teacherResults.value = []
}

function removeTeacher(personId: string): void {
  teachers.value = teachers.value.filter((t) => t.personId !== personId)
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** A wall-clock time of the school's zone as an instant, whatever zone the browser is in. */
function instant(date: string, time: string): string {
  return instantInSchoolZone(date, time)
}

function input(): ItemInput {
  const euro = feeEuro.value.trim().replace(',', '.')
  // Optional single-line fields are left out when empty: the schema takes a
  // line of text or nothing, not an empty string.
  return {
    title: title.value.trim(),
    description: description.value.trim(),
    location: location.value.trim() || undefined,
    feeCents: euro === '' ? 0 : Math.round(Number(euro) * 100),
    feeNote: feeNote.value.trim(),
    places: Number(places.value),
    minParticipants: isFixed.value ? 0 : Number(minParticipants.value),
    cancellableBelowMin: isFixed.value ? false : cancellableBelowMin.value,
    fixedClasses: fixedClasses.value,
    eligibleGrades: eligibleGrades.value,
    eligibleClasses: eligibleClasses.value,
    teachers: teachers.value.map((t) => t.personId),
    sessions: sessions.value.map((s) => {
      syncPeriods(s)
      return {
        startsAt: instant(s.date, s.start),
        endsAt: instant(s.endDate || s.date, s.end),
        location: s.location.trim() || undefined,
        credits: touched(s).map((date) => ({ date, minutes: creditOf(s, date) })),
      }
    }),
  }
}

async function save(propose: boolean): Promise<void> {
  problems.value = []
  const ok = await saving.run(async () => {
    try {
      const item = existing.value ? await updateItem(existing.value.id, input()) : await createItem(props.id, input())
      if (propose && item.state === 'draft') await proposeItem(item.id)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'item_invalid') {
        const body = err.body as unknown as ItemInvalidBody
        problems.value = [
          ...body.problems.map((p) => `${CATALOGUE_PROBLEM_LABELS[p.code] ?? p.code}${p.session === undefined ? '' : ` (Termin ${p.session + 1})`}`),
          ...(body.unknownTeachers.length > 0 ? ['Eine Lehrkraft ist nicht in der Personenliste'] : []),
        ]
      }
      throw err
    }
  })
  if (ok) await router.push(`/wahlen/${props.id}`)
}
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← Zur Wahl
    </RouterLink>
  </p>
  <h1>{{ props.itemId ? 'Aktivität bearbeiten' : 'Neue Aktivität' }}</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <form
    v-if="campaign"
    @submit.prevent="save(false)"
  >
    <p
      v-if="existing?.reviewNote"
      class="notice"
    >
      Rückmeldung der Organisation: {{ existing.reviewNote }}
    </p>
    <p class="field">
      <label for="title">Titel</label>
      <input
        id="title"
        v-model="title"
        required
        maxlength="200"
      >
    </p>
    <p class="field">
      <label for="description">Beschreibung</label>
      <textarea
        id="description"
        v-model="description"
        rows="5"
        maxlength="4000"
      />
    </p>
    <p class="field">
      <label for="location">Ort oder Treffpunkt</label>
      <input
        id="location"
        v-model="location"
        maxlength="200"
      >
    </p>

    <h2>Lehrkräfte</h2>
    <div class="chips">
      <button
        v-for="teacher in teachers"
        :key="teacher.personId"
        type="button"
        class="ghost"
        :aria-label="`${teacher.displayName} entfernen`"
        @click="removeTeacher(teacher.personId)"
      >
        {{ teacher.displayName }} ✕
      </button>
    </div>
    <p class="field">
      <label for="teacher-search">Lehrkraft hinzufügen</label>
      <input
        id="teacher-search"
        v-model="teacherQuery"
        type="search"
        maxlength="100"
        @input="findTeachers"
      >
    </p>
    <ul
      v-if="teacherResults.length > 0"
      class="plain choices"
    >
      <li
        v-for="teacher in teacherResults"
        :key="teacher.personId"
      >
        <button
          type="button"
          class="ghost"
          @click="addTeacher(teacher)"
        >
          {{ teacher.displayName }} hinzufügen
        </button>
      </li>
    </ul>

    <h2>Termine</h2>
    <p class="muted">
      Ein Termin liegt in den Unterrichtseinheiten der Schule oder, etwa ein Ausflug, nach der Uhr. Angerechnet werden die Minuten, die die Lehrkraft je Projekttag angibt; Anreise und Pausen zählen nicht.
    </p>
    <div
      v-for="(s, index) in sessions"
      :key="index"
      class="session"
    >
      <h3>Termin {{ index + 1 }}</h3>
      <p class="field">
        <label :for="`s-${index}-mode`">Eingabe</label>
        <select
          :id="`s-${index}-mode`"
          v-model="s.mode"
          @change="syncPeriods(s)"
        >
          <option
            value="periods"
            :disabled="grid.length === 0"
          >
            nach Einheiten
          </option>
          <option value="clock">
            nach Uhrzeit
          </option>
        </select>
      </p>
      <div
        v-if="s.mode === 'periods'"
        class="row"
      >
        <p class="field">
          <label :for="`s-${index}-day`">Tag</label>
          <select
            :id="`s-${index}-day`"
            v-model="s.date"
            required
            @change="syncPeriods(s)"
          >
            <option
              v-for="day in campaign.projectDays"
              :key="day"
              :value="day"
            >
              {{ formatDay(day) }}
            </option>
          </select>
        </p>
        <p class="field">
          <label :for="`s-${index}-from`">ab Einheit</label>
          <select
            :id="`s-${index}-from`"
            v-model.number="s.fromPeriod"
            @change="s.count = Math.min(Number(s.count), maxCount(s)); syncPeriods(s)"
          >
            <option
              v-for="p in grid"
              :key="p.period"
              :value="p.period"
            >
              {{ p.period }}. EH ({{ p.starts }})
            </option>
          </select>
        </p>
        <p class="field">
          <label :for="`s-${index}-count`">Einheiten</label>
          <input
            :id="`s-${index}-count`"
            v-model.number="s.count"
            type="number"
            min="1"
            :max="maxCount(s)"
            required
            @input="syncPeriods(s)"
          >
        </p>
        <p class="field">
          <span class="muted">{{ s.start }} – {{ s.end }}</span>
        </p>
        <p class="field">
          <label :for="`s-${index}-location`">Ort</label>
          <input
            :id="`s-${index}-location`"
            v-model="s.location"
            maxlength="200"
          >
        </p>
      </div>
      <div
        v-else
        class="row"
      >
        <p class="field">
          <label :for="`s-${index}-date`">Beginn am</label>
          <input
            :id="`s-${index}-date`"
            v-model="s.date"
            type="date"
            required
            @change="s.endDate = s.endDate < s.date ? s.date : s.endDate"
          >
        </p>
        <p class="field">
          <label :for="`s-${index}-start`">um</label>
          <input
            :id="`s-${index}-start`"
            v-model="s.start"
            type="time"
            required
          >
        </p>
        <p class="field">
          <label :for="`s-${index}-end-date`">Ende am</label>
          <input
            :id="`s-${index}-end-date`"
            v-model="s.endDate"
            type="date"
            required
          >
        </p>
        <p class="field">
          <label :for="`s-${index}-end`">um</label>
          <input
            :id="`s-${index}-end`"
            v-model="s.end"
            type="time"
            required
          >
        </p>
        <p class="field">
          <label :for="`s-${index}-location`">Ort</label>
          <input
            :id="`s-${index}-location`"
            v-model="s.location"
            maxlength="200"
          >
        </p>
      </div>
      <div class="row">
        <p
          v-for="date in touched(s)"
          :key="date"
          class="field"
        >
          <label :for="`s-${index}-credit-${date}`">Minuten am {{ formatDay(date) }}</label>
          <input
            :id="`s-${index}-credit-${date}`"
            type="number"
            min="0"
            max="1440"
            step="5"
            :value="creditOf(s, date)"
            @input="setCredit(s, date, ($event.target as HTMLInputElement).value)"
          >
        </p>
      </div>
      <p>
        <button
          v-if="sessions.length > 1"
          type="button"
          class="ghost"
          @click="removeSession(index)"
        >
          Termin entfernen
        </button>
      </p>
    </div>
    <p>
      <button
        type="button"
        class="ghost"
        :disabled="sessions.length >= 10"
        @click="addSession"
      >
        Termin hinzufügen
      </button>
    </p>

    <h2>Teilnahme</h2>
    <fieldset class="field">
      <legend>Fix zugeteilte Klassen (die Aktivität findet für sie statt; sie wählen sie nicht)</legend>
      <div class="checks">
        <label
          v-for="c in classes"
          :key="c.className"
        >
          <input
            type="checkbox"
            :checked="fixedClasses.includes(c.className)"
            @change="fixedClasses = toggle(fixedClasses, c.className); eligibleClasses = eligibleClasses.filter((name) => !fixedClasses.includes(name))"
          >
          {{ c.className }}
        </label>
      </div>
    </fieldset>
    <p class="field">
      <label for="places">{{ isFixed ? 'Zusätzliche Plätze für andere Schüler/innen' : 'Plätze' }}</label>
      <input
        id="places"
        v-model.number="places"
        type="number"
        min="0"
        max="1000"
        required
      >
    </p>
    <template v-if="!isFixed">
      <p class="field">
        <label for="min">Mindestteilnehmer/innen</label>
        <input
          id="min"
          v-model.number="minParticipants"
          type="number"
          min="0"
          max="1000"
        >
      </p>
      <p class="field">
        <label>
          <input
            v-model="cancellableBelowMin"
            type="checkbox"
          >
          Darf bei zu wenigen Anmeldungen abgesagt werden
        </label>
      </p>
    </template>
    <fieldset class="field">
      <legend>Wählbar für Schulstufen (keine Auswahl: alle)</legend>
      <div class="checks">
        <label
          v-for="grade in grades"
          :key="grade"
        >
          <input
            type="checkbox"
            :checked="eligibleGrades.includes(grade)"
            @change="eligibleGrades = eligibleGrades.includes(grade) ? eligibleGrades.filter((g) => g !== grade) : [...eligibleGrades, grade].sort((a, b) => a - b)"
          >
          {{ grade }}.
        </label>
      </div>
    </fieldset>
    <fieldset class="field">
      <legend>Wählbar für Klassen (keine Auswahl: alle)</legend>
      <div class="checks">
        <label
          v-for="c in classes"
          :key="c.className"
        >
          <input
            type="checkbox"
            :checked="eligibleClasses.includes(c.className)"
            :disabled="fixedClasses.includes(c.className)"
            @change="eligibleClasses = toggle(eligibleClasses, c.className)"
          >
          {{ c.className }}
        </label>
      </div>
    </fieldset>

    <h2>Beitrag</h2>
    <p class="field">
      <label for="fee">Beitrag in Euro (leer: keiner)</label>
      <input
        id="fee"
        v-model="feeEuro"
        inputmode="decimal"
        pattern="[0-9]{1,4}([,.][0-9]{1,2})?"
        size="8"
      >
    </p>
    <p class="field">
      <label for="fee-note">Wofür</label>
      <input
        id="fee-note"
        v-model="feeNote"
        maxlength="500"
      >
    </p>

    <ul
      v-if="problems.length > 0"
      class="alert"
      role="alert"
    >
      <li
        v-for="problem in problems"
        :key="problem"
      >
        {{ problem }}
      </li>
    </ul>
    <p
      v-else-if="saving.error.value"
      role="alert"
      class="alert"
    >
      {{ saving.error.value }}
    </p>
    <p class="actions">
      <button
        type="submit"
        :disabled="saving.busy.value"
      >
        Speichern
      </button>
      <button
        v-if="!existing || existing.state === 'draft'"
        type="button"
        :disabled="saving.busy.value"
        @click="save(true)"
      >
        Speichern und einreichen
      </button>
    </p>
  </form>
  <section v-if="participantsView">
    <h2>Teilnehmer/innen ({{ participantsView.participants.length }})</h2>
    <p
      v-if="participantsView.item.cancelled"
      class="alert"
      role="status"
    >
      Diese Aktivität wurde bei der Zuteilung abgesagt: zu wenige Wünsche für ihre Mindestteilnehmerzahl.
    </p>
    <ul v-else-if="participantsView.participants.length > 0">
      <li
        v-for="p in participantsView.participants"
        :key="p.personId"
      >
        {{ p.displayName }} ({{ p.className }}) <span class="muted">{{ ASSIGNMENT_SOURCE_LABELS[p.source] ?? p.source }}</span>
      </li>
    </ul>
    <p
      v-else
      class="muted"
    >
      Niemand wurde dieser Aktivität zugeteilt.
    </p>
  </section>
</template>
