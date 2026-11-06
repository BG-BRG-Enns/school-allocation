<script setup lang="ts">
// Proposing or editing an activity: what it is, who teaches it, when it
// takes place, how many may rank it and who, which classes are fixed into it, what it costs. A
// session is placed in the school's period grid ("from the 2nd period, 2
// periods") or, for a trip, by the clock; what it credits per project day
// the server derives from the school's periods. The rules are the server's
// (school-core); a refusal names them here.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { spanOfPeriods, type DayDemand, type Period } from '@school-allocation/school-core'
import Collapsible from '../components/Collapsible.vue'
import DemandTable from '../components/DemandTable.vue'
import { loadPeriods } from '../lib/admin-api.ts'
import { loadParticipants, type ParticipantsResponse } from '../lib/allocation-api.ts'
import { ApiError } from '../lib/api-rules.ts'
import { checkItem, createItem, loadCampaign, loadCampaignAvailability, loadCategories, loadClasses, loadDemand, loadItems, proposeItem, searchTeachers, setCompanions, updateItem, type Campaign, type Category, type ClassConflictView, type GateCellView, type Item, type ItemCheckResponse, type ItemInput, type ItemInvalidBody } from '../lib/campaigns-api.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, instantInSchoolZone, localDateOf, localTimeOf, periodsOnGrid, touchedDates } from '../lib/format.ts'
import { cellsAddedBy, cellsText, refusalText } from '../lib/offer-cells.ts'
import { describeCells } from '@school-allocation/school-core'
import { t } from '../lib/i18n.ts'
import { ASSIGNMENT_SOURCE_LABELS, CATALOGUE_PROBLEM_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

const props = defineProps<{ id: string, itemId?: string }>()
const router = useRouter()
usePageTitle(() => props.itemId ? t.item.editTitle : t.common.page.newItem)

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
/** The places a new activity starts with, and the extra places a class activity starts with. */
const DEFAULT_PLACES = 20
const places = ref(DEFAULT_PLACES)
/** Whether the places are the teacher's own number: typed, or stored with the activity. Until then they follow the kind of activity. */
const placesTouched = ref(false)
const minParticipants = ref(0)
const cancellableBelowMin = ref(true)
const fixedClasses = ref<string[]>([])
const eligibleGrades = ref<number[]>([])
const eligibleClasses = ref<string[]>([])
/** The school's categories, and the ones the activity belongs to. */
const categories = ref<Category[]>([])
const categoryIds = ref<string[]>([])
const teachers = ref<{ personId: string, displayName: string }[]>([])
/** Which of the teachers leads; '' while none is named. Stored with the activity: whoever is added accompanies. */
const leadId = ref('')
/** How many companions the lead wants beside them (the school's wish 6). */
const companionsWanted = ref(0)
const teacherQuery = ref('')
const teacherResults = ref<{ personId: string, displayName: string }[]>([])
/** The teachers not plainly available on the registration's days, for the warnings beside the chosen ones. */
const limited = ref<{ personId: string, date: string, status: 'unavailable' | 'if_needed' }[]>([])
/** Places and demand, for whoever may see it: where places are still missing, before proposing. */
const demand = ref<DayDemand[]>([])
/** What a submission would meet, asked of the server as the form changes: the cells the activity serves, the gate's verdict, its class conflicts. */
const check = ref<ItemCheckResponse | null>(null)
const organizes = ref(false)
/** Refusals of the submission itself (409), rendered as the hints are. */
const refusals = ref<string[]>([])

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
}
const sessions = ref<SessionForm[]>([])

const grades = computed(() => [...new Set(classes.value.map((c) => c.grade))].sort((a, b) => a - b))
const isFixed = computed(() => fixedClasses.value.length > 0)
/** No places and no classes: an activity of its teachers alone, which nobody ranks and the offer gate does not judge. */
const staffOnly = computed(() => !isFixed.value && Number(places.value) === 0)
// A class activity starts without extra places, an activity to choose with the default, until the teacher types a number.
watch(isFixed, (fixed) => {
  if (!placesTouched.value) places.value = fixed ? 0 : DEFAULT_PLACES
})
const lastPeriod = computed(() => grid.value.at(-1)?.period ?? 0)

/** The campaign, the roster's classes, the grid and, when editing, the item; again when the route names another. */
async function load(): Promise<void> {
  problems.value = []
  sessions.value = []
  await loading.run(async () => {
    const [view, found, periods, school] = await Promise.all([loadCampaign(props.id), loadClasses(props.id), loadPeriods(), loadCategories()])
    campaign.value = view.campaign
    classes.value = found.classes
    grid.value = periods.periods
    categories.value = school.categories
    // An organizer edits activities after the catalogue too, when nobody proposes any more.
    limited.value = view.may.propose || view.may.organize ? (await loadCampaignAvailability(props.id)).limited : []
    demand.value = view.may.seeDemand ? (await loadDemand(props.id)).demand : []
    organizes.value = view.may.organize
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
      placesTouched.value = true
      minParticipants.value = item.minParticipants
      cancellableBelowMin.value = item.cancellableBelowMin
      fixedClasses.value = [...item.fixedClasses]
      eligibleGrades.value = [...item.eligibleGrades]
      eligibleClasses.value = [...item.eligibleClasses]
      categoryIds.value = [...item.categoryIds]
      teachers.value = [...item.teachers]
      leadId.value = item.teachers.find((teacher) => teacher.lead)?.personId ?? ''
      companionsWanted.value = item.companionsWanted
      sessions.value = item.sessions.map(fromStored)
    } else {
      existing.value = null
      places.value = DEFAULT_PLACES
      placesTouched.value = false
      categoryIds.value = []
      companionsWanted.value = 0
      const me = session.value
      // A teacher's new activity is their own to lead; an organizer who is none names the lead by adding the first teacher.
      teachers.value = me?.person?.kind === 'teacher' ? [{ personId: me.person.id, displayName: me.displayName }] : []
      leadId.value = teachers.value[0]?.personId ?? ''
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

/**
 * The server's check of the form as it stands, a moment after the last
 * change: the shape alone counts, so a title not yet typed is sent as a
 * dash; a stored activity goes with its id, so it is left out of the
 * demand and a resubmission is judged by what it adds. A form the schema
 * refuses (a date not yet chosen) leaves the last answer.
 */
let checkTimer: ReturnType<typeof setTimeout> | undefined
/** The check last asked for: an answer to an earlier one is dropped, so the hints are the form's as it stands. */
let checkSeq = 0
let gone = false
// A check still pending when the page is left is dropped: the draft it would name may be deleted by then, and the browser logs the 404.
onBeforeUnmount(() => {
  gone = true
  clearTimeout(checkTimer)
})
async function runCheck(): Promise<void> {
  if (gone || !campaign.value || !(campaign.value.state === 'catalogue' || organizes.value)) return
  const seq = ++checkSeq
  try {
    const shape = input()
    const answer = await checkItem(props.id, { item: { ...shape, title: shape.title || '–' }, ...(existing.value ? { itemId: existing.value.id } : {}) })
    if (seq === checkSeq) check.value = answer
  } catch {
    // A hint only: a form the schema refuses, a date not yet whole, or a server that says no leaves the last answer standing.
  }
}
watch([places, fixedClasses, eligibleGrades, eligibleClasses, sessions, existing, () => loading.busy.value], () => {
  if (loading.busy.value || !campaign.value) return
  clearTimeout(checkTimer)
  checkTimer = setTimeout(() => {
    void runCheck()
  }, 400)
}, { deep: true })

/** The hints from the check: what the activity brings, whether the gate would refuse a teacher's submission, the conflicts. */
const gateHints = computed<{ text: string, alert: boolean }[]>(() => {
  const c = check.value
  if (!c || isFixed.value || staffOnly.value) return []
  const lines: { text: string, alert: boolean }[] = []
  if (c.served.length === 0 && sessions.value.length > 0) lines.push({ text: t.item.gate.servesNothing, alert: false })
  else {
    const under = cellsAddedBy(c.served, c.before, c.after).filter((cell) => !cell.reached)
    lines.push(under.length > 0 ? { text: t.item.gate.brings(cellsText(describeCells(under, c.before))), alert: false } : { text: t.item.gate.bringsNothing, alert: c.locked })
  }
  if (c.locked && c.refused) {
    for (const sentence of refusalText(c.cells, c.before)) lines.push({ text: sentence, alert: !organizes.value })
    lines.push({ text: organizes.value ? t.item.gate.organizerAnyway : t.item.gate.advice, alert: !organizes.value })
  }
  return lines
})
const conflictHints = computed(() => (check.value?.conflicts ?? []).map(conflictText))

function conflictText(c: ClassConflictView): string {
  return t.item.conflict(c.className, formatDay(localDateOf(c.startsAt)), localTimeOf(c.startsAt), localTimeOf(c.endsAt), c.title, c.lead.shortName ?? c.lead.displayName)
}

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
  }
  const span = periodsOnGrid(grid.value, s.startsAt, s.endsAt)
  if (span !== null) {
    form.mode = 'periods'
    form.fromPeriod = span.from
    form.count = span.to - span.from + 1
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
  const s: SessionForm = { mode: grid.value.length > 0 ? 'periods' : 'clock', ...defaultPeriods(), date: day, start: '08:00', endDate: day, end: '13:00', location: '' }
  syncPeriods(s)
  sessions.value.push(s)
}

function removeSession(index: number): void {
  sessions.value.splice(index, 1)
}

/** In period mode the clock fields follow the grid. */
function syncPeriods(s: SessionForm): void {
  if (s.mode !== 'periods') return
  const span = spanOfPeriods(grid.value, Number(s.fromPeriod), Number(s.count))
  if (!span) return
  s.start = span.starts
  s.end = span.ends
  s.endDate = s.date
}

/** The days a session touches; an end at midnight does not touch the next day. */
function touched(s: SessionForm): string[] {
  return touchedDates(s.date, s.endDate, s.end)
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
  // Added by hand, a teacher accompanies; only an activity nobody leads yet takes them as its lead.
  if (leadId.value === '') leadId.value = teacher.personId
  teacherQuery.value = ''
  teacherResults.value = []
}

function removeTeacher(personId: string): void {
  teachers.value = teachers.value.filter((t) => t.personId !== personId)
  // The lead taken out: nobody leads until another is named, and the server refuses an activity without one.
  if (leadId.value === personId) leadId.value = ''
}

/** Who leads as the form stands: the teacher named as the lead. */
const lead = computed(() => teachers.value.find((teacher) => teacher.personId === leadId.value) ?? null)
const companions = computed(() => teachers.value.filter((teacher) => teacher.personId !== lead.value?.personId))
/** What the lead still seeks: the number wanted less the companions named; '' when none is wanted. */
const soughtText = computed(() => {
  const wanted = Number(companionsWanted.value)
  if (!(wanted > 0)) return ''
  const sought = Math.max(0, wanted - companions.value.length)
  return sought > 0 ? t.item.teachers.sought(sought) : t.item.teachers.complete
})
/**
 * The companions alone (the owner's decision of 2026-11-04): the lead of a submitted or approved activity, or an organizer,
 * changes the list and the number wanted without the rest of the form, which stays as the activity was submitted.
 */
const companionsOnly = computed(() => {
  const item = existing.value
  if (!item || item.state === 'draft' || item.state === 'withdrawn') return false
  const me = session.value?.person?.id
  return organizes.value || (me !== undefined && item.teachers.some((teacher) => teacher.lead && teacher.personId === me))
})
/** The lead as saved: in the companions-only mode the lead stays, whatever the chips say, and everyone else sent is a companion. An organizer keeps the full edit beside it, the lead's chip included. */
const savedLeadId = computed(() => existing.value?.teachers.find((teacher) => teacher.lead)?.personId ?? null)
const companionsSaving = useFeedback()
async function saveCompanions(): Promise<void> {
  const item = existing.value
  if (!item) return
  await companionsSaving.run(async () => {
    const saved = await setCompanions(item.id, { companions: teachers.value.filter((teacher) => teacher.personId !== savedLeadId.value).map((teacher) => teacher.personId), wanted: Number(companionsWanted.value) })
    existing.value = saved
    teachers.value = [...saved.teachers]
    leadId.value = saved.teachers.find((teacher) => teacher.lead)?.personId ?? ''
    companionsWanted.value = saved.companionsWanted
  }, t.item.companions.saved)
}

/** The companion the lead hands the activity to; '' while none is chosen. */
const handOverTo = ref('')
/**
 * The lead hands the activity over to one of its companions and stays as a companion: asked once more, since the
 * lead's say over the companions goes with it. Back to the list afterwards, where the activity is marked.
 */
async function handOver(): Promise<void> {
  const item = existing.value
  const next = companions.value.find((teacher) => teacher.personId === handOverTo.value)
  if (!item || !next || !window.confirm(t.item.teachers.handOverConfirm(next.displayName))) return
  const ok = await companionsSaving.run(async () => {
    existing.value = await setCompanions(item.id, { companions: companions.value.map((teacher) => teacher.personId), wanted: Number(companionsWanted.value), lead: next.personId })
  })
  if (ok) await router.push({ path: `/wahlen/${props.id}`, query: { item: item.id } })
}

/** A warning per chosen teacher and status for the days the sessions touch that the teacher is not plainly available on. */
const availabilityWarnings = computed(() => {
  const dates = new Set(sessions.value.flatMap(touched))
  return teachers.value.flatMap((teacher) => {
    const on = (status: 'unavailable' | 'if_needed') => limited.value
      .filter((d) => d.personId === teacher.personId && d.status === status && dates.has(d.date))
      .map((d) => formatDay(d.date))
      .join(', ')
    const unavailable = on('unavailable')
    const ifNeeded = on('if_needed')
    return [
      ...(unavailable === '' ? [] : [t.item.teachers.unavailableOn(teacher.displayName, unavailable)]),
      ...(ifNeeded === '' ? [] : [t.item.teachers.ifNeededOn(teacher.displayName, ifNeeded)]),
    ]
  })
})

/** The lead and the companions the activity was saved with, for the participants. */
const savedLead = computed(() => existing.value?.teachers.find((teacher) => teacher.lead)?.displayName ?? null)
const savedCompanions = computed(() => (existing.value?.teachers ?? []).filter((teacher) => !teacher.lead).map((teacher) => teacher.displayName))

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
    minParticipants: isFixed.value || staffOnly.value ? 0 : Number(minParticipants.value),
    // Hidden without places, and sent as it stands: a stored activity keeps its flag, so an edit of its words changes nothing the allocation computed with.
    cancellableBelowMin: isFixed.value ? false : cancellableBelowMin.value,
    fixedClasses: fixedClasses.value,
    eligibleGrades: eligibleGrades.value,
    eligibleClasses: eligibleClasses.value,
    categories: categoryIds.value,
    teachers: teachers.value.map((t) => t.personId),
    // Left out while none is named: a new activity then gets its creator or the first named, a stored one is refused without a lead.
    lead: leadId.value || undefined,
    companionsWanted: Number(companionsWanted.value),
    sessions: sessions.value.map((s) => {
      syncPeriods(s)
      return {
        startsAt: instant(s.date, s.start),
        endsAt: instant(s.endDate || s.date, s.end),
        location: s.location.trim() || undefined,
      }
    }),
  }
}

async function save(propose: boolean): Promise<void> {
  problems.value = []
  refusals.value = []
  const ok = await saving.run(async () => {
    try {
      const item = existing.value ? await updateItem(existing.value.id, input()) : await createItem(props.id, input())
      // Saved: a refused submission leaves this draft, and the next save changes it rather than making another.
      existing.value = item
      if (propose && item.state === 'draft') await proposeItem(item.id)
    } catch (err) {
      // The submission refused by the school's rules: the activity is saved as a draft, the refusal says what to change.
      if (err instanceof ApiError && err.code === 'class_conflict' && Array.isArray(err.body.conflicts)) {
        refusals.value = (err.body.conflicts as ClassConflictView[]).map(conflictText)
      }
      if (err instanceof ApiError && err.code === 'target_reached' && Array.isArray(err.body.cells)) {
        refusals.value = [...refusalText(err.body.cells as GateCellView[], check.value?.before ?? demand.value), t.item.gate.advice]
      }
      if (err instanceof ApiError && err.code === 'item_invalid') {
        const body = err.body as unknown as ItemInvalidBody
        problems.value = [
          ...body.problems.map((p) => {
            const label = CATALOGUE_PROBLEM_LABELS[p.code] ?? p.code
            return p.session === undefined ? label : t.item.inSession(label, p.session + 1)
          }),
          ...(body.unknownTeachers.length > 0 ? [t.item.unknownTeachers] : []),
        ]
      }
      throw err
    }
  })
  // Back to the list, which marks the row and scrolls to it.
  if (ok) await router.push({ path: `/wahlen/${props.id}`, query: existing.value ? { item: existing.value.id } : {} })
}
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← {{ t.common.backToCampaign }}
    </RouterLink>
  </p>
  <h1>{{ props.itemId ? t.item.editTitle : t.common.page.newItem }}</h1>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <form
    v-if="campaign"
    @submit.prevent="companionsOnly && !organizes ? saveCompanions() : save(false)"
  >
    <p
      v-if="existing?.reviewNote"
      class="notice"
    >
      {{ t.item.reviewNote(existing.reviewNote) }}
    </p>
    <p class="field">
      <label for="title">{{ t.item.title }}</label>
      <input
        id="title"
        v-model="title"
        required
        maxlength="200"
      >
    </p>
    <p class="field">
      <label for="description">{{ t.item.description }}</label>
      <textarea
        id="description"
        v-model="description"
        rows="5"
        maxlength="4000"
      />
    </p>
    <p class="field">
      <label for="location">{{ t.item.location }}</label>
      <input
        id="location"
        v-model="location"
        maxlength="200"
      >
    </p>

    <h2>{{ t.common.field.teachers }}</h2>
    <div class="chips">
      <template
        v-for="teacher in teachers"
        :key="teacher.personId"
      >
        <span
          v-if="companionsOnly && !organizes && teacher.personId === savedLeadId"
          class="chip"
        >{{ teacher.displayName }}</span>
        <button
          v-else
          type="button"
          class="ghost"
          :aria-label="t.item.teachers.remove(teacher.displayName)"
          @click="removeTeacher(teacher.personId)"
        >
          {{ teacher.displayName }} ✕
        </button>
      </template>
    </div>
    <p
      v-if="lead"
      class="muted"
    >
      {{ t.item.participants.lead(lead.displayName) }}<template v-if="companions.length > 0">
        · {{ t.item.participants.companions(companions.map((teacher) => teacher.displayName).join(', ')) }}
      </template><template v-if="soughtText">
        · {{ soughtText }}
      </template>
      <br>{{ t.item.teachers.leadRule }}
    </p>
    <p
      v-else-if="teachers.length > 0"
      class="alert"
      role="status"
    >
      {{ t.item.teachers.noLead }}
    </p>
    <p
      v-if="!(companionsOnly && !organizes) && teachers.length > 1"
      class="field"
    >
      <label for="lead">{{ t.item.teachers.lead }}</label>
      <select
        id="lead"
        v-model="leadId"
      >
        <option
          v-for="teacher in teachers"
          :key="teacher.personId"
          :value="teacher.personId"
        >
          {{ teacher.displayName }}
        </option>
      </select>
    </p>
    <p
      v-for="warning in availabilityWarnings"
      :key="warning"
      class="notice"
    >
      {{ warning }}
    </p>
    <p class="field">
      <label for="teacher-search">{{ t.item.teachers.search }}</label>
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
          {{ t.item.teachers.add(teacher.displayName) }}
        </button>
      </li>
    </ul>
    <p class="field">
      <label for="companions-wanted">{{ t.item.teachers.wanted }}</label>
      <input
        id="companions-wanted"
        v-model="companionsWanted"
        type="number"
        min="0"
        max="8"
        step="1"
      >
      <span class="muted">{{ t.item.teachers.wantedHint }}</span>
    </p>
    <template v-if="companionsOnly">
      <p class="muted">
        {{ t.item.companions.intro }}
      </p>
      <p
        v-if="companionsSaving.error.value"
        role="alert"
        class="alert"
      >
        {{ companionsSaving.error.value }}
      </p>
      <p
        v-if="companionsSaving.notice.value"
        role="status"
        class="notice"
      >
        {{ companionsSaving.notice.value }}
      </p>
      <p class="actions">
        <button
          type="button"
          :disabled="companionsSaving.busy.value"
          @click="saveCompanions"
        >
          {{ t.item.companions.save }}
        </button>
      </p>
      <template v-if="!organizes">
        <p class="field">
          <label for="hand-over">{{ t.item.teachers.handOver }}</label>
          <select
            id="hand-over"
            v-model="handOverTo"
          >
            <option value="">
              –
            </option>
            <option
              v-for="teacher in companions"
              :key="teacher.personId"
              :value="teacher.personId"
            >
              {{ teacher.displayName }}
            </option>
          </select>
          <span class="muted">{{ t.item.teachers.handOverHint }}</span>
        </p>
        <p class="actions">
          <button
            type="button"
            class="ghost"
            :disabled="companionsSaving.busy.value || handOverTo === ''"
            @click="handOver"
          >
            {{ t.item.teachers.handOverSubmit }}
          </button>
        </p>
      </template>
    </template>

    <h2>{{ t.common.field.sessions }}</h2>
    <p class="muted">
      {{ t.item.sessions.intro }}
    </p>
    <div
      v-for="(s, index) in sessions"
      :key="index"
      class="session"
    >
      <h3>{{ sessions.length === 1 ? t.item.sessions.single : t.item.sessions.session(index + 1) }}</h3>
      <p class="field">
        <label :for="`s-${index}-mode`">{{ t.item.sessions.mode }}</label>
        <select
          :id="`s-${index}-mode`"
          v-model="s.mode"
          @change="syncPeriods(s)"
        >
          <option
            value="periods"
            :disabled="grid.length === 0"
          >
            {{ t.item.sessions.byPeriods }}
          </option>
          <option value="clock">
            {{ t.item.sessions.byClock }}
          </option>
        </select>
      </p>
      <div
        v-if="s.mode === 'periods'"
        class="row"
      >
        <p class="field">
          <label :for="`s-${index}-day`">{{ t.common.field.day }}</label>
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
          <label :for="`s-${index}-from`">{{ t.item.sessions.fromPeriod }}</label>
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
              {{ t.format.period(p.period) }} ({{ p.starts }})
            </option>
          </select>
        </p>
        <p class="field">
          <label :for="`s-${index}-count`">{{ t.item.sessions.count }}</label>
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
          <label :for="`s-${index}-location`">{{ t.item.sessions.location }}</label>
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
          <label :for="`s-${index}-date`">{{ t.item.sessions.startsOn }}</label>
          <input
            :id="`s-${index}-date`"
            v-model="s.date"
            type="date"
            required
            @change="s.endDate = s.endDate < s.date ? s.date : s.endDate"
          >
        </p>
        <p class="field">
          <label :for="`s-${index}-start`">{{ t.item.sessions.at }}</label>
          <input
            :id="`s-${index}-start`"
            v-model="s.start"
            type="time"
            required
          >
        </p>
        <p class="field">
          <label :for="`s-${index}-end-date`">{{ t.item.sessions.endsOn }}</label>
          <input
            :id="`s-${index}-end-date`"
            v-model="s.endDate"
            type="date"
            required
          >
        </p>
        <p class="field">
          <label :for="`s-${index}-end`">{{ t.item.sessions.at }}</label>
          <input
            :id="`s-${index}-end`"
            v-model="s.end"
            type="time"
            required
          >
        </p>
        <p class="field">
          <label :for="`s-${index}-location`">{{ t.item.sessions.location }}</label>
          <input
            :id="`s-${index}-location`"
            v-model="s.location"
            maxlength="200"
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
          {{ t.item.sessions.remove }}
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
        {{ t.item.sessions.add }}
      </button>
    </p>
    <p
      v-for="hint in conflictHints"
      :key="hint"
      class="alert"
      role="status"
    >
      {{ hint }}
    </p>
    <p
      v-for="hint in gateHints"
      :key="hint.text"
      :class="hint.alert ? 'alert' : 'notice'"
    >
      {{ hint.text }}
    </p>
    <Collapsible
      v-if="demand.length > 0"
      id="aktivitaet:demand"
      :heading="t.campaign.demand.heading"
    >
      <p class="muted">
        {{ t.campaign.demand.intro(campaign.placeHeadroomPercent) }}
      </p>
      <DemandTable
        :demand="check?.before ?? demand"
        :percent="campaign.placeHeadroomPercent"
        :highlight="check?.served ?? []"
      />
    </Collapsible>

    <h2>{{ t.item.participation.heading }}</h2>
    <fieldset class="field">
      <legend>{{ t.item.participation.fixedClasses }}</legend>
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
      <label for="places">{{ isFixed ? t.item.participation.extraPlaces : t.common.field.places }}</label>
      <input
        id="places"
        v-model.number="places"
        type="number"
        min="0"
        max="1000"
        required
        @input="placesTouched = true"
      >
    </p>
    <p
      v-if="staffOnly"
      class="notice"
    >
      {{ t.item.participation.staffOnly }}
    </p>
    <template v-if="!isFixed && !staffOnly">
      <p class="field">
        <label for="min">{{ t.item.participation.minParticipants }}</label>
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
          {{ t.item.participation.cancellable }}
        </label>
      </p>
    </template>
    <fieldset class="field">
      <legend>{{ t.item.participation.eligibleGrades }}</legend>
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
      <legend>{{ t.item.participation.eligibleClasses }}</legend>
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

    <h2>{{ t.item.categories.heading }}</h2>
    <p
      v-if="categories.length === 0"
      class="muted"
    >
      {{ t.item.categories.none }}
    </p>
    <fieldset
      v-else
      class="field"
    >
      <legend>{{ t.item.categories.intro }}</legend>
      <div class="checks">
        <label
          v-for="c in categories"
          :key="c.id"
        >
          <input
            type="checkbox"
            :checked="categoryIds.includes(c.id)"
            @change="categoryIds = toggle(categoryIds, c.id)"
          >
          {{ c.name }}
        </label>
      </div>
    </fieldset>

    <h2>{{ t.common.field.fee }}</h2>
    <p class="field">
      <label for="fee">{{ t.item.fee.amount }}</label>
      <input
        id="fee"
        v-model="feeEuro"
        inputmode="decimal"
        pattern="[0-9]{1,4}([,.][0-9]{1,2})?"
        size="8"
      >
    </p>
    <p class="field">
      <label for="fee-note">{{ t.item.fee.note }}</label>
      <input
        id="fee-note"
        v-model="feeNote"
        maxlength="500"
      >
    </p>

    <ul
      v-if="problems.length > 0 || refusals.length > 0"
      class="alert"
      role="alert"
    >
      <li
        v-for="problem in [...problems, ...refusals]"
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
    <p
      v-if="!(companionsOnly && !organizes)"
      class="actions"
    >
      <button
        type="submit"
        :disabled="saving.busy.value"
      >
        {{ t.common.save }}
      </button>
      <button
        v-if="!existing || existing.state === 'draft'"
        type="button"
        :disabled="saving.busy.value"
        @click="save(true)"
      >
        {{ t.item.saveAndPropose }}
      </button>
    </p>
  </form>
  <section v-if="participantsView">
    <h2>{{ t.item.participants.heading(participantsView.participants.length) }}</h2>
    <p v-if="savedLead">
      {{ t.item.participants.lead(savedLead) }}<template v-if="savedCompanions.length > 0">
        · {{ t.item.participants.companions(savedCompanions.join(', ')) }}
      </template>
    </p>
    <p
      v-if="participantsView.item.cancelled"
      class="alert"
      role="status"
    >
      {{ t.item.participants.cancelled }}
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
      {{ t.item.participants.none }}
    </p>
  </section>
</template>
