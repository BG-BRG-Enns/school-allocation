<script setup lang="ts">
// One campaign: its state and days, the activities as far as the person
// may see them, and what they may do: teachers propose and tend their own,
// organizers review, move the campaign on and export the catalogue.

import { computed, onMounted, ref, watch } from 'vue'
import { approveItem, catalogueExportPath, deleteItem, loadCampaign, loadClasses, loadDemand, loadItems, loadMissing as loadMissingList, missingExportPath, proposeItem, returnItem, transitionCampaign, unproposeItem, updateCampaign, withdrawItem, type CampaignChanges, type CampaignView, type DayDemand, type Item, type MissingStudent } from '../lib/campaigns-api.ts'
import { withBase } from '../lib/base.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, formatFee, formatSpan, formatWhenShort, instantInSchoolZone, localDateOf, localTimeOf } from '../lib/format.ts'
import { CAMPAIGN_STATE_LABELS, CHOICE_STATE_LABELS, ITEM_STATE_LABELS, MAIL_KIND_LABELS, MAIL_STATE_LABELS, WINDOW_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

const props = defineProps<{ id: string }>()
const view = ref<CampaignView | null>(null)
const items = ref<Item[]>([])
const demand = ref<DayDemand[]>([])
const grades = ref<number[]>([])
const loading = useFeedback()
const action = useFeedback()
usePageTitle(() => view.value?.campaign.name ?? 'Wahl')

async function load(): Promise<void> {
  await loading.run(async () => {
    const [v, list] = await Promise.all([loadCampaign(props.id), loadItems(props.id)])
    view.value = v
    items.value = list.items
    if (v.may.seeDemand) {
      const [d, c] = await Promise.all([loadDemand(props.id), loadClasses(props.id)])
      demand.value = d.demand
      grades.value = [...new Set(c.classes.map((cl) => cl.grade))].sort((a, b) => a - b)
    }
  })
}
onMounted(load)
watch(() => props.id, load)

const campaign = computed(() => view.value?.campaign)
const organizes = computed(() => view.value?.may.organize ?? false)
const published = computed(() => campaign.value !== undefined && !['draft', 'catalogue'].includes(campaign.value.state))
/** From the opening on: the window has a state worth showing. */
const windowOpened = computed(() => campaign.value !== undefined && !['draft', 'catalogue', 'published'].includes(campaign.value.state))
const isStudent = computed(() => session.value?.person?.kind === 'student')
/** From publication on: a student has a result to see. */
const resultsOut = computed(() => campaign.value !== undefined && (campaign.value.state === 'results' || campaign.value.state === 'archived'))
const missing = ref<MissingStudent[]>([])
const missingLoading = useFeedback()
async function loadMissing(): Promise<void> {
  if (!organizes.value || !windowOpened.value) return
  await missingLoading.run(async () => {
    missing.value = (await loadMissingList(props.id)).students
  })
}
watch(view, loadMissing)
const missingCount = computed(() => missing.value.filter((s) => s.state !== 'complete').length)

/** What was sent to a student, as "kind: state" pairs; a dash for nothing. */
function mailSummary(s: MissingStudent): string {
  return s.mails.map((m) => `${MAIL_KIND_LABELS[m.kind] ?? m.kind}: ${MAIL_STATE_LABELS[m.state] ?? m.state}`).join('; ') || '–'
}
/** The set-up (name, year, days) changes while the campaign is set up or takes proposals; the window's settings until it opens. */
const setUpEditable = computed(() => campaign.value !== undefined && ['draft', 'catalogue'].includes(campaign.value.state))
const windowEditable = computed(() => campaign.value !== undefined && ['draft', 'catalogue', 'published'].includes(campaign.value.state))
/** The daily minimum is the allocation's input and may change until a run is published. */
const minimumEditable = computed(() => windowEditable.value || (campaign.value !== undefined && ['closed', 'review'].includes(campaign.value.state)))
/** The swap window's dates may be set until the window has begun: the organizer sets them when publishing. */
const swapEditable = computed(() => minimumEditable.value || (campaign.value !== undefined && campaign.value.state === 'results' && (campaign.value.swapFrom === null || Date.parse(campaign.value.swapFrom) > Date.now())))
const settingsEditable = computed(() => minimumEditable.value || swapEditable.value)
const settingsButton = computed(() => windowEditable.value ? 'Einstellungen ändern' : minimumEditable.value ? 'Mindestminuten und Ummeldefenster ändern' : 'Ummeldefenster ändern')
/** The grades the demand lists: those of the roster, or those the demand knows. */
const demandGrades = computed(() => grades.value.length > 0 ? grades.value : [...new Set(demand.value.flatMap((d) => d.grades.map((g) => g.grade)))].sort((a, b) => a - b))

/** The window in one line, once a date is set: "Wahl von … bis …, Nachfrist bis …, Ummelden von … bis … · 3 Wünsche je Zeitgruppe". */
const windowSummary = computed(() => {
  const c = campaign.value
  if (!c || (c.opensAt === null && c.closesAt === null)) return ''
  const parts = [`Wahl von ${formatWhenShort(c.opensAt)} bis ${formatWhenShort(c.closesAt)}`]
  if (c.lateUntil !== null) parts.push(`Nachfrist bis ${formatWhenShort(c.lateUntil)}`)
  if (c.swapFrom !== null) parts.push(`Ummelden von ${formatWhenShort(c.swapFrom)} bis ${formatWhenShort(c.swapUntil)}`)
  return `${parts.join(', ')} · ${c.wishesPerGroup} Wünsche je Zeitgruppe`
})

function demandOf(day: DayDemand, grade: number): DayDemand['grades'][number] | undefined {
  return day.grades.find((g) => g.grade === grade)
}

/** An instant as the datetime-local input takes it, in the school's zone; '' for none. */
function localInput(iso: string | null): string {
  return iso === null ? '' : `${localDateOf(iso)}T${localTimeOf(iso)}`
}

/** A datetime-local value as an instant; null for none. */
function instantOrNull(value: string): string | null {
  const [date, time] = value.split('T')
  return date && time ? instantInSchoolZone(date, time) : null
}

/** Whether the item is the signed-in person's: proposed by them or taught by them. */
function own(item: Item): boolean {
  const me = session.value
  return me !== null && me !== undefined && (item.proposedBy.id === me.id || item.teachers.some((t) => t.personId === me.person?.id))
}

// Organizer's settings.
const editing = ref(false)
const name = ref('')
const schoolYear = ref('')
const days = ref<string[]>([])
const opensAt = ref('')
const closesAt = ref('')
const lateUntil = ref('')
const swapFrom = ref('')
const swapUntil = ref('')
const wishesPerGroup = ref(3)
// Strings as typed, numbers once Vue casts a number input: both are read as text below.
const dailyMinimum = ref<Record<string, string | number>>({})
const showTeachers = ref(true)
function startEditing(): void {
  const c = campaign.value
  if (!c) return
  name.value = c.name
  schoolYear.value = c.schoolYear
  days.value = [...c.projectDays]
  opensAt.value = localInput(c.opensAt)
  closesAt.value = localInput(c.closesAt)
  lateUntil.value = localInput(c.lateUntil)
  swapFrom.value = localInput(c.swapFrom)
  swapUntil.value = localInput(c.swapUntil)
  wishesPerGroup.value = c.wishesPerGroup
  // Every grade with a minimum stays, whether or not the roster still has it, plus the roster's grades.
  const minimumGrades = [...new Set([...Object.keys(c.dailyMinimum).map(Number), ...demandGrades.value])].sort((a, b) => a - b)
  dailyMinimum.value = Object.fromEntries(minimumGrades.map((grade) => [String(grade), c.dailyMinimum[String(grade)] === undefined ? '' : String(c.dailyMinimum[String(grade)])]))
  showTeachers.value = c.showTeachers
  editing.value = true
}
async function onSaveSettings(): Promise<void> {
  const ok = await action.run(async () => {
    const changes: CampaignChanges = { name: name.value.trim(), schoolYear: schoolYear.value.trim(), projectDays: days.value.filter(Boolean) }
    if (windowEditable.value) {
      changes.opensAt = instantOrNull(opensAt.value)
      changes.closesAt = instantOrNull(closesAt.value)
      changes.lateUntil = instantOrNull(lateUntil.value)
      changes.wishesPerGroup = Number(wishesPerGroup.value)
      changes.showTeachers = showTeachers.value
    }
    if (swapEditable.value) {
      changes.swapFrom = instantOrNull(swapFrom.value)
      changes.swapUntil = instantOrNull(swapUntil.value)
    }
    if (minimumEditable.value) {
      changes.dailyMinimum = Object.fromEntries(Object.entries(dailyMinimum.value).filter(([, minutes]) => String(minutes).trim() !== '').map(([grade, minutes]) => [grade, Number(minutes)]))
    }
    await updateCampaign(props.id, changes)
  }, 'Gespeichert.')
  if (ok) {
    editing.value = false
    await load()
  }
}
async function onTransition(to: 'catalogue' | 'published' | 'open' | 'closed' | 'archived'): Promise<void> {
  // The archive is the end: nothing of the campaign changes afterwards, so it is asked once more.
  if (to === 'archived' && !window.confirm('Die Wahl abschließen? Danach ändert sich nichts mehr: kein Tausch, keine Zuteilung, keine Anwesenheit.')) return
  const ok = await action.run(async () => {
    await transitionCampaign(props.id, to)
  })
  if (ok) await load()
}

// Item actions, with a reason or note where one is required.
type Pending = { item: Item, kind: 'return' | 'withdraw' } | null
const pending = ref<Pending>(null)
const text = ref('')
function ask(item: Item, kind: 'return' | 'withdraw'): void {
  pending.value = { item, kind }
  text.value = ''
}
async function act(fn: () => Promise<unknown>, done?: string): Promise<void> {
  const ok = await action.run(async () => {
    await fn()
  }, done)
  if (ok) {
    pending.value = null
    await load()
  }
}
function onSubmitPending(): void {
  const p = pending.value
  if (!p) return
  void act(() => p.kind === 'return' ? returnItem(p.item.id, text.value.trim()) : withdrawItem(p.item.id, text.value.trim()))
}
</script>

<template>
  <p>
    <RouterLink to="/wahlen">
      ← Wahlen
    </RouterLink>
  </p>
  <p
    v-if="loading.error.value"
    role="alert"
    class="alert"
  >
    {{ loading.error.value }}
  </p>
  <template v-if="campaign && view">
    <h1>{{ campaign.name }}</h1>
    <p>
      <span class="badge">{{ CAMPAIGN_STATE_LABELS[campaign.state] ?? campaign.state }}</span>
      Schuljahr {{ campaign.schoolYear }} · Projekttage: {{ campaign.projectDays.map(formatDay).join(', ') }}
    </p>
    <p
      v-if="windowSummary"
      class="muted"
    >
      {{ windowSummary }}
    </p>
    <p
      v-if="view.may.classTeacherOf.length > 0"
      class="actions"
    >
      <RouterLink
        v-for="className in view.may.classTeacherOf"
        :key="className"
        class="button ghost-link"
        :to="`/wahlen/${campaign.id}/klasse/${encodeURIComponent(className)}`"
      >
        Meine Klasse {{ className }}
      </RouterLink>
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

    <section v-if="organizes">
      <h2>Organisation</h2>
      <p
        v-if="view.counts"
        class="muted"
      >
        {{ view.counts.draft }} Entwürfe · {{ view.counts.proposed }} eingereicht · {{ view.counts.approved }} genehmigt · {{ view.counts.withdrawn }} zurückgezogen
      </p>
      <p class="actions">
        <button
          v-if="campaign.state === 'draft'"
          type="button"
          :disabled="action.busy.value"
          @click="onTransition('catalogue')"
        >
          Aktivitäten sammeln
        </button>
        <button
          v-if="campaign.state === 'catalogue'"
          type="button"
          :disabled="action.busy.value"
          @click="onTransition('published')"
        >
          Katalog veröffentlichen
        </button>
        <button
          v-if="campaign.state === 'published'"
          type="button"
          :disabled="action.busy.value"
          @click="onTransition('open')"
        >
          Wahl öffnen
        </button>
        <button
          v-if="campaign.state === 'results'"
          type="button"
          class="ghost"
          :disabled="action.busy.value"
          @click="onTransition('archived')"
        >
          Wahl abschließen
        </button>
        <button
          v-if="campaign.state === 'open' || campaign.state === 'grace'"
          type="button"
          class="ghost"
          :disabled="action.busy.value"
          @click="onTransition('closed')"
        >
          Wahl beenden
        </button>
        <RouterLink
          v-if="['closed', 'allocating', 'review', 'results', 'archived'].includes(campaign.state)"
          class="button"
          :to="`/wahlen/${campaign.id}/zuteilung`"
        >
          Zuteilung
        </RouterLink>
        <button
          v-if="!editing && settingsEditable"
          type="button"
          class="ghost"
          @click="startEditing"
        >
          {{ settingsButton }}
        </button>
        <a
          class="button ghost-link"
          :href="withBase(catalogueExportPath(campaign.id))"
        >Katalog als Excel</a>
        <RouterLink
          class="button ghost-link"
          to="/verwaltung/klassen"
        >
          Klassenvorstände
        </RouterLink>
        <RouterLink
          class="button ghost-link"
          to="/verwaltung/mailvorlagen"
        >
          Mailvorlagen
        </RouterLink>
      </p>
      <form
        v-if="editing"
        class="panel"
        aria-label="Einstellungen der Wahl"
        @submit.prevent="onSaveSettings"
      >
        <p class="field">
          <label for="edit-name">Bezeichnung</label>
          <input
            id="edit-name"
            v-model="name"
            required
            maxlength="200"
            :disabled="!setUpEditable"
          >
        </p>
        <p class="field">
          <label for="edit-year">Schuljahr</label>
          <input
            id="edit-year"
            v-model="schoolYear"
            required
            pattern="[0-9]{4}/[0-9]{2}"
            size="8"
            :disabled="!setUpEditable"
          >
        </p>
        <fieldset
          class="field"
          :disabled="!setUpEditable"
        >
          <legend>Projekttage</legend>
          <p
            v-for="(_, index) in days"
            :key="index"
            class="actions"
          >
            <input
              v-model="days[index]"
              :aria-label="`Projekttag ${index + 1}`"
              type="date"
              required
            >
            <button
              v-if="days.length > 1"
              type="button"
              class="ghost"
              @click="days.splice(index, 1)"
            >
              Entfernen
            </button>
          </p>
          <p>
            <button
              type="button"
              class="ghost"
              :disabled="days.length >= 10"
              @click="days.push('')"
            >
              Tag hinzufügen
            </button>
          </p>
        </fieldset>
        <fieldset class="field">
          <legend>Wahl</legend>
          <div class="row">
            <p class="field">
              <label for="edit-opens">Beginn</label>
              <input
                id="edit-opens"
                v-model="opensAt"
                :disabled="!windowEditable"
                type="datetime-local"
              >
            </p>
            <p class="field">
              <label for="edit-closes">Ende</label>
              <input
                id="edit-closes"
                v-model="closesAt"
                :disabled="!windowEditable"
                type="datetime-local"
              >
            </p>
            <p class="field">
              <label for="edit-late">Nachfrist bis</label>
              <input
                id="edit-late"
                v-model="lateUntil"
                :disabled="!windowEditable"
                type="datetime-local"
              >
            </p>
          </div>
          <div class="row">
            <p class="field">
              <label for="edit-swap-from">Ummelden von</label>
              <input
                id="edit-swap-from"
                v-model="swapFrom"
                :disabled="!swapEditable"
                type="datetime-local"
              >
            </p>
            <p class="field">
              <label for="edit-swap-until">Ummelden bis</label>
              <input
                id="edit-swap-until"
                v-model="swapUntil"
                :disabled="!swapEditable"
                type="datetime-local"
              >
            </p>
            <p class="field">
              <label for="edit-wishes">Wünsche je Zeitgruppe</label>
              <input
                id="edit-wishes"
                v-model.number="wishesPerGroup"
                :disabled="!windowEditable"
                type="number"
                min="1"
                max="10"
                required
              >
            </p>
          </div>
          <div class="row">
            <p
              v-for="grade in Object.keys(dailyMinimum)"
              :key="grade"
              class="field"
            >
              <label :for="`edit-min-${grade}`">Mindestminuten je Tag, {{ grade }}. Schulstufe</label>
              <input
                :id="`edit-min-${grade}`"
                v-model="dailyMinimum[String(grade)]"
                type="number"
                min="0"
                max="1440"
                step="5"
              >
            </p>
          </div>
          <p class="field">
            <label>
              <input
                v-model="showTeachers"
                :disabled="!windowEditable"
                type="checkbox"
              >
              Der Katalog nennt die Lehrkräfte der Aktivitäten
            </label>
          </p>
        </fieldset>
        <p class="actions">
          <button
            type="submit"
            :disabled="action.busy.value"
          >
            Speichern
          </button>
          <button
            type="button"
            class="ghost"
            @click="editing = false"
          >
            Abbrechen
          </button>
        </p>
      </form>
    </section>

    <section v-if="isStudent && published">
      <h2>{{ resultsOut ? 'Mein Ergebnis' : 'Meine Wünsche' }}</h2>
      <p class="actions">
        <RouterLink
          v-if="resultsOut"
          class="button"
          :to="`/wahlen/${campaign.id}/ergebnis`"
        >
          Mein Ergebnis ansehen
        </RouterLink>
        <RouterLink
          :class="resultsOut ? 'button ghost-link' : 'button'"
          :to="`/wahlen/${campaign.id}/wuensche`"
        >
          {{ resultsOut ? 'Meine Wünsche' : windowOpened ? 'Wünsche abgeben oder ändern' : 'Was zur Wahl steht' }}
        </RouterLink>
      </p>
    </section>

    <section v-if="organizes && windowOpened">
      <h2>Wahlstand</h2>
      <p
        v-if="missingLoading.error.value"
        role="alert"
        class="alert"
      >
        {{ missingLoading.error.value }}
      </p>
      <p class="muted">
        {{ missing.length }} Schüler/innen, {{ missingCount }} ohne vollständige Wünsche.
      </p>
      <p class="actions">
        <a
          class="button ghost-link"
          :href="withBase(missingExportPath(campaign.id))"
        >Wahlstand als Excel</a>
      </p>
      <table
        v-if="missing.length > 0"
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              Klasse
            </th>
            <th scope="col">
              Name
            </th>
            <th scope="col">
              Stand
            </th>
            <th scope="col">
              Nachrichten
            </th>
            <th scope="col">
              <span class="visually-hidden">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in missing"
            :key="s.personId"
          >
            <td>{{ s.className }}</td>
            <td>{{ s.displayName }}</td>
            <td>
              <span :class="['badge', s.state === 'complete' ? 'badge-approved' : 'badge-proposed']">{{ CHOICE_STATE_LABELS[s.state] ?? s.state }}</span>
              <span
                v-if="s.window"
                class="muted"
              > ({{ WINDOW_LABELS[s.window] ?? s.window }})</span>
            </td>
            <td>{{ mailSummary(s) }}</td>
            <td class="row-actions">
              <RouterLink
                class="button ghost-link small"
                :to="`/wahlen/${campaign.id}/wuensche/${s.personId}`"
              >
                Eingeben
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="view.may.seeDemand && demand.length > 0">
      <h2>Bedarf</h2>
      <p class="muted">
        Je Projekttag und Schulstufe: wie viele Schüler/innen einen Platz brauchen (ohne die in einer Klassenaktivität), und wie viele Plätze die eingereichten und genehmigten Aktivitäten ihnen anbieten.
      </p>
      <table class="table">
        <thead>
          <tr>
            <th scope="col">
              Tag
            </th>
            <th
              v-for="grade in demandGrades"
              :key="grade"
              scope="col"
            >
              {{ grade }}. Schulstufe
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="day in demand"
            :key="day.date"
          >
            <th scope="row">
              {{ formatDay(day.date) }}
            </th>
            <td
              v-for="grade in demandGrades"
              :key="grade"
            >
              <template v-if="demandOf(day, grade)">
                {{ demandOf(day, grade)?.needing }} brauchen · {{ demandOf(day, grade)?.offered }} angeboten
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>Aktivitäten</h2>
      <p class="actions">
        <RouterLink
          v-if="view.may.propose"
          class="button"
          :to="`/wahlen/${campaign.id}/aktivitaet/neu`"
        >
          Neue Aktivität
        </RouterLink>
        <RouterLink
          v-if="published || organizes"
          class="button ghost-link"
          :to="`/wahlen/${campaign.id}/katalog`"
        >
          Katalog ansehen
        </RouterLink>
      </p>
      <p v-if="items.length === 0">
        Noch keine Aktivitäten.
      </p>
      <table
        v-else
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              Nr.
            </th>
            <th scope="col">
              Aktivität
            </th>
            <th scope="col">
              Lehrkräfte
            </th>
            <th scope="col">
              Termine
            </th>
            <th scope="col">
              Plätze
            </th>
            <th scope="col">
              Stand
            </th>
            <th scope="col">
              <span class="visually-hidden">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
          >
            <td>{{ item.number ?? '–' }}</td>
            <td>
              <strong>{{ item.title }}</strong>
              <span
                v-if="item.fixedClasses.length > 0"
                class="muted"
              > · fix für {{ item.fixedClasses.join(', ') }}</span>
              <span
                v-if="item.feeCents > 0"
                class="muted"
              > · {{ formatFee(item.feeCents) }}</span>
              <p
                v-if="item.reviewNote && (own(item) || organizes)"
                class="muted"
              >
                Rückmeldung: {{ item.reviewNote }}
              </p>
            </td>
            <td>{{ item.teachers.map((t) => t.displayName).join(', ') }}</td>
            <td>
              <ul class="plain">
                <li
                  v-for="s in item.sessions"
                  :key="s.id"
                >
                  {{ formatSpan(s.startsAt, s.endsAt) }}
                </li>
              </ul>
            </td>
            <td>{{ item.places }}</td>
            <td><span :class="['badge', `badge-${item.state}`]">{{ ITEM_STATE_LABELS[item.state] ?? item.state }}</span></td>
            <td class="row-actions">
              <RouterLink
                v-if="(own(item) && item.state === 'draft' && campaign.state === 'catalogue') || (organizes && item.state !== 'withdrawn')"
                class="button ghost-link small"
                :to="`/wahlen/${campaign.id}/aktivitaet/${item.id}`"
              >
                Bearbeiten
              </RouterLink>
              <RouterLink
                v-if="own(item) && !organizes && resultsOut && item.state !== 'withdrawn'"
                class="button ghost-link small"
                :to="`/wahlen/${campaign.id}/aktivitaet/${item.id}`"
              >
                Teilnehmer/innen
              </RouterLink>
              <button
                v-if="own(item) && item.state === 'draft' && campaign.state === 'catalogue'"
                type="button"
                class="ghost"
                @click="act(() => proposeItem(item.id), 'Eingereicht.')"
              >
                Einreichen
              </button>
              <button
                v-if="own(item) && item.state === 'proposed' && campaign.state === 'catalogue' && !organizes"
                type="button"
                class="ghost"
                @click="act(() => unproposeItem(item.id))"
              >
                Zurück zum Entwurf
              </button>
              <button
                v-if="own(item) && item.state === 'draft'"
                type="button"
                class="ghost"
                @click="act(() => deleteItem(item.id), 'Entwurf gelöscht.')"
              >
                Löschen
              </button>
              <button
                v-if="organizes && item.state === 'proposed'"
                type="button"
                @click="act(() => approveItem(item.id), 'Genehmigt.')"
              >
                Genehmigen
              </button>
              <button
                v-if="organizes && campaign.state === 'catalogue' && (item.state === 'proposed' || item.state === 'approved')"
                type="button"
                class="ghost"
                @click="ask(item, 'return')"
              >
                Zurückgeben
              </button>
              <button
                v-if="organizes && item.state !== 'withdrawn' && !(own(item) && item.state === 'draft')"
                type="button"
                class="ghost"
                @click="ask(item, 'withdraw')"
              >
                Zurückziehen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <form
        v-if="pending"
        class="panel"
        :aria-label="pending.kind === 'return' ? `${pending.item.title} zurückgeben` : `${pending.item.title} zurückziehen`"
        @submit.prevent="onSubmitPending"
      >
        <h3>{{ pending.kind === 'return' ? `${pending.item.title} zurückgeben` : `${pending.item.title} zurückziehen` }}</h3>
        <p class="field">
          <label for="pending-text">{{ pending.kind === 'return' ? 'Rückmeldung an die Lehrkräfte' : 'Begründung' }}</label>
          <input
            id="pending-text"
            v-model="text"
            required
            maxlength="500"
          >
        </p>
        <p class="actions">
          <button
            type="submit"
            :disabled="action.busy.value"
          >
            {{ pending.kind === 'return' ? 'Zurückgeben' : 'Zurückziehen' }}
          </button>
          <button
            type="button"
            class="ghost"
            @click="pending = null"
          >
            Abbrechen
          </button>
        </p>
      </form>
    </section>
  </template>
</template>
