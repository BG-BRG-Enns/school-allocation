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
import { assignmentsExportPath, attendanceExportPath, changeAssignment, loadChanges, loadRun, loadRuns, loadSolverStatus, publishRun, runExportPath, startRun, type AllocationRun, type AssignmentChange, type ReviewStudent, type RunReviewResponse, type SolverStatusResponse } from '../lib/allocation-api.ts'
import { withBase } from '../lib/base.ts'
import { loadCampaign, loadItems, type Campaign, type Item } from '../lib/campaigns-api.ts'
import { formatWhen, useFeedback } from '../lib/feedback.ts'
import { formatDay } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { ALLOCATION_PROBLEM_LABELS, ASSIGNMENT_SOURCE_LABELS, CAMPAIGN_STATE_LABELS, CHANGE_KIND_LABELS, levelLabel, RUN_FAILURE_LABELS, RUN_STATUS_LABELS, SOLVE_STATUS_LABELS, WINDOW_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'

const props = defineProps<{ id: string }>()
usePageTitle(() => t.common.page.allocation)
/** The server's setting for the solver, named where it is missing. */
const SOLVER_SETTING = 'SOLVER_URL'

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
  }, t.allocation.published)
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
  }, t.allocation.changed)
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
  }, t.allocation.started)
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
  .map((e) => `${itemTitle(review, e.itemId)}${e.source === 'wish' ? ` (${t.allocation.place.wish(e.rank)})` : e.source === 'fallback' ? ` (${t.allocation.place.fallback})` : e.source === 'fixed' ? ` (${t.allocation.place.fixed})` : ''}`)
  .join(', ')
type Warning = AllocationRun['warnings'][number]
const itemWarnings = computed(() => (selected.value?.run.warnings ?? []).filter((w): w is Extract<Warning, { code: 'minimum_out_of_reach' }> => w.code === 'minimum_out_of_reach'))
const ruleWarnings = computed(() => (selected.value?.run.warnings ?? []).filter((w): w is Extract<Warning, { code: 'rule_out_of_reach' }> => w.code === 'rule_out_of_reach'))
/** A rule of the run, by its snapshot: "Sport: mindestens 1 Aktivität"; with whom it asks when `scoped`. */
const ruleText = (review: RunReviewResponse, ruleId: string, scoped = false): string => {
  const rule = review.rules.find((r) => r.id === ruleId)
  if (!rule) return '?'
  const asks = t.rules.asks(review.categories.find((c) => c.id === rule.categoryId)?.name ?? '?', rule.minimum, rule.unit)
  return scoped ? `${asks} · ${t.rules.scope(rule.grades, rule.classes)}` : asks
}
/** An amount of a rule: minutes for a minutes rule, a count otherwise. */
const ruleAmount = (review: RunReviewResponse, ruleId: string, amount: number): string => review.rules.find((r) => r.id === ruleId)?.unit === 'minutes' ? t.common.minutes(amount) : String(amount)
/** A student's rules in a cell: met, or each one missed with how far the student is. */
const studentRules = (review: RunReviewResponse, student: ReviewStudent): string => {
  if (student.rules.length === 0) return '–'
  const missed = student.rules.filter((r) => !r.met)
  return missed.length === 0 ? t.rules.met : missed.map((r) => `${ruleText(review, r.ruleId)} (${t.rules.progress(r.have, r.minimum, r.unit)})`).join('; ')
}
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
    const their = theirs.get(s.personId)
    return their === undefined || key(their) !== key(s)
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
      ← {{ t.common.backToCampaign }}
    </RouterLink>
  </p>
  <h1>{{ t.common.page.allocation }}</h1>
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
      <h2>{{ t.allocation.publication.heading }}</h2>
      <p>
        {{ t.allocation.publication.text(publishedRun.seq, formatWhen(publishedRun.publishedAt)) }}
      </p>
      <p class="actions">
        <a
          class="button ghost-link"
          :href="withBase(assignmentsExportPath(props.id))"
        >{{ t.allocation.publication.assignmentsExport }}</a>
        <a
          class="button ghost-link"
          :href="withBase(attendanceExportPath(props.id))"
        >{{ t.allocation.publication.attendanceExport }}</a>
      </p>
      <h3>{{ t.allocation.publication.changes(changes.length) }}</h3>
      <p
        v-if="changes.length === 0"
        class="muted"
      >
        {{ t.allocation.publication.noChanges }}
      </p>
      <table v-else>
        <thead>
          <tr>
            <th>{{ t.common.field.number }}</th>
            <th>{{ t.allocation.publication.when }}</th>
            <th>{{ t.allocation.publication.kind }}</th>
            <th>{{ t.common.field.student }}</th>
            <th>{{ t.allocation.publication.left }}</th>
            <th>{{ t.allocation.publication.to }}</th>
            <th>{{ t.common.field.reason }}</th>
            <th>{{ t.allocation.publication.by }}</th>
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
                · {{ t.allocation.publication.forced }}
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
        :aria-label="t.allocation.change.title"
        @submit.prevent="onChange"
      >
        <h3>{{ t.allocation.change.title }}</h3>
        <p class="muted">
          {{ t.allocation.change.rules }}
        </p>
        <div class="row">
          <p class="field">
            <label for="change-person">{{ t.common.field.student }}</label>
            <select
              id="change-person"
              v-model="changePerson"
              required
            >
              <option value="">
                {{ t.common.pleaseChoose }}
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
            <label for="change-from">{{ t.allocation.change.from }}</label>
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
            <label for="change-to">{{ t.allocation.change.to }}</label>
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
                {{ i.number === null ? i.title : `${i.number}. ${i.title}` }} ({{ t.allocation.change.free(Math.max(0, i.places - i.assigned)) }})
              </option>
            </select>
          </p>
        </div>
        <p class="field">
          <label for="change-reason">{{ t.common.field.reason }}</label>
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
            {{ t.allocation.change.force }}
          </label>
        </p>
        <p class="actions">
          <button
            type="submit"
            :disabled="!canChange || action.busy.value"
          >
            {{ t.allocation.change.submit }}
          </button>
        </p>
      </form>
    </section>

    <section>
      <h2>{{ t.allocation.start.heading }}</h2>
      <p
        v-if="!solverConfigured"
        class="muted"
      >
        {{ t.allocation.start.noSolver.before }} (<code>{{ SOLVER_SETTING }}</code>); {{ t.allocation.start.noSolver.after }}
      </p>
      <p
        v-else-if="solver && !solver.reachable"
        class="alert"
        role="alert"
      >
        {{ t.allocation.start.unreachable }}
      </p>
      <p
        v-else-if="solver"
        class="muted"
      >
        {{ t.allocation.start.ready(solver.ortools ?? '', solver.contract ?? '') }}
      </p>
      <p
        v-if="campaign.state !== 'closed' && campaign.state !== 'review' && campaign.state !== 'allocating'"
        class="muted"
      >
        {{ t.allocation.start.notClosed }}
      </p>
      <form
        v-else
        class="panel"
        :aria-label="t.allocation.start.heading"
        @submit.prevent="onStart()"
      >
        <div class="field">
          <label for="seed">{{ t.allocation.start.seed }}</label>
          <input
            id="seed"
            v-model="seed"
            type="number"
            min="0"
            step="1"
            :placeholder="t.allocation.start.seedExample"
          >
        </div>
        <div class="field">
          <label for="limit">{{ t.allocation.start.limit }}</label>
          <input
            id="limit"
            v-model.number="limit"
            type="number"
            min="1"
            max="60"
            step="1"
          >
          <p class="muted">
            {{ t.allocation.start.limitHint }}
          </p>
        </div>
        <p class="actions">
          <button
            type="submit"
            :disabled="!canStart || action.busy.value"
          >
            {{ t.allocation.start.submit }}
          </button>
          <span
            v-if="running"
            class="muted"
          >{{ t.allocation.start.running }}</span>
        </p>
      </form>
    </section>

    <section>
      <h2>{{ t.allocation.runs.heading(runs.length) }}</h2>
      <p
        v-if="runs.length === 0"
        class="muted"
      >
        {{ t.allocation.runs.none }}
      </p>
      <table
        v-else
        class="table"
      >
        <thead>
          <tr>
            <th>{{ t.allocation.runs.run }}</th>
            <th>{{ t.allocation.runs.started }}</th>
            <th>{{ t.allocation.runs.status }}</th>
            <th>{{ t.allocation.runs.seed }}</th>
            <th>{{ t.allocation.runs.limit }}</th>
            <th>{{ t.allocation.runs.deficit }}</th>
            <th>{{ t.allocation.runs.notCovered }}</th>
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
              >{{ t.allocation.runs.published }}</span>
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
                {{ t.common.view }}
              </button>
              <button
                type="button"
                class="ghost"
                :disabled="!canStart || action.busy.value"
                :title="t.allocation.runs.repeatHint(run.seed, run.limits.deterministicTimePerLevel)"
                @click="onStart(run.seed, run.limits.deterministicTimePerLevel)"
              >
                {{ t.allocation.runs.repeat }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="selected">
      <h2>{{ t.allocation.review.heading(selected.run.seq) }}</h2>
      <p
        v-if="selected.stale"
        class="alert"
        role="alert"
      >
        {{ t.allocation.review.stale }}
      </p>
      <p
        v-if="selected.run.status === 'running'"
        class="muted"
      >
        {{ t.allocation.review.computing }}
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
              · {{ levelLabel(p.level) }}: {{ t.allocation.review.levelMismatch(p.reported ?? '', p.recomputed ?? '') }}
            </template>
          </li>
        </ul>
      </div>
      <div
        v-if="itemWarnings.length > 0"
        class="panel"
      >
        <p><strong>{{ t.allocation.review.warningLead }}:</strong> {{ t.allocation.review.warning }}</p>
        <ul>
          <li
            v-for="w in itemWarnings"
            :key="w.itemId"
          >
            {{ itemTitle(selected, w.itemId) }}: {{ t.allocation.review.possible(w.possible, w.minimum) }}
          </li>
        </ul>
      </div>
      <div
        v-if="ruleWarnings.length > 0"
        class="panel"
      >
        <p><strong>{{ t.allocation.review.ruleWarningLead }}:</strong> {{ t.allocation.review.ruleWarning }}</p>
        <ul>
          <li
            v-for="w in ruleWarnings"
            :key="`${w.ruleId}-${w.grade}`"
          >
            {{ t.allocation.review.ruleOutOfReach(ruleText(selected, w.ruleId), w.grade, w.possible, w.needed) }}
          </li>
        </ul>
      </div>

      <template v-if="selected.summary">
        <div
          v-if="canPublish"
          class="panel"
        >
          <h3>{{ t.allocation.publish.heading }}</h3>
          <p v-if="!publishing">
            {{ t.allocation.publish.text }}
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
              {{ t.allocation.publish.start(selected.run.seq) }}
            </button>
          </p>
          <form
            v-else
            :aria-label="t.allocation.publish.confirm"
            @submit.prevent="onPublish"
          >
            <p v-if="selected.run.cancelledItemIds.length === 0">
              {{ t.allocation.publish.noCancellations }}
            </p>
            <template v-else>
              <p>{{ t.allocation.publish.cancellations }}</p>
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
                {{ t.allocation.publish.confirmCancellations }}
              </label>
            </template>
            <p class="actions">
              <button
                type="submit"
                :disabled="action.busy.value || (selected.run.cancelledItemIds.length > 0 && !cancellationsConfirmed)"
              >
                {{ t.allocation.publish.submit }}
              </button>
              <button
                type="button"
                class="ghost"
                @click="publishing = false"
              >
                {{ t.common.cancel }}
              </button>
            </p>
          </form>
        </div>
        <p class="muted">
          {{ t.allocation.review.meta(selected.run.seed, selected.run.limits.deterministicTimePerLevel, selected.run.versions?.solver ?? '', selected.run.versions?.ortools ?? '', selected.run.coreVersion) }}
        </p>
        <p class="actions">
          <a
            class="button ghost-link"
            :href="withBase(runExportPath(props.id, selected.run.id))"
          >{{ t.allocation.review.runExport }}</a>
        </p>
        <ul class="cards">
          <li><strong>{{ selected.summary.students.total }}</strong> {{ t.allocation.counts.students(selected.summary.students.choosing) }}</li>
          <li><strong>{{ selected.summary.students.covered }}</strong> {{ t.allocation.counts.covered }}</li>
          <li><strong>{{ selected.summary.students.withDeficit }}</strong> {{ t.allocation.counts.withDeficit }}</li>
          <li><strong>{{ selected.summary.students.withFallback }}</strong> {{ t.allocation.counts.withFallback }}</li>
          <li v-if="selected.rules.length > 0">
            <strong>{{ selected.summary.students.missingRule }}</strong> {{ t.allocation.counts.missingRule }}
          </li>
          <li><strong>{{ selected.run.cancelledItemIds.length }}</strong> {{ t.allocation.counts.cancelled }}</li>
          <li><strong>{{ selected.summary.students.late }}</strong> {{ t.allocation.counts.late }}, <strong>{{ selected.summary.students.nonSubmitters }}</strong> {{ t.allocation.counts.nonSubmitters }}</li>
        </ul>

        <h3>{{ t.allocation.review.levels }}</h3>
        <table class="table">
          <thead>
            <tr>
              <th>{{ t.allocation.review.level }}</th>
              <th>{{ t.allocation.review.firstPass }}</th>
              <th>{{ t.allocation.review.secondPass }}</th>
              <th v-if="other">
                {{ t.allocation.review.comparison }}
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
              <td>{{ level.value }} <span class="muted">{{ level.proven ? t.allocation.review.proven : t.allocation.review.notProven }}</span></td>
              <td v-if="other">
                <template v-if="levelDelta(level.name) !== null">
                  {{ levelDelta(level.name) === 0 ? t.allocation.review.equal : (levelDelta(level.name) as number) > 0 ? `+${levelDelta(level.name)}` : levelDelta(level.name) }}
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="muted">
          {{ t.allocation.review.passes(passSummary(selected), selected.run.seed) }}
          <template v-if="selected.rules.length > 0">
            {{ t.allocation.review.passesRules }}
          </template>
        </p>

        <h3>{{ t.allocation.review.wishes }}</h3>
        <table class="table">
          <thead>
            <tr>
              <th
                v-for="k in rankKeys"
                :key="k"
              >
                {{ t.allocation.review.rank(k) }}
              </th>
              <th>{{ t.allocation.review.fallback }}</th>
              <th>{{ t.allocation.review.fixed }}</th>
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
          {{ t.allocation.review.cancelled }}
        </h3>
        <ul v-if="selected.run.cancelledItemIds.length > 0">
          <li
            v-for="itemId in selected.run.cancelledItemIds"
            :key="itemId"
          >
            {{ itemTitle(selected, itemId) }}
          </li>
        </ul>

        <h3>{{ t.allocation.review.deficits(selected.summary.deficits.length) }}</h3>
        <p
          v-if="selected.summary.deficits.length === 0"
          class="muted"
        >
          {{ t.allocation.review.noDeficits }}
        </p>
        <table
          v-else
          class="table"
        >
          <thead>
            <tr>
              <th>{{ t.common.field.student }}</th>
              <th>{{ t.common.field.className }}</th>
              <th>{{ t.common.field.day }}</th>
              <th>{{ t.allocation.review.missing }}</th>
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
              <td>{{ t.common.minutes(d.minutes) }}</td>
            </tr>
          </tbody>
        </table>

        <h3>{{ t.allocation.review.fallbacks(selected.summary.fallbacks.length) }}</h3>
        <ul v-if="selected.summary.fallbacks.length > 0">
          <li
            v-for="(f, index) in selected.summary.fallbacks"
            :key="index"
          >
            {{ studentName(selected, f.personId) }} → {{ itemTitle(selected, f.itemId) }}
          </li>
        </ul>

        <template v-if="selected.rules.length > 0">
          <h3>{{ t.allocation.review.rules }}</h3>
          <ul>
            <li
              v-for="r in selected.summary.rules"
              :key="r.ruleId"
            >
              {{ ruleText(selected, r.ruleId, true) }}: {{ t.allocation.review.ruleMet(r.met, r.students) }}
            </li>
          </ul>
          <h3>{{ t.allocation.review.ruleGaps(selected.summary.ruleGaps.length) }}</h3>
          <table
            v-if="selected.summary.ruleGaps.length > 0"
            class="table"
          >
            <thead>
              <tr>
                <th>{{ t.common.field.student }}</th>
                <th>{{ t.common.field.className }}</th>
                <th>{{ t.rules.rule }}</th>
                <th>{{ t.allocation.review.missing }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(g, index) in selected.summary.ruleGaps"
                :key="index"
              >
                <td>{{ studentName(selected, g.personId) }}</td>
                <td>{{ selected.students.find((s) => s.personId === g.personId)?.className }}</td>
                <td>{{ ruleText(selected, g.ruleId) }}</td>
                <td>{{ ruleAmount(selected, g.ruleId, g.missing) }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <h3>{{ t.allocation.review.items }}</h3>
        <table class="table">
          <thead>
            <tr>
              <th>{{ t.common.field.number }}</th>
              <th>{{ t.common.field.item }}</th>
              <th>{{ t.common.field.places }}</th>
              <th>{{ t.allocation.review.assigned }}</th>
              <th>{{ t.allocation.review.fixedClasses }}</th>
              <th>{{ t.allocation.review.minimum }}</th>
              <th>{{ t.common.field.state }}</th>
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
                >{{ t.allocation.review.itemCancelled }}</span>
                <span
                  v-else-if="item.assigned + item.fixed === 0"
                  class="badge"
                >{{ t.allocation.review.itemEmpty }}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <h3>{{ t.allocation.review.classes }}</h3>
        <table class="table">
          <thead>
            <tr>
              <th>{{ t.common.field.className }}</th>
              <th>{{ t.common.field.students }}</th>
              <th>{{ t.allocation.review.classWithDeficit }}</th>
              <th>{{ t.allocation.review.classWithFallback }}</th>
              <th v-if="selected.rules.length > 0">
                {{ t.allocation.review.classMissingRule }}
              </th>
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
              <td v-if="selected.rules.length > 0">
                {{ c.missingRule }}
              </td>
            </tr>
          </tbody>
        </table>

        <h3>{{ t.allocation.review.compare }}</h3>
        <div class="field">
          <label for="compare">{{ t.allocation.review.compareWith }}</label>
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
              {{ t.allocation.review.compareOption(run.seq, run.seed) }}
            </option>
          </select>
        </div>
        <template v-if="other">
          <p>
            <strong>{{ differences.length }}</strong> {{ t.allocation.review.differences(selected.run.seq, other.run.seq) }}<template v-if="differences.length === 0">
              : {{ t.allocation.review.noDifferences }}
            </template>.
          </p>
          <ul v-if="differences.length > 0">
            <li
              v-for="s in differences.slice(0, 50)"
              :key="s.personId"
            >
              {{ s.displayName }} ({{ s.className }}): {{ s.items.map((e) => itemTitle(selected as RunReviewResponse, e.itemId)).join(', ') }} <span class="muted">{{ t.allocation.review.instead }} {{ (other.students.find((o) => o.personId === s.personId)?.items ?? []).map((e) => itemTitle(other as RunReviewResponse, e.itemId)).join(', ') || '–' }}</span>
            </li>
          </ul>
        </template>

        <h3>{{ t.allocation.review.studentList(selected.students.length) }}</h3>
        <table class="table">
          <thead>
            <tr>
              <th>{{ t.common.field.className }}</th>
              <th>{{ t.common.field.name }}</th>
              <th>{{ t.allocation.review.window }}</th>
              <th
                v-for="date in selected.projectDays"
                :key="date"
              >
                {{ formatDay(date) }}
              </th>
              <th>{{ t.allocation.review.averageRank }}</th>
              <th v-if="selected.rules.length > 0">
                {{ t.allocation.review.rules }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in selected.students"
              :key="s.personId"
            >
              <td>{{ s.className }}</td>
              <td>{{ s.displayName }}</td>
              <td>{{ s.window === null ? t.allocation.review.noWishes : WINDOW_LABELS[s.window] ?? s.window }}</td>
              <td
                v-for="date in selected.projectDays"
                :key="date"
                :class="{ alert: (s.days.find((d) => d.date === date)?.deficit ?? 0) > 0 }"
              >
                {{ placeLabel(selected, s, date) || '–' }}
                <span
                  v-if="(s.days.find((d) => d.date === date)?.deficit ?? 0) > 0"
                  class="muted"
                >({{ t.allocation.review.minutesMissing(s.days.find((d) => d.date === date)?.deficit ?? 0) }})</span>
              </td>
              <td>{{ s.averageRank === null ? '–' : s.averageRank.toFixed(2) }}</td>
              <td
                v-if="selected.rules.length > 0"
                :class="{ alert: s.rules.some((r) => !r.met) }"
              >
                {{ studentRules(selected, s) }}
              </td>
            </tr>
          </tbody>
        </table>
        <p class="muted">
          {{ t.allocation.review.sources(Object.values(ASSIGNMENT_SOURCE_LABELS).join(', ')) }}
        </p>
      </template>
    </section>
  </template>
</template>
