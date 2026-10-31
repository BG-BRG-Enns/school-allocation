<script setup lang="ts">
// One campaign: its state and days, the activities as far as the person
// may see them, and what they may do: teachers propose and tend their own,
// organizers review, move the campaign on, set its rules and export the
// catalogue.

import { MAX_RULES, placeTarget, RULE_LIMITS, RULE_UNITS } from '@school-allocation/school-core'
import { computed, onMounted, ref, watch } from 'vue'
import { approveItem, catalogueExportPath, deleteItem, loadCampaign, loadCategories, loadClasses, loadDemand, loadItems, loadMissing as loadMissingList, missingExportPath, proposeItem, returnItem, transitionCampaign, unproposeItem, updateCampaign, withdrawItem, type CampaignChanges, type CampaignRule, type CampaignView, type Category, type DayDemand, type Item, type MissingStudent, type RuleDemand, type RuleUnit } from '../lib/campaigns-api.ts'
import { ApiError } from '../lib/api-rules.ts'
import { withBase } from '../lib/base.ts'
import { useFeedback } from '../lib/feedback.ts'
import { formatDay, formatFee, formatSpan, formatWhenShort, instantInSchoolZone, localDateOf, localTimeOf } from '../lib/format.ts'
import { t } from '../lib/i18n.ts'
import { CAMPAIGN_STATE_LABELS, CHOICE_STATE_LABELS, ITEM_STATE_LABELS, MAIL_KIND_LABELS, MAIL_STATE_LABELS, RULE_PROBLEM_LABELS, RULE_UNIT_LABELS, WINDOW_LABELS } from '../lib/labels.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

const props = defineProps<{ id: string }>()
const view = ref<CampaignView | null>(null)
const items = ref<Item[]>([])
const demand = ref<DayDemand[]>([])
const ruleDemand = ref<RuleDemand[]>([])
const grades = ref<number[]>([])
/** The school's categories, to name the rules by. */
const categories = ref<Category[]>([])
const loading = useFeedback()
const action = useFeedback()
usePageTitle(() => view.value?.campaign.name ?? t.campaign.title)

async function load(): Promise<void> {
  await loading.run(async () => {
    const [v, list] = await Promise.all([loadCampaign(props.id), loadItems(props.id)])
    view.value = v
    items.value = list.items
    if (v.may.seeDemand) {
      const [d, c] = await Promise.all([loadDemand(props.id), loadClasses(props.id)])
      demand.value = d.demand
      ruleDemand.value = d.rules
      grades.value = [...new Set(c.classes.map((cl) => cl.grade))].sort((a, b) => a - b)
    }
    if (v.may.organize || v.campaign.rules.length > 0) categories.value = (await loadCategories()).categories
  })
}
onMounted(load)
watch(() => props.id, load)

const campaign = computed(() => view.value?.campaign)
const organizes = computed(() => view.value?.may.organize ?? false)
const teaches = computed(() => session.value?.person?.kind === 'teacher')
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
const settingsButton = computed(() => windowEditable.value ? t.campaign.organization.editSettings : minimumEditable.value ? t.campaign.organization.editMinimumAndSwap : t.campaign.organization.editSwap)
/** The grades the demand lists: those of the roster, or those the demand knows. */
const demandGrades = computed(() => grades.value.length > 0 ? grades.value : [...new Set(demand.value.flatMap((d) => d.grades.map((g) => g.grade)))].sort((a, b) => a - b))

/** The window in one line, once a date is set: "Wahl von … bis …, Nachfrist bis …, Ummelden von … bis … · 3 Wünsche je Zeitgruppe". */
const windowSummary = computed(() => {
  const c = campaign.value
  if (!c || (c.opensAt === null && c.closesAt === null)) return ''
  const parts = [t.campaign.window.opens(formatWhenShort(c.opensAt), formatWhenShort(c.closesAt))]
  if (c.lateUntil !== null) parts.push(t.campaign.window.late(formatWhenShort(c.lateUntil)))
  if (c.swapFrom !== null) parts.push(t.campaign.window.swap(formatWhenShort(c.swapFrom), formatWhenShort(c.swapUntil)))
  return `${parts.join(', ')} · ${t.campaign.window.wishes(c.wishesPerGroup)}`
})

function demandOf(day: DayDemand, grade: number): DayDemand['grades'][number] | undefined {
  return day.grades.find((g) => g.grade === grade)
}

/** The places a grade should be offered on a day: what it needs and the registration's headroom on top. */
function targetOf(day: DayDemand, grade: number): number {
  return placeTarget(demandOf(day, grade)?.needing ?? 0, campaign.value?.placeHeadroomPercent ?? 0)
}

/** A cell of the demand table: who needs a place, the target and what is offered; empty when the day has no entry for the grade. */
function demandText(day: DayDemand, grade: number): string {
  const d = demandOf(day, grade)
  return d ? t.campaign.demand.cell(d.needing, targetOf(day, grade), d.offered) : ''
}

/** How many places a grade lacks on a day to reach the target; 0 when it is reached. */
function shortOf(day: DayDemand, grade: number): number {
  const d = demandOf(day, grade)
  return d ? Math.max(0, targetOf(day, grade) - d.offered) : 0
}

/** What a rule asks of whom, in a line: "Sport: mindestens 1 Aktivität · 9. Schulstufe". */
function ruleText(rule: Pick<CampaignRule, 'categoryId' | 'minimum' | 'unit' | 'grades' | 'classes'>): string {
  const category = categories.value.find((c) => c.id === rule.categoryId)?.name ?? '–'
  return `${t.rules.asks(category, rule.minimum, rule.unit)} · ${t.rules.scope(rule.grades, rule.classes)}`
}

/** The rules by id, for the demand table; an amount of a minutes rule in minutes. */
const ruleById = computed(() => new Map((campaign.value?.rules ?? []).map((rule) => [rule.id, rule])))
/** What the rule asks, without whom: the demand table has the grade in its own column. */
function ruleAsks(ruleId: string): string {
  const rule = ruleById.value.get(ruleId)
  return rule ? t.rules.asks(categories.value.find((c) => c.id === rule.categoryId)?.name ?? '–', rule.minimum, rule.unit) : '–'
}
function ruleAmount(ruleId: string, amount: number): string {
  return ruleById.value.get(ruleId)?.unit === 'minutes' ? t.common.minutes(amount) : String(amount)
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
const placeHeadroomPercent = ref(20)
/** The rules as the form holds them: the classes as typed, the minimum as a number input gives it. */
interface RuleDraft { categoryId: string, grades: number[], classes: string, unit: RuleUnit, minimum: number | string }
const rules = ref<RuleDraft[]>([])
/** Why the server refused the rules, a line each. */
const ruleProblems = ref<string[]>([])
/** The grades a rule may name: the roster's, and any a rule names already. */
const ruleGrades = computed(() => [...new Set([...demandGrades.value, ...rules.value.flatMap((rule) => rule.grades)])].sort((a, b) => a - b))
function addRule(): void {
  rules.value.push({ categoryId: categories.value[0]?.id ?? '', grades: [...demandGrades.value], classes: '', unit: 'items', minimum: 1 })
}
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
  placeHeadroomPercent.value = c.placeHeadroomPercent
  rules.value = c.rules.map((rule) => ({ categoryId: rule.categoryId, grades: [...rule.grades], classes: rule.classes.join(', '), unit: rule.unit, minimum: rule.minimum }))
  ruleProblems.value = []
  editing.value = true
}
async function onSaveSettings(): Promise<void> {
  ruleProblems.value = []
  const ok = await action.run(async () => {
    const changes: CampaignChanges = { name: name.value.trim(), schoolYear: schoolYear.value.trim(), projectDays: days.value.filter(Boolean) }
    if (windowEditable.value) {
      changes.opensAt = instantOrNull(opensAt.value)
      changes.closesAt = instantOrNull(closesAt.value)
      changes.lateUntil = instantOrNull(lateUntil.value)
      changes.wishesPerGroup = Number(wishesPerGroup.value)
      changes.showTeachers = showTeachers.value
      changes.placeHeadroomPercent = Number(placeHeadroomPercent.value)
      changes.rules = rules.value.map((rule) => ({
        categoryId: rule.categoryId,
        grades: [...rule.grades].sort((a, b) => a - b),
        classes: rule.classes.split(/[\s,;]+/).filter(Boolean),
        unit: rule.unit,
        minimum: Number(rule.minimum),
      }))
    }
    if (swapEditable.value) {
      changes.swapFrom = instantOrNull(swapFrom.value)
      changes.swapUntil = instantOrNull(swapUntil.value)
    }
    if (minimumEditable.value) {
      changes.dailyMinimum = Object.fromEntries(Object.entries(dailyMinimum.value).filter(([, minutes]) => String(minutes).trim() !== '').map(([grade, minutes]) => [grade, Number(minutes)]))
    }
    try {
      await updateCampaign(props.id, changes)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'rules_invalid' && Array.isArray(err.body.problems)) {
        ruleProblems.value = (err.body.problems as { code: string, rule?: number }[]).map((p) => {
          const label = RULE_PROBLEM_LABELS[p.code] ?? p.code
          return p.rule === undefined ? label : `${t.campaign.rulesEditor.rule(p.rule + 1)}: ${label}`
        })
      }
      throw err
    }
  }, t.common.saved)
  if (ok) {
    editing.value = false
    await load()
  }
}
async function onTransition(to: 'catalogue' | 'published' | 'open' | 'closed' | 'archived'): Promise<void> {
  // The archive is the end: nothing of the campaign changes afterwards, so it is asked once more.
  if (to === 'archived' && !window.confirm(t.campaign.organization.archiveConfirm)) return
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
      ← {{ t.common.page.campaigns }}
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
      {{ t.campaign.yearAndDays(campaign.schoolYear, campaign.projectDays.map(formatDay).join(', ')) }}
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
        {{ t.campaign.myClass(className) }}
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
      <h2>{{ t.campaign.organization.heading }}</h2>
      <p
        v-if="view.counts"
        class="muted"
      >
        {{ t.campaign.organization.itemCounts(view.counts) }}
      </p>
      <p
        v-if="campaign.rules.length > 0"
        class="muted"
      >
        {{ t.campaign.organization.rules }}:
        <template
          v-for="rule in campaign.rules"
          :key="rule.id"
        >
          <br>{{ ruleText(rule) }}
        </template>
      </p>
      <p class="actions">
        <button
          v-if="campaign.state === 'draft'"
          type="button"
          :disabled="action.busy.value"
          @click="onTransition('catalogue')"
        >
          {{ t.campaign.organization.collect }}
        </button>
        <button
          v-if="campaign.state === 'catalogue'"
          type="button"
          :disabled="action.busy.value"
          @click="onTransition('published')"
        >
          {{ t.campaign.organization.publish }}
        </button>
        <button
          v-if="campaign.state === 'published'"
          type="button"
          :disabled="action.busy.value"
          @click="onTransition('open')"
        >
          {{ t.campaign.organization.open }}
        </button>
        <button
          v-if="campaign.state === 'results'"
          type="button"
          class="ghost"
          :disabled="action.busy.value"
          @click="onTransition('archived')"
        >
          {{ t.campaign.organization.archive }}
        </button>
        <button
          v-if="campaign.state === 'open' || campaign.state === 'grace'"
          type="button"
          class="ghost"
          :disabled="action.busy.value"
          @click="onTransition('closed')"
        >
          {{ t.campaign.organization.close }}
        </button>
        <RouterLink
          v-if="['closed', 'allocating', 'review', 'results', 'archived'].includes(campaign.state)"
          class="button"
          :to="`/wahlen/${campaign.id}/zuteilung`"
        >
          {{ t.common.page.allocation }}
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
        >{{ t.campaign.organization.catalogueExport }}</a>
        <RouterLink
          class="button ghost-link"
          :to="`/wahlen/${campaign.id}/lehrkraefte`"
        >
          {{ t.common.page.planning }}
        </RouterLink>
        <RouterLink
          class="button ghost-link"
          to="/verwaltung/klassen"
        >
          {{ t.common.page.classTeachers }}
        </RouterLink>
        <RouterLink
          class="button ghost-link"
          to="/verwaltung/kategorien"
        >
          {{ t.common.page.categories }}
        </RouterLink>
        <RouterLink
          class="button ghost-link"
          to="/verwaltung/mailvorlagen"
        >
          {{ t.common.page.mailTemplates }}
        </RouterLink>
      </p>
      <form
        v-if="editing"
        class="panel"
        :aria-label="t.campaign.settings.label"
        @submit.prevent="onSaveSettings"
      >
        <p class="field">
          <label for="edit-name">{{ t.campaign.settings.name }}</label>
          <input
            id="edit-name"
            v-model="name"
            required
            maxlength="200"
            :disabled="!setUpEditable"
          >
        </p>
        <p class="field">
          <label for="edit-year">{{ t.common.field.schoolYear }}</label>
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
          <legend>{{ t.campaign.projectDays }}</legend>
          <p
            v-for="(_, index) in days"
            :key="index"
            class="actions"
          >
            <input
              v-model="days[index]"
              :aria-label="t.campaign.settings.projectDay(index + 1)"
              type="date"
              required
            >
            <button
              v-if="days.length > 1"
              type="button"
              class="ghost"
              @click="days.splice(index, 1)"
            >
              {{ t.common.remove }}
            </button>
          </p>
          <p>
            <button
              type="button"
              class="ghost"
              :disabled="days.length >= 10"
              @click="days.push('')"
            >
              {{ t.common.addDay }}
            </button>
          </p>
        </fieldset>
        <fieldset class="field">
          <legend>{{ t.campaign.settings.window }}</legend>
          <div class="row">
            <p class="field">
              <label for="edit-opens">{{ t.campaign.settings.opens }}</label>
              <input
                id="edit-opens"
                v-model="opensAt"
                :disabled="!windowEditable"
                type="datetime-local"
              >
            </p>
            <p class="field">
              <label for="edit-closes">{{ t.campaign.settings.closes }}</label>
              <input
                id="edit-closes"
                v-model="closesAt"
                :disabled="!windowEditable"
                type="datetime-local"
              >
            </p>
            <p class="field">
              <label for="edit-late">{{ t.campaign.settings.lateUntil }}</label>
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
              <label for="edit-swap-from">{{ t.campaign.settings.swapFrom }}</label>
              <input
                id="edit-swap-from"
                v-model="swapFrom"
                :disabled="!swapEditable"
                type="datetime-local"
              >
            </p>
            <p class="field">
              <label for="edit-swap-until">{{ t.campaign.settings.swapUntil }}</label>
              <input
                id="edit-swap-until"
                v-model="swapUntil"
                :disabled="!swapEditable"
                type="datetime-local"
              >
            </p>
            <p class="field">
              <label for="edit-wishes">{{ t.campaign.settings.wishesPerGroup }}</label>
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
            <p class="field">
              <label for="edit-headroom">{{ t.campaign.settings.placeHeadroomPercent }}</label>
              <input
                id="edit-headroom"
                v-model.number="placeHeadroomPercent"
                :disabled="!windowEditable"
                type="number"
                min="0"
                max="100"
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
              <label :for="`edit-min-${grade}`">{{ t.campaign.settings.dailyMinimum(Number(grade)) }}</label>
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
              {{ t.campaign.settings.showTeachers }}
            </label>
          </p>
        </fieldset>
        <fieldset
          class="field"
          :disabled="!windowEditable"
        >
          <legend>{{ t.campaign.rulesEditor.heading }}</legend>
          <p class="muted">
            {{ windowEditable ? t.campaign.rulesEditor.intro : t.campaign.rulesEditor.fixed }}
          </p>
          <p v-if="categories.length === 0">
            {{ t.campaign.rulesEditor.noCategories }}
            <RouterLink to="/verwaltung/kategorien">
              {{ t.common.page.categories }}
            </RouterLink>
          </p>
          <p
            v-else-if="rules.length === 0"
            class="muted"
          >
            {{ t.campaign.rulesEditor.none }}
          </p>
          <fieldset
            v-for="(rule, index) in rules"
            :key="index"
            class="panel"
          >
            <legend>{{ t.campaign.rulesEditor.rule(index + 1) }}</legend>
            <div class="row">
              <p class="field">
                <label :for="`rule-${index}-category`">{{ t.rules.category }}</label>
                <select
                  :id="`rule-${index}-category`"
                  v-model="rule.categoryId"
                  required
                >
                  <option
                    v-for="c in categories"
                    :key="c.id"
                    :value="c.id"
                  >
                    {{ c.name }}
                  </option>
                </select>
              </p>
              <p class="field">
                <label :for="`rule-${index}-unit`">{{ t.campaign.rulesEditor.unit }}</label>
                <select
                  :id="`rule-${index}-unit`"
                  v-model="rule.unit"
                >
                  <option
                    v-for="unit in RULE_UNITS"
                    :key="unit"
                    :value="unit"
                  >
                    {{ RULE_UNIT_LABELS[unit] }}
                  </option>
                </select>
              </p>
              <p class="field">
                <label :for="`rule-${index}-minimum`">{{ t.campaign.rulesEditor.minimum }}</label>
                <input
                  :id="`rule-${index}-minimum`"
                  v-model.number="rule.minimum"
                  type="number"
                  min="1"
                  :max="RULE_LIMITS[rule.unit]"
                  required
                >
              </p>
            </div>
            <fieldset class="field">
              <legend>{{ t.campaign.rulesEditor.grades }}</legend>
              <label
                v-for="grade in ruleGrades"
                :key="grade"
              >
                <input
                  v-model="rule.grades"
                  type="checkbox"
                  :value="grade"
                >
                {{ t.common.gradeOrdinal(grade) }}
              </label>
            </fieldset>
            <p class="field">
              <label :for="`rule-${index}-classes`">{{ t.campaign.rulesEditor.classes }}</label>
              <input
                :id="`rule-${index}-classes`"
                v-model="rule.classes"
                :placeholder="t.campaign.rulesEditor.classesExample"
                maxlength="400"
              >
            </p>
            <p>
              <button
                type="button"
                class="ghost"
                @click="rules.splice(index, 1)"
              >
                {{ t.campaign.rulesEditor.remove }}
              </button>
            </p>
          </fieldset>
          <p v-if="categories.length > 0">
            <button
              type="button"
              class="ghost"
              :disabled="rules.length >= MAX_RULES"
              @click="addRule"
            >
              {{ t.campaign.rulesEditor.add }}
            </button>
          </p>
          <ul
            v-if="ruleProblems.length > 0"
            role="alert"
            class="alert"
          >
            <li
              v-for="problem in ruleProblems"
              :key="problem"
            >
              {{ problem }}
            </li>
          </ul>
        </fieldset>
        <p class="actions">
          <button
            type="submit"
            :disabled="action.busy.value"
          >
            {{ t.common.save }}
          </button>
          <button
            type="button"
            class="ghost"
            @click="editing = false"
          >
            {{ t.common.cancel }}
          </button>
        </p>
      </form>
    </section>

    <section v-if="isStudent && published">
      <h2>{{ resultsOut ? t.common.page.result : t.common.page.wishes }}</h2>
      <p class="actions">
        <RouterLink
          v-if="resultsOut"
          class="button"
          :to="`/wahlen/${campaign.id}/ergebnis`"
        >
          {{ t.campaign.student.viewResult }}
        </RouterLink>
        <RouterLink
          :class="resultsOut ? 'button ghost-link' : 'button'"
          :to="`/wahlen/${campaign.id}/wuensche`"
        >
          {{ resultsOut ? t.common.page.wishes : windowOpened ? t.campaign.student.giveWishes : t.campaign.student.offered }}
        </RouterLink>
      </p>
    </section>

    <section v-if="organizes && windowOpened">
      <h2>{{ t.campaign.missing.heading }}</h2>
      <p
        v-if="missingLoading.error.value"
        role="alert"
        class="alert"
      >
        {{ missingLoading.error.value }}
      </p>
      <p class="muted">
        {{ t.campaign.missing.summary(missing.length, missingCount) }}
      </p>
      <p class="actions">
        <a
          class="button ghost-link"
          :href="withBase(missingExportPath(campaign.id))"
        >{{ t.campaign.missing.export }}</a>
      </p>
      <table
        v-if="missing.length > 0"
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              {{ t.common.field.className }}
            </th>
            <th scope="col">
              {{ t.common.field.name }}
            </th>
            <th scope="col">
              {{ t.common.field.state }}
            </th>
            <th scope="col">
              {{ t.campaign.missing.mails }}
            </th>
            <th scope="col">
              <span class="visually-hidden">{{ t.common.field.actions }}</span>
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
                {{ t.campaign.missing.enter }}
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="view.may.seeDemand && demand.length > 0">
      <h2>{{ t.campaign.demand.heading }}</h2>
      <p class="muted">
        {{ t.campaign.demand.intro(campaign.placeHeadroomPercent) }}
      </p>
      <table class="table">
        <thead>
          <tr>
            <th scope="col">
              {{ t.common.field.day }}
            </th>
            <th
              v-for="grade in demandGrades"
              :key="grade"
              scope="col"
            >
              {{ t.common.gradeOrdinal(grade) }}
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
              :class="{ short: shortOf(day, grade) > 0 }"
            >
              <template v-if="demandOf(day, grade)">
                {{ demandText(day, grade) }}
                <template v-if="shortOf(day, grade) > 0">
                  <br>{{ t.campaign.demand.short(shortOf(day, grade)) }}
                </template>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <template v-if="ruleDemand.length > 0">
        <p class="muted">
          {{ t.campaign.demand.rulesIntro }}
        </p>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">
                {{ t.rules.rule }}
              </th>
              <th scope="col">
                {{ t.common.field.grade }}
              </th>
              <th scope="col">
                {{ t.common.field.students }}
              </th>
              <th scope="col">
                {{ t.campaign.demand.needed }}
              </th>
              <th scope="col">
                {{ t.campaign.demand.offered }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in ruleDemand"
              :key="`${d.ruleId}-${d.grade}`"
            >
              <td>{{ ruleAsks(d.ruleId) }}</td>
              <td>{{ d.grade }}.</td>
              <td>{{ d.students }}</td>
              <td>{{ ruleAmount(d.ruleId, d.needed) }}</td>
              <td :class="{ short: d.offered < d.needed }">
                {{ ruleAmount(d.ruleId, d.offered) }}
                <template v-if="d.offered < d.needed">
                  <br>{{ t.campaign.demand.ruleShort }}
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>

    <section>
      <h2>{{ t.campaign.items.heading }}</h2>
      <p class="actions">
        <RouterLink
          v-if="view.may.propose"
          class="button"
          :to="`/wahlen/${campaign.id}/aktivitaet/neu`"
        >
          {{ t.common.page.newItem }}
        </RouterLink>
        <RouterLink
          v-if="teaches && campaign.state === 'catalogue'"
          class="button ghost-link"
          to="/verfuegbarkeit"
        >
          {{ t.availability.link }}
        </RouterLink>
        <RouterLink
          v-if="published || organizes"
          class="button ghost-link"
          :to="`/wahlen/${campaign.id}/katalog`"
        >
          {{ t.campaign.items.viewCatalogue }}
        </RouterLink>
      </p>
      <p v-if="items.length === 0">
        {{ t.campaign.items.none }}
      </p>
      <table
        v-else
        class="table"
      >
        <thead>
          <tr>
            <th scope="col">
              {{ t.common.field.number }}
            </th>
            <th scope="col">
              {{ t.common.field.item }}
            </th>
            <th scope="col">
              {{ t.common.field.teachers }}
            </th>
            <th scope="col">
              {{ t.common.field.sessions }}
            </th>
            <th scope="col">
              {{ t.common.field.places }}
            </th>
            <th scope="col">
              {{ t.common.field.state }}
            </th>
            <th scope="col">
              <span class="visually-hidden">{{ t.common.field.actions }}</span>
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
              > · {{ t.campaign.items.fixedFor(item.fixedClasses.join(', ')) }}</span>
              <span
                v-if="item.feeCents > 0"
                class="muted"
              > · {{ formatFee(item.feeCents) }}</span>
              <p
                v-if="item.reviewNote && (own(item) || organizes)"
                class="muted"
              >
                {{ t.campaign.items.reviewNote(item.reviewNote) }}
              </p>
            </td>
            <td>{{ item.teachers.map((teacher) => teacher.displayName).join(', ') }}</td>
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
                {{ t.common.edit }}
              </RouterLink>
              <RouterLink
                v-if="own(item) && !organizes && resultsOut && item.state !== 'withdrawn'"
                class="button ghost-link small"
                :to="`/wahlen/${campaign.id}/aktivitaet/${item.id}`"
              >
                {{ t.campaign.items.participants }}
              </RouterLink>
              <button
                v-if="own(item) && item.state === 'draft' && campaign.state === 'catalogue'"
                type="button"
                class="ghost"
                @click="act(() => proposeItem(item.id), t.campaign.items.proposed)"
              >
                {{ t.campaign.items.propose }}
              </button>
              <button
                v-if="own(item) && item.state === 'proposed' && campaign.state === 'catalogue' && !organizes"
                type="button"
                class="ghost"
                @click="act(() => unproposeItem(item.id))"
              >
                {{ t.campaign.items.unpropose }}
              </button>
              <button
                v-if="own(item) && item.state === 'draft'"
                type="button"
                class="ghost"
                @click="act(() => deleteItem(item.id), t.campaign.items.deleted)"
              >
                {{ t.campaign.items.delete }}
              </button>
              <button
                v-if="organizes && item.state === 'proposed'"
                type="button"
                @click="act(() => approveItem(item.id), t.campaign.items.approved)"
              >
                {{ t.campaign.items.approve }}
              </button>
              <button
                v-if="organizes && campaign.state === 'catalogue' && (item.state === 'proposed' || item.state === 'approved')"
                type="button"
                class="ghost"
                @click="ask(item, 'return')"
              >
                {{ t.campaign.items.return }}
              </button>
              <button
                v-if="organizes && item.state !== 'withdrawn' && !(own(item) && item.state === 'draft')"
                type="button"
                class="ghost"
                @click="ask(item, 'withdraw')"
              >
                {{ t.campaign.items.withdraw }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <form
        v-if="pending"
        class="panel"
        :aria-label="pending.kind === 'return' ? t.campaign.pending.returnTitle(pending.item.title) : t.campaign.pending.withdrawTitle(pending.item.title)"
        @submit.prevent="onSubmitPending"
      >
        <h3>{{ pending.kind === 'return' ? t.campaign.pending.returnTitle(pending.item.title) : t.campaign.pending.withdrawTitle(pending.item.title) }}</h3>
        <p class="field">
          <label for="pending-text">{{ pending.kind === 'return' ? t.campaign.pending.returnNote : t.common.field.reason }}</label>
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
            {{ pending.kind === 'return' ? t.campaign.items.return : t.campaign.items.withdraw }}
          </button>
          <button
            type="button"
            class="ghost"
            @click="pending = null"
          >
            {{ t.common.cancel }}
          </button>
        </p>
      </form>
    </section>
  </template>
</template>
