<script setup lang="ts">
// The allocation of a campaign as the organizer works it: the solver's
// state, a run started with a seed and a limit, the runs so far, and the
// review of one (its levels, who got what, the missing minutes, the
// fallbacks, the cancelled items, the counts per item and class), compared
// with another run if wanted. A run executes in the background; the page
// asks again until it is through. Once a run is published, the page shows
// what changed since (swaps, placements, the organizer's own changes, each
// with its reason) and takes the organizer's change by hand.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { assignmentsExportPath, changeAssignment, loadChanges, loadRun, loadRuns, loadSolverStatus, publishRun, runExportPath, startRun, type AllocationRun, type AssignmentChange, type ReviewStudent, type RunReviewResponse, type SolverStatusResponse } from '../lib/allocation-api.ts'
import { withBase } from '../lib/base.ts'
import { loadCampaign, loadItems, type Campaign, type Item } from '../lib/campaigns-api.ts'
import { formatWhen, useFeedback } from '../lib/feedback.ts'
import { formatDay } from '../lib/format.ts'
import { ALLOCATION_PROBLEM_LABELS, ASSIGNMENT_SOURCE_LABELS, CAMPAIGN_STATE_LABELS, CHANGE_KIND_LABELS, levelLabel, RUN_FAILURE_LABELS, RUN_STATUS_LABELS, SOLVE_STATUS_LABELS, WINDOW_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string }>()
usePageTitle(() => 'Zuteilung')

const campaign = ref<Campaign | null>(null)
const runs = ref<AllocationRun[]>([])
const solverConfigured = ref(false)
const solver = ref<SolverStatusResponse | null>(null)
const selected = ref<RunReviewResponse | null>(null)
const other = ref<RunReviewResponse | null>(null)
const compareId = ref('')
const loading = useFeedback()
const action = useFeedback()
/** A number input hands v-model a number, or '' when empty. */
const seed = ref<number | ''>('')
const limit = ref(5)

const canStart = computed(() => campaign.value !== null && ['closed', 'review'].includes(campaign.value.state) && solverConfigured.value && !runs.value.some((r) => r.status === 'running'))
/** The publication: a succeeded run of a campaign in review, not stale, its cancellations confirmed. */
const publishing = ref(false)
const cancellationsConfirmed = ref(false)
const canPublish = computed(() => campaign.value?.state === 'review' && selected.value?.run.status === 'succeeded' && !selected.value.stale)
const publishedRun = computed(() => runs.value.find((r) => r.publishedAt !== null) ?? null)

async function onPublish(): Promise<void> {
  if (!selected.value) return
  const run = selected.value.run
  await action.run(async () => {
    await publishRun(props.id, run.id, run.cancelledItemIds)
    publishing.value = false
    cancellationsConfirmed.value = false
    await load()
  }, 'Das Ergebnis ist veröffentlicht; die Benachrichtigungen sind unterwegs.')
}
const running = computed(() => runs.value.some((r) => r.status === 'running'))

/** After publication: the published run's review (for names), the changes since, and the organizer's form. */
const published = ref<RunReviewResponse | null>(null)
/** The catalogue as it stands, for the organizer's picker: an item withdrawn since publication is no target. */
const catalogue = ref<Item[]>([])
const changes = ref<AssignmentChange[]>([])
const changePerson = ref('')
const changeTo = ref('')
const changeFrom = ref('')
const changeReason = ref('')
const changeForce = ref(false)
const publishedStudents = computed(() => published.value?.students ?? [])
const changeStudent = computed(() => publishedStudents.value.find((s) => s.personId === changePerson.value))
const changeItems = computed(() => {
  const approved = new Set(catalogue.value.filter((i) => i.state === 'approved').map((i) => i.id))
  return (published.value?.items ?? []).filter((i) => !i.cancelled && approved.has(i.itemId))
})
const canChange = computed(() => campaign.value?.state === 'results' && changePerson.value !== '' && (changeTo.value !== '' || changeFrom.value !== '') && changeReason.value.trim() !== '')
const publishedLabel = (itemId: string): string => published.value === null ? itemId : itemTitle(published.value, itemId)

async function onChange(): Promise<void> {
  if (!canChange.value) return
  await action.run(async () => {
    await changeAssignment(props.id, { personId: changePerson.value, ...(changeTo.value === '' ? {} : { itemId: changeTo.value }), ...(changeFrom.value === '' ? {} : { removeItemId: changeFrom.value }), reason: changeReason.value.trim(), force: changeForce.value })
    changeTo.value = ''
    changeFrom.value = ''
    changeReason.value = ''
    changeForce.value = false
    await load()
  }, 'Die Zuteilung ist geändert; die Schülerin oder der Schüler wird benachrichtigt.')
}
watch(changePerson, () => {
  changeFrom.value = ''
})

async function load(): Promise<void> {
  await loading.run(async () => {
    const [view, list, status] = await Promise.all([loadCampaign(props.id), loadRuns(props.id), loadSolverStatus()])
    campaign.value = view.campaign
    runs.value = list.runs
    solverConfigured.value = list.solverConfigured
    solver.value = status
    const current = selected.value?.run.id ?? list.runs[0]?.id
    if (current !== undefined) selected.value = await loadRun(props.id, current)
    if (compareId.value !== '') other.value = await loadRun(props.id, compareId.value)
    const done = list.runs.find((r) => r.publishedAt !== null)
    if (done !== undefined) {
      published.value = await loadRun(props.id, done.id)
      changes.value = (await loadChanges(props.id)).changes
      catalogue.value = (await loadItems(props.id)).items
    } else {
      published.value = null
      changes.value = []
      catalogue.value = []
    }
  })
}

let timer: ReturnType<typeof setTimeout> | undefined
/** Asks again while a run executes, or while the campaign still says allocating (the two reads of load() are not one moment). */
function schedule(): void {
  clearTimeout(timer)
  if (running.value || campaign.value?.state === 'allocating') timer = setTimeout(() => void load().then(schedule), 2000)
}
onMounted(() => void load().then(schedule))
onBeforeUnmount(() => clearTimeout(timer))
// Another campaign in the same page: nothing of the previous one's runs carries over.
watch(() => props.id, () => {
  selected.value = null
  other.value = null
  compareId.value = ''
  void load().then(schedule)
})

async function onStart(seedValue?: number, limitValue?: number): Promise<void> {
  const body: { seed?: number, deterministicTimePerLevel?: number } = {}
  const s = seedValue ?? (seed.value === '' ? undefined : seed.value)
  if (s !== undefined && Number.isInteger(s) && s >= 0) body.seed = s
  body.deterministicTimePerLevel = limitValue ?? limit.value
  await action.run(async () => {
    const { run } = await startRun(props.id, body)
    seed.value = ''
    await load()
    selected.value = await loadRun(props.id, run.id)
    schedule()
  }, 'Die Zuteilung wird berechnet.')
}

async function select(run: AllocationRun): Promise<void> {
  await action.run(async () => {
    selected.value = await loadRun(props.id, run.id)
  })
}

// Another run on show: whatever was confirmed was confirmed for the one before.
watch(() => selected.value?.run.id, () => {
  publishing.value = false
  cancellationsConfirmed.value = false
})

async function onCompare(): Promise<void> {
  if (compareId.value === '') {
    other.value = null
    return
  }
  await action.run(async () => {
    other.value = await loadRun(props.id, compareId.value)
  })
}

const itemTitle = (review: RunReviewResponse, itemId: string): string => {
  const item = review.items.find((i) => i.itemId === itemId)
  return item === undefined ? '?' : item.number === null ? item.title : `${item.number}. ${item.title}`
}
const studentName = (review: RunReviewResponse, personId: string): string => review.students.find((s) => s.personId === personId)?.displayName ?? '?'
const placeLabel = (review: RunReviewResponse, student: ReviewStudent, date: string): string => student.items
  .filter((e) => (e.minutesByDate[date] ?? 0) > 0)
  .map((e) => `${itemTitle(review, e.itemId)}${e.source === 'wish' ? ` (${e.rank}. Wunsch)` : e.source === 'fallback' ? ' (Ersatz)' : e.source === 'fixed' ? ' (Klasse)' : ''}`)
  .join(', ')
const levelsOf = (review: RunReviewResponse) => review.run.passes.at(-1)?.levels ?? []
const passSummary = (review: RunReviewResponse): string => review.run.passes.map((p) => `${p.pass}. ${SOLVE_STATUS_LABELS[p.status] ?? p.status}`).join(' · ')
const rankKeys = computed(() => {
  const ranks = selected.value?.summary?.ranks ?? {}
  return Object.keys(ranks).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b))
})

/** Students whose items differ between the selected run and the other. */
const differences = computed(() => {
  if (!selected.value || !other.value) return []
  const key = (s: ReviewStudent) => s.items.map((e) => e.itemId).sort().join(',')
  const theirs = new Map(other.value.students.map((s) => [s.personId, s]))
  return selected.value.students.filter((s) => {
    const t = theirs.get(s.personId)
    return t === undefined || key(t) !== key(s)
  })
})
const levelDelta = (name: string): number | null => {
  if (!selected.value || !other.value) return null
  const mine = levelsOf(selected.value).find((l) => l.name === name)?.value
  const theirs = levelsOf(other.value).find((l) => l.name === name)?.value
  return mine === undefined || theirs === undefined ? null : mine - theirs
}
</script>

<template>
  <p>
    <RouterLink :to="`/wahlen/${props.id}`">
      ← Zur Wahl
    </RouterLink>
  </p>
  <h1>Zuteilung</h1>
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
  <template v-if="campaign">
    <p class="muted">
      {{ campaign.name }} · <span class="badge">{{ CAMPAIGN_STATE_LABELS[campaign.state] ?? campaign.state }}</span>
    </p>
    <section v-if="publishedRun">
      <h2>Veröffentlicht</h2>
      <p>
        Lauf {{ publishedRun.seq }} ist das Ergebnis dieser Wahl (veröffentlicht {{ formatWhen(publishedRun.publishedAt) }}). Die Schüler/innen sehen ihr Programm, die Lehrkräfte ihre Teilnehmer/innen, die Klassenvorstände die Plätze ihrer Klasse.
      </p>
      <p class="actions">
        <a
          class="button ghost-link"
          :href="withBase(assignmentsExportPath(props.id))"
        >Zuteilung als Excel</a>
      </p>
      <h3>Änderungen seit der Veröffentlichung ({{ changes.length }})</h3>
      <p
        v-if="changes.length === 0"
        class="muted"
      >
        Noch keine: kein Tausch, keine Zuteilung durch einen Klassenvorstand, keine Änderung von Hand.
      </p>
      <table v-else>
        <thead>
          <tr>
            <th>Nr.</th>
            <th>Wann</th>
            <th>Art</th>
            <th>Schüler/in</th>
            <th>Nicht mehr</th>
            <th>Neu</th>
            <th>Begründung</th>
            <th>Durch</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in changes"
            :key="c.id"
          >
            <td>{{ c.seq }}</td>
            <td>{{ formatWhen(c.changedAt) }}</td>
            <td>
              {{ CHANGE_KIND_LABELS[c.kind] ?? c.kind }}<template v-if="c.forced">
                · erzwungen
              </template>
            </td>
            <td>{{ c.displayName }} ({{ c.className }})</td>
            <td>{{ c.leftItemIds.map(publishedLabel).join(', ') }}</td>
            <td>{{ c.toItemId === null ? '' : publishedLabel(c.toItemId) }}</td>
            <td>{{ c.reason ?? '' }}</td>
            <td>{{ c.changedBy.displayName }}</td>
          </tr>
        </tbody>
      </table>
      <form
        v-if="campaign.state === 'results' && published"
        aria-label="Zuteilung von Hand ändern"
        @submit.prevent="onChange"
      >
        <h3>Zuteilung von Hand ändern</h3>
        <p class="muted">
          Dieselben Regeln wie beim Tausch: in eine Aktivität mit freien Plätzen, die zur Schulstufe passt und sich mit nichts überschneidet, das bleibt; eine Klassenaktivität bleibt immer. Eine volle Aktivität oder ein Minimum darf die Organisation übergehen, mit Häkchen; das wird festgehalten.
        </p>
        <div class="row">
          <p class="field">
            <label for="change-person">Schüler/in</label>
            <select
              id="change-person"
              v-model="changePerson"
              required
            >
              <option value="">
                Bitte wählen
              </option>
              <option
                v-for="st in publishedStudents"
                :key="st.personId"
                :value="st.personId"
              >
                {{ st.displayName }} ({{ st.className }})
              </option>
            </select>
          </p>
          <p class="field">
            <label for="change-from">Herausnehmen aus</label>
            <select
              id="change-from"
              v-model="changeFrom"
              :disabled="!changeStudent"
            >
              <option value="">
                –
              </option>
              <option
                v-for="e in changeStudent?.items ?? []"
                :key="e.itemId"
                :value="e.itemId"
              >
                {{ publishedLabel(e.itemId) }} ({{ ASSIGNMENT_SOURCE_LABELS[e.source] ?? e.source }})
              </option>
            </select>
          </p>
          <p class="field">
            <label for="change-to">Einteilen in</label>
            <select
              id="change-to"
              v-model="changeTo"
            >
              <option value="">
                –
              </option>
              <option
                v-for="i in changeItems"
                :key="i.itemId"
                :value="i.itemId"
              >
                {{ i.number === null ? i.title : `${i.number}. ${i.title}` }} ({{ Math.max(0, i.places - i.assigned) }} frei)
              </option>
            </select>
          </p>
        </div>
        <p class="field">
          <label for="change-reason">Begründung</label>
          <input
            id="change-reason"
            v-model="changeReason"
            type="text"
            maxlength="500"
            required
          >
        </p>
        <p class="field">
          <label>
            <input
              v-model="changeForce"
              type="checkbox"
            >
            Volle Aktivität oder Minimum übergehen (wird festgehalten)
          </label>
        </p>
        <p class="actions">
          <button
            type="submit"
            :disabled="!canChange || action.busy.value"
          >
            Ändern
          </button>
        </p>
      </form>
    </section>

    <section>
      <h2>Lauf starten</h2>
      <p
        v-if="!solverConfigured"
        class="muted"
      >
        Auf diesem Server ist kein Solver eingerichtet (<code>SOLVER_URL</code>); eine Zuteilung kann nicht berechnet werden.
      </p>
      <p
        v-else-if="solver && !solver.reachable"
        class="alert"
        role="alert"
      >
        Der Solver antwortet nicht. Ein Lauf würde fehlschlagen.
      </p>
      <p
        v-else-if="solver"
        class="muted"
      >
        Solver bereit (OR-Tools {{ solver.ortools }}, Vertrag {{ solver.contract }}).
      </p>
      <p
        v-if="campaign.state !== 'closed' && campaign.state !== 'review' && campaign.state !== 'allocating'"
        class="muted"
      >
        Eine Zuteilung wird berechnet, sobald die Wahl beendet ist.
      </p>
      <form
        v-else
        class="panel"
        aria-label="Lauf starten"
        @submit.prevent="onStart()"
      >
        <div class="field">
          <label for="seed">Seed (leer: wird gezogen)</label>
          <input
            id="seed"
            v-model="seed"
            type="number"
            min="0"
            step="1"
            placeholder="z. B. 4711"
          >
        </div>
        <div class="field">
          <label for="limit">Zeitlimit pro Stufe (deterministische Sekunden, 1–60)</label>
          <input
            id="limit"
            v-model.number="limit"
            type="number"
            min="1"
            max="60"
            step="1"
          >
          <p class="muted">
            Eine deterministische Sekunde dauert auf dem Server mehrere Sekunden; derselbe Seed mit demselben Limit ergibt dieselbe Zuteilung.
          </p>
        </div>
        <p class="actions">
          <button
            type="submit"
            :disabled="!canStart || action.busy.value"
          >
            Zuteilung berechnen
          </button>
          <span
            v-if="running"
            class="muted"
          >Ein Lauf wird gerade berechnet …</span>
        </p>
      </form>
    </section>

    <section>
      <h2>Läufe ({{ runs.length }})</h2>
      <p
        v-if="runs.length === 0"
        class="muted"
      >
        Noch kein Lauf.
      </p>
      <table
        v-else
        class="table"
      >
        <thead>
          <tr>
            <th>Lauf</th>
            <th>Gestartet</th>
            <th>Status</th>
            <th>Seed</th>
            <th>Limit</th>
            <th>Fehlende Minuten</th>
            <th>Ohne alle Tage</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="run in runs"
            :key="run.id"
            :class="{ selected: selected?.run.id === run.id }"
          >
            <td>{{ run.seq }}</td>
            <td>{{ formatWhen(run.startedAt) }}<br><span class="muted">{{ run.startedBy.displayName }}</span></td>
            <td>
              <span :class="['badge', run.status === 'succeeded' ? 'badge-approved' : run.status === 'running' ? 'badge-pending' : 'badge-rejected']">{{ RUN_STATUS_LABELS[run.status] ?? run.status }}</span>
              <span
                v-if="run.publishedAt"
                class="badge badge-committed"
              >veröffentlicht</span>
            </td>
            <td>{{ run.seed }}</td>
            <td>{{ run.limits.deterministicTimePerLevel }}</td>
            <td>{{ run.passes.at(-1)?.levels.find((l) => l.name === 'deficit_minutes')?.value ?? '–' }}</td>
            <td>{{ run.passes.at(-1)?.levels.find((l) => l.name === 'students_with_deficit')?.value ?? '–' }}</td>
            <td class="row-actions">
              <button
                type="button"
                class="ghost"
                :disabled="action.busy.value"
                @click="select(run)"
              >
                Ansehen
              </button>
              <button
                type="button"
                class="ghost"
                :disabled="!canStart || action.busy.value"
                :title="`Noch einmal mit Seed ${run.seed} und Limit ${run.limits.deterministicTimePerLevel}: dieselbe Zuteilung, wenn sich nichts geändert hat`"
                @click="onStart(run.seed, run.limits.deterministicTimePerLevel)"
              >
                Wiederholen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="selected">
      <h2>Lauf {{ selected.run.seq }}</h2>
      <p
        v-if="selected.stale"
        class="alert"
        role="alert"
      >
        Seit diesem Lauf hat sich der Katalog, die Personenliste oder eine Klassenzuteilung geändert; das Ergebnis passt nicht mehr zur Wahl, wie sie jetzt steht. Für die Veröffentlichung ist ein neuer Lauf nötig.
      </p>
      <p
        v-if="selected.run.status === 'running'"
        class="muted"
      >
        Wird berechnet …
      </p>
      <div
        v-else-if="selected.run.status !== 'succeeded'"
        class="alert"
        role="alert"
      >
        <p><strong>{{ RUN_STATUS_LABELS[selected.run.status] ?? selected.run.status }}:</strong> {{ selected.run.failure ? RUN_FAILURE_LABELS[selected.run.failure] ?? selected.run.failure : '' }}</p>
        <p
          v-if="selected.run.detail"
          class="muted"
        >
          {{ selected.run.detail }}
        </p>
        <ul v-if="selected.run.problems.length > 0">
          <li
            v-for="(p, index) in selected.run.problems.slice(0, 20)"
            :key="index"
          >
            {{ ALLOCATION_PROBLEM_LABELS[p.code] ?? p.code }}<template v-if="p.itemId">
              · {{ itemTitle(selected, p.itemId) }}
            </template><template v-if="p.personId">
              · {{ studentName(selected, p.personId) }}
            </template><template v-if="p.level">
              · {{ levelLabel(p.level) }}: gemeldet {{ p.reported }}, nachgerechnet {{ p.recomputed }}
            </template>
          </li>
        </ul>
      </div>
      <div
        v-if="selected.run.warnings.length > 0"
        class="panel"
      >
        <p><strong>Hinweis vor dem Lösen:</strong> Für diese nicht absagbaren Aktivitäten kommen weniger Schüler/innen in Frage, als das Minimum verlangt. Schlägt der Lauf als unlösbar fehl, liegt es meist daran: absagbar machen, das Minimum senken oder die Aktivität zurückziehen.</p>
        <ul>
          <li
            v-for="w in selected.run.warnings"
            :key="w.itemId"
          >
            {{ itemTitle(selected, w.itemId) }}: {{ w.possible }} möglich, {{ w.minimum }} nötig
          </li>
        </ul>
      </div>

      <template v-if="selected.summary">
        <div
          v-if="canPublish"
          class="panel"
        >
          <h3>Veröffentlichen</h3>
          <p v-if="!publishing">
            Dieser Lauf wird das Ergebnis der Wahl: die Schüler/innen erhalten ihr Programm, die Klassenvorstände die Liste der nicht vollständig Zugeteilten, die Lehrkräfte abgesagter Aktivitäten die Absage. Danach ist kein weiterer Lauf möglich.
          </p>
          <p
            v-if="!publishing"
            class="actions"
          >
            <button
              type="button"
              :disabled="action.busy.value"
              @click="publishing = true"
            >
              Lauf {{ selected.run.seq }} veröffentlichen …
            </button>
          </p>
          <form
            v-else
            aria-label="Veröffentlichung bestätigen"
            @submit.prevent="onPublish"
          >
            <p v-if="selected.run.cancelledItemIds.length === 0">
              Keine Aktivität wird abgesagt.
            </p>
            <template v-else>
              <p>Diese Aktivitäten finden nicht statt, weil zu wenige sie gewünscht haben:</p>
              <ul>
                <li
                  v-for="itemId in selected.run.cancelledItemIds"
                  :key="itemId"
                >
                  {{ itemTitle(selected, itemId) }}
                </li>
              </ul>
              <label class="checks">
                <input
                  v-model="cancellationsConfirmed"
                  type="checkbox"
                >
                Ich bestätige diese Absagen.
              </label>
            </template>
            <p class="actions">
              <button
                type="submit"
                :disabled="action.busy.value || (selected.run.cancelledItemIds.length > 0 && !cancellationsConfirmed)"
              >
                Jetzt veröffentlichen
              </button>
              <button
                type="button"
                class="ghost"
                @click="publishing = false"
              >
                Abbrechen
              </button>
            </p>
          </form>
        </div>
        <p class="muted">
          Seed {{ selected.run.seed }} · Limit {{ selected.run.limits.deterministicTimePerLevel }} · Solver {{ selected.run.versions?.solver }} (OR-Tools {{ selected.run.versions?.ortools }}) · Regeln Version {{ selected.run.coreVersion }}
        </p>
        <p class="actions">
          <a
            class="button ghost-link"
            :href="withBase(runExportPath(props.id, selected.run.id))"
          >Lauf als Excel</a>
        </p>
        <ul class="cards">
          <li><strong>{{ selected.summary.students.total }}</strong> Schüler/innen, {{ selected.summary.students.choosing }} mit Wahl</li>
          <li><strong>{{ selected.summary.students.covered }}</strong> mit allen Tagen</li>
          <li><strong>{{ selected.summary.students.withDeficit }}</strong> mit fehlenden Minuten</li>
          <li><strong>{{ selected.summary.students.withFallback }}</strong> mit Ersatzplatz</li>
          <li><strong>{{ selected.run.cancelledItemIds.length }}</strong> abgesagt</li>
          <li><strong>{{ selected.summary.students.late }}</strong> aus der Nachfrist, <strong>{{ selected.summary.students.nonSubmitters }}</strong> ohne Wünsche</li>
        </ul>

        <h3>Stufen</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Stufe</th>
              <th>Wert (1. Durchgang)</th>
              <th>Wert (2. Durchgang)</th>
              <th v-if="other">
                Vergleich
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="level in levelsOf(selected)"
              :key="level.name"
            >
              <td>{{ levelLabel(level.name) }}</td>
              <td>{{ selected.run.passes[0]?.levels.find((l) => l.name === level.name)?.value ?? '–' }} <span class="muted">{{ selected.run.passes[0]?.levels.find((l) => l.name === level.name)?.proven ? '✓' : '≈' }}</span></td>
              <td>{{ level.value }} <span class="muted">{{ level.proven ? '✓ bewiesen' : '≈ nicht bewiesen' }}</span></td>
              <td v-if="other">
                <template v-if="levelDelta(level.name) !== null">
                  {{ levelDelta(level.name) === 0 ? 'gleich' : (levelDelta(level.name) as number) > 0 ? `+${levelDelta(level.name)}` : levelDelta(level.name) }}
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="muted">
          Durchgänge: {{ passSummary(selected) }}. Zuerst niemand ohne volle Woche, dann so wenige fehlende Minuten wie möglich, dann so wenige wie möglich mit hohem Durchschnittswunsch, dann das beste Gesamtergebnis; Gleichstand entscheidet das Los mit Seed {{ selected.run.seed }}.
        </p>

        <h3>Wünsche</h3>
        <table class="table">
          <thead>
            <tr>
              <th
                v-for="k in rankKeys"
                :key="k"
              >
                {{ k }}. Wunsch
              </th>
              <th>Ersatzplatz</th>
              <th>Klassenaktivität</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                v-for="k in rankKeys"
                :key="k"
              >
                {{ selected.summary.ranks[k] }}
              </td>
              <td>{{ selected.summary.ranks.fallback }}</td>
              <td>{{ selected.summary.ranks.fixed }}</td>
            </tr>
          </tbody>
        </table>

        <h3 v-if="selected.run.cancelledItemIds.length > 0">
          Abgesagt
        </h3>
        <ul v-if="selected.run.cancelledItemIds.length > 0">
          <li
            v-for="itemId in selected.run.cancelledItemIds"
            :key="itemId"
          >
            {{ itemTitle(selected, itemId) }}
          </li>
        </ul>

        <h3>Fehlende Minuten ({{ selected.summary.deficits.length }})</h3>
        <p
          v-if="selected.summary.deficits.length === 0"
          class="muted"
        >
          Niemandem fehlen Minuten.
        </p>
        <table
          v-else
          class="table"
        >
          <thead>
            <tr>
              <th>Schüler/in</th>
              <th>Klasse</th>
              <th>Tag</th>
              <th>Fehlend</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(d, index) in selected.summary.deficits"
              :key="index"
            >
              <td>{{ studentName(selected, d.personId) }}</td>
              <td>{{ selected.students.find((s) => s.personId === d.personId)?.className }}</td>
              <td>{{ formatDay(d.date) }}</td>
              <td>{{ d.minutes }} min</td>
            </tr>
          </tbody>
        </table>

        <h3>Ersatzplätze ({{ selected.summary.fallbacks.length }})</h3>
        <ul v-if="selected.summary.fallbacks.length > 0">
          <li
            v-for="(f, index) in selected.summary.fallbacks"
            :key="index"
          >
            {{ studentName(selected, f.personId) }} → {{ itemTitle(selected, f.itemId) }}
          </li>
        </ul>

        <h3>Aktivitäten</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Aktivität</th>
              <th>Plätze</th>
              <th>Zugeteilt</th>
              <th>Fix (Klassen)</th>
              <th>Minimum</th>
              <th>Stand</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in selected.items"
              :key="item.itemId"
            >
              <td>{{ item.number ?? '' }}</td>
              <td>{{ item.title }}</td>
              <td>{{ item.places }}</td>
              <td>{{ item.assigned }}</td>
              <td>{{ item.fixed }}</td>
              <td>{{ item.minimum }}</td>
              <td>
                <span
                  v-if="item.cancelled"
                  class="badge badge-withdrawn"
                >abgesagt</span>
                <span
                  v-else-if="item.assigned + item.fixed === 0"
                  class="badge"
                >leer</span>
              </td>
            </tr>
          </tbody>
        </table>

        <h3>Klassen</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Klasse</th>
              <th>Schüler/innen</th>
              <th>Mit fehlenden Minuten</th>
              <th>Mit Ersatzplatz</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in selected.summary.classes"
              :key="c.className"
            >
              <td>{{ c.className }}</td>
              <td>{{ c.students }}</td>
              <td>{{ c.withDeficit }}</td>
              <td>{{ c.withFallback }}</td>
            </tr>
          </tbody>
        </table>

        <h3>Vergleich</h3>
        <div class="field">
          <label for="compare">Mit Lauf</label>
          <select
            id="compare"
            v-model="compareId"
            @change="onCompare"
          >
            <option value="">
              –
            </option>
            <option
              v-for="run in runs.filter((r) => r.id !== selected?.run.id && r.status === 'succeeded')"
              :key="run.id"
              :value="run.id"
            >
              Lauf {{ run.seq }} (Seed {{ run.seed }})
            </option>
          </select>
        </div>
        <template v-if="other">
          <p>
            <strong>{{ differences.length }}</strong> Schüler/innen sind in Lauf {{ selected.run.seq }} anders zugeteilt als in Lauf {{ other.run.seq }}<template v-if="differences.length === 0">
              : dieselbe Zuteilung
            </template>.
          </p>
          <ul v-if="differences.length > 0">
            <li
              v-for="s in differences.slice(0, 50)"
              :key="s.personId"
            >
              {{ s.displayName }} ({{ s.className }}): {{ s.items.map((e) => itemTitle(selected as RunReviewResponse, e.itemId)).join(', ') }} <span class="muted">statt {{ (other.students.find((o) => o.personId === s.personId)?.items ?? []).map((e) => itemTitle(other as RunReviewResponse, e.itemId)).join(', ') || '–' }}</span>
            </li>
          </ul>
        </template>

        <h3>Schüler/innen ({{ selected.students.length }})</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Klasse</th>
              <th>Name</th>
              <th>Fenster</th>
              <th
                v-for="date in selected.projectDays"
                :key="date"
              >
                {{ formatDay(date) }}
              </th>
              <th>Ø Wunsch</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in selected.students"
              :key="s.personId"
            >
              <td>{{ s.className }}</td>
              <td>{{ s.displayName }}</td>
              <td>{{ s.window === null ? 'keine Wünsche' : WINDOW_LABELS[s.window] ?? s.window }}</td>
              <td
                v-for="date in selected.projectDays"
                :key="date"
                :class="{ alert: (s.days.find((d) => d.date === date)?.deficit ?? 0) > 0 }"
              >
                {{ placeLabel(selected, s, date) || '–' }}
                <span
                  v-if="(s.days.find((d) => d.date === date)?.deficit ?? 0) > 0"
                  class="muted"
                >({{ s.days.find((d) => d.date === date)?.deficit }} min fehlen)</span>
              </td>
              <td>{{ s.averageRank === null ? '–' : s.averageRank.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="muted">
          Quellen: {{ Object.values(ASSIGNMENT_SOURCE_LABELS).join(', ') }}.
        </p>
      </template>
    </section>
  </template>
</template>
