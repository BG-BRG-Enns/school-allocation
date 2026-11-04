<script setup lang="ts">
// One campaign: its state and days, the activities as far as the person
// may see them, and what they may do: teachers propose and tend their own,
// organizers review, move the campaign on, set its rules and export the
// catalogue.

import { classConflicts, ITEM_STATES, MAX_RULES, RULE_LIMITS, RULE_UNITS, type Frame, type Period } from '@school-allocation/school-core'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ClassPicker from '../components/ClassPicker.vue'
import Collapsible from '../components/Collapsible.vue'
import DemandTable from '../components/DemandTable.vue'
import FrameSelect from '../components/FrameSelect.vue'
import ListFilter from '../components/ListFilter.vue'
import { loadClasses as loadRosterClasses, loadMailQueue, loadMailStatus, loadPeriods } from '../lib/admin-api.ts'
import { approveItem, catalogueExportPath, deleteCampaign, deleteItem, loadCampaign, loadCampaignAvailability, loadCategories, loadClasses, loadDemand, loadItems, loadMissing as loadMissingList, loadPlanning, missingExportPath, proposeItem, returnItem, transitionCampaign, unproposeItem, updateCampaign, withdrawItem, type CampaignChanges, type CampaignRule, type CampaignView, type Category, type DayDemand, type Item, type ItemShare, type MissingStudent, type PlanningResponse, type RuleDemand, type RuleUnit } from '../lib/campaigns-api.ts'
import { ApiError } from '../lib/api-rules.ts'
import { withBase } from '../lib/base.ts'
import { useFeedback } from '../lib/feedback.ts'
import { datesBetween, formatDay, formatFee, formatSpan, formatWhenShort, instantInSchoolZone, localDateOf, localTimeOf, nextDay } from '../lib/format.ts'
import { bringsText, daysOf, offerOf } from '../lib/offer-cells.ts'
import { useUiState } from '../lib/ui-state.ts'
import { t } from '../lib/i18n.ts'
import { CAMPAIGN_STATE_LABELS, CHOICE_STATE_LABELS, ITEM_STATE_LABELS, MAIL_KIND_LABELS, MAIL_STATE_LABELS, RULE_PROBLEM_LABELS, RULE_UNIT_LABELS, WINDOW_LABELS } from '../lib/labels.ts'
import { filtered, matchesOneOf, matchesOption, matchesText, useListFilter, type FilterField } from '../lib/list-filter.ts'
import { usePageTitle } from '../lib/page-title.ts'
import { session } from '../lib/session.ts'

const props = defineProps<{ id: string }>()
const view = ref<CampaignView | null>(null)
const items = ref<Item[]>([])
const demand = ref<DayDemand[]>([])
const ruleDemand = ref<RuleDemand[]>([])
/** Per activity where its places go (organizers), for the "bringt" line of the table. */
const shares = ref<ItemShare[]>([])
/** The teachers not plainly available on the registration's days, for the lead's marker in the table. */
const limited = ref<{ personId: string, date: string, status: 'unavailable' | 'if_needed' }[]>([])
/** The classes taking part, with their grades, for those who see the demand. */
const memberClasses = ref<{ className: string, grade: number }[]>([])
const grades = computed(() => [...new Set(memberClasses.value.map((cl) => cl.grade))].sort((a, b) => a - b))
/** The classes of the class lists in force, for the organizer's picker and the line naming those not in. */
const rosterClasses = ref<{ className: string, grade: number }[]>([])
/** The school's categories, to name the rules by. */
const categories = ref<Category[]>([])
/** The school's period grid, for the attendance frames of the project days. */
const grid = ref<Period[]>([])
const loading = useFeedback()
const action = useFeedback()
usePageTitle(() => view.value?.campaign.name ?? t.campaign.title)

async function load(): Promise<void> {
  await loading.run(async () => {
    const [v, list] = await Promise.all([loadCampaign(props.id), loadItems(props.id)])
    view.value = v
    items.value = list.items
    // The rest at once: a request still on its way when the person signs out is answered 401.
    const [d, c, a, roster, periods, school] = await Promise.all([
      v.may.seeDemand ? loadDemand(props.id) : null,
      v.may.seeDemand ? loadClasses(props.id) : null,
      v.may.seeDemand ? loadCampaignAvailability(props.id) : null,
      v.may.organize ? loadRosterClasses() : null,
      v.may.organize ? loadPeriods() : null,
      v.may.organize || v.campaign.rules.length > 0 ? loadCategories() : null,
    ])
    if (d) {
      demand.value = d.demand
      ruleDemand.value = d.rules
      shares.value = d.shares
    }
    if (c) memberClasses.value = c.classes
    if (a) limited.value = a.limited
    if (roster) rosterClasses.value = roster.classes.map((cl) => ({ className: cl.className, grade: cl.grade }))
    if (periods) grid.value = periods.periods
    if (school) categories.value = school.categories
  })
}
onMounted(load)
watch(() => props.id, load)

const campaign = computed(() => view.value?.campaign)
/** "7 Klassen, Schulstufen 5–11": the grades where the member classes are known with theirs. */
const classSummary = computed(() => {
  const c = campaign.value
  if (!c) return ''
  const known = memberClasses.value.length > 0 ? memberClasses.value : rosterClasses.value.filter((cl) => c.classes.includes(cl.className))
  const range = known.length === c.classes.length && known.length > 0 ? [Math.min(...known.map((cl) => cl.grade)), Math.max(...known.map((cl) => cl.grade))] as [number, number] : null
  return t.campaigns.classes.summary(c.classes.length, range)
})
/** The classes of the class lists in force that are not in: a class imported since, or one taken out. */
const notTakingPart = computed(() => rosterClasses.value.map((cl) => cl.className).filter((name) => !(campaign.value?.classes ?? []).includes(name)))
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
// The status list filtered by class, completeness and name; the browser keeps the filter across pages.
const statusFilter = useListFilter('wahl:status', { className: '', incomplete: false, text: '' })
const statusFields = computed<FilterField[]>(() => [
  { key: 'className', kind: 'select', label: t.filters.className, options: [...new Set(missing.value.map((s) => s.className))].sort((a, b) => a.localeCompare(b, 'de')).map((name) => ({ value: name, label: name })) },
  { key: 'incomplete', kind: 'check', label: t.filters.onlyIncomplete },
  { key: 'text', kind: 'text', label: t.filters.text },
])
const missingShown = filtered(missing, statusFilter, (s, f) => matchesOption(s.className, f.className) && (f.incomplete !== true || s.state !== 'complete') && matchesText([s.displayName], f.text))
// The activities filtered by state, category and text (title or teacher).
const itemFilter = useListFilter('wahl:items', { state: '', category: '', companionsMissing: false, text: '' })
const itemFields = computed<FilterField[]>(() => [
  { key: 'state', kind: 'select', label: t.filters.state, options: ITEM_STATES.map((state) => ({ value: state, label: ITEM_STATE_LABELS[state] ?? state })) },
  ...(categories.value.length > 0 ? [{ key: 'category', kind: 'select' as const, label: t.filters.category, options: categories.value.map((c) => ({ value: c.id, label: c.name })) }] : []),
  // The companions are counted from the teachers, which students may not see: staff alone filter by them.
  ...(teaches.value || organizes.value ? [{ key: 'companionsMissing', kind: 'check' as const, label: t.filters.onlyCompanionsMissing }] : []),
  { key: 'text', kind: 'text', label: t.filters.text },
])
/** How many companions an activity still seeks: the number its lead wants less the teachers beside the lead. */
const soughtOf = (item: Item): number => Math.max(0, item.companionsWanted - item.teachers.filter((teacher) => !teacher.lead).length)
const itemsShown = filtered(items, itemFilter, (item, f) => matchesOption(item.state, f.state) && matchesOneOf(item.categoryIds, f.category) && (!f.companionsMissing || soughtOf(item) > 0) && matchesText([item.title, ...item.teachers.map((teacher) => teacher.displayName)], f.text))
// The order: as the catalogue numbers them (the server's), or by the first submission, the earliest first and the never submitted last; the browser remembers it.
const itemOrder = useUiState<string>('wahl:items:order', 'number')
const itemsOrdered = computed(() => itemOrder.value === 'proposed'
  ? [...itemsShown.value].sort((a, b) => (a.firstProposedAt ?? '\uffff').localeCompare(b.firstProposedAt ?? '\uffff', 'en') || a.createdAt.localeCompare(b.createdAt, 'en'))
  : itemsShown.value)

/** The grades an activity is offered to, as the table says them: its grades, else the grades of its classes (the class names where the page does not know them), else "alle". */
function gradesText(item: Item): string {
  if (item.eligibleGrades.length > 0) return item.eligibleGrades.map((grade) => `${grade}.`).join(', ')
  if (item.eligibleClasses.length > 0) {
    const grades = [...new Set(item.eligibleClasses.map((name) => memberClasses.value.find((c) => c.className === name)?.grade).filter((grade): grade is number => grade !== undefined))].sort((a, b) => a - b)
    const known = item.eligibleClasses.every((name) => memberClasses.value.some((c) => c.className === name))
    return known ? grades.map((grade) => `${grade}.`).join(', ') : item.eligibleClasses.join(', ')
  }
  return t.campaign.items.allGrades
}

/** The teachers as "Leitung: X · Begleitung: Y, Z", and, where the lead wants companions, "Begleitung 1 von 2". */
function teachersText(item: Item): string {
  const lead = item.teachers.find((teacher) => teacher.lead)
  const companions = item.teachers.filter((teacher) => !teacher.lead).map((teacher) => teacher.displayName)
  return [
    ...(lead ? [t.item.participants.lead(lead.displayName)] : []),
    ...(companions.length > 0 ? [t.item.participants.companions(companions.join(', '))] : []),
    ...(item.companionsWanted > 0 && (teaches.value || organizes.value) ? [t.campaign.items.companionsOf(companions.length, item.companionsWanted)] : []),
  ].join(' · ')
}

/** The days of the activity its lead is not plainly available on, as a line; '' when none. */
function leadLimitedText(item: Item): string {
  const lead = item.teachers.find((teacher) => teacher.lead)
  if (!lead) return ''
  const dates = new Set(item.sessions.flatMap((s) => datesBetween(localDateOf(s.startsAt), localDateOf(new Date(Date.parse(s.endsAt) - 1).toISOString()))))
  const days = limited.value.filter((d) => d.personId === lead.personId && dates.has(d.date)).map((d) => d.date).sort((a, b) => a.localeCompare(b, 'en'))
  return days.length === 0 ? '' : t.campaign.items.leadLimited(days.map(formatDay).join(', '))
}

/** What a submitted activity brings (organizers, who have the shares): the cells short of the target its places go to; '' where there is nothing to say. */
const bringsOf = computed(() => {
  const c = campaign.value
  if (!c || !organizes.value || demand.value.length === 0 || grid.value.length === 0) return new Map<string, string>()
  const days = daysOf(demand.value, grid.value)
  const classes = memberClasses.value.map((cl) => ({ ...cl, students: 0 }))
  return new Map(items.value.filter((item) => item.state === 'proposed' && item.places > 0).map((item) => [item.id, bringsText({ id: item.id, ...offerOf(item) }, demand.value, days, classes, shares.value, c.placeHeadroomPercent) ?? '']))
})

/** Class activities that put a class into two at once, among the approved ones: what the publication warns of. */
const approvedConflicts = computed(() => {
  const activities = items.value.filter((item) => item.state === 'approved' && item.fixedClasses.length > 0).map((item) => ({ id: item.id, ...offerOf(item) }))
  const titles = new Map(items.value.map((item) => [item.id, item.title]))
  // Each pair once, the earlier one as the candidate, so the line names the two activities that meet, whatever else overlaps them.
  return [...new Set(activities.flatMap((candidate, index) => classConflicts(candidate, activities.slice(index + 1)).map((c) => `${c.className}: ${titles.get(candidate.id) ?? ''}, ${titles.get(c.itemId) ?? ''}`)))]
})

// The registration's mails still waiting to be sent: a link to the mails page, where they can be looked at or discarded.
const mailsWaiting = ref(0)
async function loadMailsWaiting(): Promise<void> {
  if (!organizes.value) return
  mailsWaiting.value = (await loadMailQueue({ campaignId: props.id, state: 'queued', limit: '1' })).total
}
watch(view, () => {
  void loadMailsWaiting().catch(() => {
    mailsWaiting.value = 0
  })
})

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
/** Whether the caller leads the activity: the form lets them change its companions once it is submitted or approved. */
function leads(item: Item): boolean {
  const me = session.value?.person?.id
  return me !== undefined && item.teachers.some((t) => t.lead && t.personId === me)
}

// Organizer's settings.
const editing = ref(false)
const name = ref('')
const schoolYear = ref('')
const days = ref<string[]>([])
/** The attendance frame per project day, beside `days` by index; null for none. */
const frames = ref<(Frame | null)[]>([])
const classesDraft = ref<string[]>([])
/** Why the classes were refused: an activity or a rule still names the ones taken out. */
const classProblem = ref('')
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
const lockNewOffers = ref(false)
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
  frames.value = c.days.map((day) => day.frame)
  classesDraft.value = [...c.classes]
  classProblem.value = ''
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
  lockNewOffers.value = c.lockNewOffers
  rules.value = c.rules.map((rule) => ({ categoryId: rule.categoryId, grades: [...rule.grades], classes: rule.classes.join(', '), unit: rule.unit, minimum: rule.minimum }))
  ruleProblems.value = []
  editing.value = true
}
async function onSaveSettings(): Promise<void> {
  ruleProblems.value = []
  classProblem.value = ''
  const ok = await action.run(async () => {
    const changes: CampaignChanges = { name: name.value.trim(), schoolYear: schoolYear.value.trim(), projectDays: days.value.filter(Boolean) }
    if (setUpEditable.value) changes.classes = classesDraft.value
    if (windowEditable.value) {
      changes.opensAt = instantOrNull(opensAt.value)
      changes.closesAt = instantOrNull(closesAt.value)
      changes.lateUntil = instantOrNull(lateUntil.value)
      changes.wishesPerGroup = Number(wishesPerGroup.value)
      changes.showTeachers = showTeachers.value
      changes.placeHeadroomPercent = Number(placeHeadroomPercent.value)
      changes.lockNewOffers = lockNewOffers.value
      changes.frames = Object.fromEntries(days.value.flatMap((day, index) => (day && frames.value[index] ? [[day, frames.value[index]]] : [])))
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
      if (err instanceof ApiError && err.code === 'class_in_use' && Array.isArray(err.body.classes)) {
        classProblem.value = t.campaigns.classes.inUse((err.body.classes as string[]).join(', '))
      }
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
// A step by hand: asked on the page with what it does and whether there is a way back, then taken. The deletion of a
// registration in preparation is a step like the others.
type Step = 'draft' | 'catalogue' | 'published' | 'open' | 'closed' | 'archived' | 'delete'
const router = useRouter()
const stepPending = ref<Step | null>(null)
const noEndAcknowledged = ref(false)
const mailEnabled = ref(true)

/** The step's name, as its button says it; the way back to catalogue has its own. */
function stepLabel(step: Step): string {
  const o = t.campaign.organization
  if (step === 'draft') return o.backToDraft
  if (step === 'catalogue') return campaign.value?.state === 'published' ? o.backToCatalogue : o.collect
  if (step === 'published') return o.publish
  if (step === 'open') return o.open
  if (step === 'closed') return o.close
  if (step === 'archived') return o.archive
  return o.delete
}

async function startStep(step: Step): Promise<void> {
  noEndAcknowledged.value = false
  // The mail server's absence is worth a line before the opening: the invitations would wait. Asked before the form shows,
  // so a quick click cannot confirm without the line.
  if (step === 'open') {
    try {
      mailEnabled.value = (await loadMailStatus()).mailEnabled
    } catch {
      mailEnabled.value = true
    }
  }
  stepPending.value = step
}

/** What the step does and what the registration's state adds to it. */
const consequences = computed<string[]>(() => {
  const step = stepPending.value
  const c = campaign.value
  if (step === null || !c) return []
  const key = step === 'catalogue' && c.state === 'published' ? 'backToCatalogue' : step
  const lines = [...t.campaign.transitions.consequences[key]]
  const w = t.campaign.transitions.warnings
  if ((step === 'published' || step === 'open') && c.classes.length === 0) lines.push(w.noClasses)
  if (step === 'published') {
    if ((view.value?.counts?.approved ?? 0) === 0) lines.push(w.noApproved)
    if (approvedConflicts.value.length > 0) lines.push(w.classConflicts(approvedConflicts.value.join('; ')))
    if (c.opensAt !== null && Date.parse(c.opensAt) <= Date.now()) lines.push(w.opensAtPast(formatWhenShort(c.opensAt)))
  }
  if (step === 'open') {
    if (c.closesAt === null) lines.push(w.noEnd)
    if (!mailEnabled.value) lines.push(w.mailOff)
  }
  return lines
})
/** Opening without an end is taken only with the box ticked. */
const needsNoEndAck = computed(() => stepPending.value === 'open' && campaign.value?.closesAt === null)

async function confirmStep(): Promise<void> {
  const step = stepPending.value
  if (step === null || (needsNoEndAck.value && !noEndAcknowledged.value)) return
  if (step === 'delete') {
    const ok = await action.run(async () => {
      await deleteCampaign(props.id)
    })
    if (ok) await router.push('/wahlen')
    return
  }
  const ok = await action.run(async () => {
    await transitionCampaign(props.id, step)
  })
  stepPending.value = null
  if (ok) await load()
}

// Item actions, with a reason or note where one is required.
type Pending = { item: Item, kind: 'return' | 'withdraw' } | null
const pending = ref<Pending>(null)
const text = ref('')
/** The planning, loaded once an item is to be returned or withdrawn: whether its lead would then lead nothing in this registration. Read anew after every reload of the page: a transition changes which activities count. */
const planningData = ref<PlanningResponse | null>(null)
watch(view, () => {
  planningData.value = null
})
function ask(item: Item, kind: 'return' | 'withdraw'): void {
  pending.value = { item, kind }
  text.value = ''
  if (planningData.value === null) {
    void loadPlanning(props.id).then((p) => {
      planningData.value = p
    }).catch(() => {
      planningData.value = null
    })
  }
}
/** The lead's only activity that may still take place, and a duty to lead: a note on the form, no bar (for a lead without the duty, nothing). */
const leadsNothingAfter = computed(() => {
  const p = pending.value
  const lead = p?.item.teachers.find((teacher) => teacher.lead)
  const row = lead ? planningData.value?.teachers.find((teacher) => teacher.personId === lead.personId) : undefined
  if (!p || !lead || !row || !row.leadDuty) return ''
  const others = row.days.some((day) => day.leads.some((led) => led.id !== p.item.id))
  return others ? '' : t.campaign.pending.leadsNothing(row.shortName ?? lead.displayName)
})
async function act(fn: () => Promise<unknown>, done?: string): Promise<void> {
  const ok = await action.run(async () => {
    await fn()
  }, done)
  if (ok) {
    pending.value = null
    // The planning read for the note is of before the change: the next question loads it anew.
    planningData.value = null
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
      · {{ classSummary }}
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
        v-if="notTakingPart.length > 0"
        class="muted"
      >
        {{ t.campaigns.classes.notTakingPart(notTakingPart.join(', ')) }}
      </p>
      <p v-if="mailsWaiting > 0">
        <RouterLink :to="{ path: '/verwaltung/e-mails', query: { campaign: campaign.id } }">
          {{ t.campaign.organization.mailsWaiting(mailsWaiting) }}
        </RouterLink>
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
      <form
        v-if="stepPending"
        class="panel"
        :aria-label="t.campaign.transitions.confirm"
        @submit.prevent="confirmStep"
      >
        <h3>{{ stepLabel(stepPending) }}</h3>
        <ul>
          <li
            v-for="line in consequences"
            :key="line"
          >
            {{ line }}
          </li>
        </ul>
        <label
          v-if="needsNoEndAck"
          class="checks"
        >
          <input
            v-model="noEndAcknowledged"
            type="checkbox"
          >
          {{ t.campaign.transitions.warnings.noEndAck }}
        </label>
        <p class="actions">
          <button
            type="submit"
            :disabled="action.busy.value || (needsNoEndAck && !noEndAcknowledged)"
          >
            {{ t.campaign.transitions.submit(stepLabel(stepPending)) }}
          </button>
          <button
            type="button"
            class="ghost"
            @click="stepPending = null"
          >
            {{ t.common.cancel }}
          </button>
        </p>
      </form>
      <p class="actions">
        <button
          v-if="campaign.state === 'draft'"
          type="button"
          :disabled="action.busy.value"
          @click="startStep('catalogue')"
        >
          {{ t.campaign.organization.collect }}
        </button>
        <button
          v-if="campaign.state === 'catalogue'"
          type="button"
          :disabled="action.busy.value"
          @click="startStep('published')"
        >
          {{ t.campaign.organization.publish }}
        </button>
        <button
          v-if="campaign.state === 'published'"
          type="button"
          :disabled="action.busy.value"
          @click="startStep('open')"
        >
          {{ t.campaign.organization.open }}
        </button>
        <button
          v-if="campaign.state === 'results'"
          type="button"
          class="ghost"
          :disabled="action.busy.value"
          @click="startStep('archived')"
        >
          {{ t.campaign.organization.archive }}
        </button>
        <button
          v-if="campaign.state === 'open' || campaign.state === 'grace'"
          type="button"
          class="ghost"
          :disabled="action.busy.value"
          @click="startStep('closed')"
        >
          {{ t.campaign.organization.close }}
        </button>
        <button
          v-if="campaign.state === 'catalogue'"
          type="button"
          class="ghost"
          :disabled="action.busy.value"
          @click="startStep('draft')"
        >
          {{ t.campaign.organization.backToDraft }}
        </button>
        <button
          v-if="campaign.state === 'published'"
          type="button"
          class="ghost"
          :disabled="action.busy.value"
          @click="startStep('catalogue')"
        >
          {{ t.campaign.organization.backToCatalogue }}
        </button>
        <button
          v-if="campaign.state === 'draft'"
          type="button"
          class="ghost"
          :disabled="action.busy.value"
          @click="startStep('delete')"
        >
          {{ t.campaign.organization.delete }}
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
        <fieldset class="field">
          <legend>{{ t.campaign.projectDays }}</legend>
          <p class="muted">
            {{ t.campaign.settings.frameHint }}
          </p>
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
              :disabled="!setUpEditable"
            >
            <span
              v-if="days[index]"
              class="muted"
            >{{ formatDay(days[index]) }}</span>
            <FrameSelect
              :model-value="frames[index] ?? null"
              :grid="grid"
              :day="index + 1"
              :disabled="!windowEditable"
              @update:model-value="frames[index] = $event"
            />
            <button
              v-if="days.length > 1 && setUpEditable"
              type="button"
              class="ghost"
              @click="days.splice(index, 1); frames.splice(index, 1)"
            >
              {{ t.common.remove }}
            </button>
          </p>
          <p v-if="setUpEditable">
            <button
              type="button"
              class="ghost"
              :disabled="days.length >= 10"
              @click="days.push(nextDay(days.at(-1) ?? '')); frames.push(null)"
            >
              {{ t.common.addDay }}
            </button>
          </p>
        </fieldset>
        <fieldset class="field">
          <legend>{{ t.campaigns.classes.legend }}</legend>
          <ClassPicker
            v-model="classesDraft"
            :options="rosterClasses"
            :disabled="!setUpEditable"
          />
          <p
            v-if="classProblem"
            role="alert"
            class="alert"
          >
            {{ classProblem }}
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
              <span
                v-if="opensAt"
                class="muted"
              >{{ formatWhenShort(instantOrNull(opensAt)) }}</span>
            </p>
            <p class="field">
              <label for="edit-closes">{{ t.campaign.settings.closes }}</label>
              <input
                id="edit-closes"
                v-model="closesAt"
                :disabled="!windowEditable"
                type="datetime-local"
              >
              <span
                v-if="closesAt"
                class="muted"
              >{{ formatWhenShort(instantOrNull(closesAt)) }}</span>
            </p>
            <p class="field">
              <label for="edit-late">{{ t.campaign.settings.lateUntil }}</label>
              <input
                id="edit-late"
                v-model="lateUntil"
                :disabled="!windowEditable"
                type="datetime-local"
              >
              <span
                v-if="lateUntil"
                class="muted"
              >{{ formatWhenShort(instantOrNull(lateUntil)) }}</span>
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
              <span
                v-if="swapFrom"
                class="muted"
              >{{ formatWhenShort(instantOrNull(swapFrom)) }}</span>
            </p>
            <p class="field">
              <label for="edit-swap-until">{{ t.campaign.settings.swapUntil }}</label>
              <input
                id="edit-swap-until"
                v-model="swapUntil"
                :disabled="!swapEditable"
                type="datetime-local"
              >
              <span
                v-if="swapUntil"
                class="muted"
              >{{ formatWhenShort(instantOrNull(swapUntil)) }}</span>
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
          <p class="field">
            <label>
              <input
                v-model="lockNewOffers"
                :disabled="!windowEditable"
                type="checkbox"
              >
              {{ t.campaign.settings.lockNewOffers }}
            </label>
            <span class="muted">{{ t.campaign.settings.lockHint }}</span>
          </p>
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
      <Collapsible
        id="wahl:status"
        :heading="t.campaign.missing.heading"
      >
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
        <ListFilter
          v-if="missing.length > 0"
          id="status"
          v-model="statusFilter"
          :fields="statusFields"
          :shown="missingShown.length"
          :total="missing.length"
        />
        <table
          v-if="missingShown.length > 0"
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
              v-for="s in missingShown"
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
      </Collapsible>
    </section>

    <section v-if="view.may.seeDemand && demand.length > 0">
      <Collapsible
        id="wahl:demand"
        :heading="t.campaign.demand.heading"
      >
        <p class="muted">
          {{ t.campaign.demand.intro(campaign.placeHeadroomPercent) }}
        </p>
        <DemandTable
          :demand="demand"
          :percent="campaign.placeHeadroomPercent"
        />
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
      </Collapsible>
    </section>

    <section>
      <Collapsible
        id="wahl:items"
        :heading="t.campaign.items.heading"
      >
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
            v-if="(teaches || organizes) && campaign.state !== 'draft' && campaign.state !== 'archived'"
            class="button ghost-link"
            :to="`/wahlen/${campaign.id}/begleitung`"
          >
            {{ t.companions.link }}
          </RouterLink>
          <RouterLink
            v-if="organizes && (view.counts?.proposed ?? 0) > 0"
            class="button"
            :to="`/wahlen/${campaign.id}/eingereichte`"
          >
            {{ t.review.link }}
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
        <ListFilter
          v-else
          id="items"
          v-model="itemFilter"
          :fields="itemFields"
          :shown="itemsShown.length"
          :total="items.length"
        />
        <p
          v-if="items.length > 0"
          class="field"
        >
          <label for="items-order">{{ t.campaign.items.order }}</label>
          <select
            id="items-order"
            v-model="itemOrder"
          >
            <option value="number">
              {{ t.campaign.items.orderNumber }}
            </option>
            <option value="proposed">
              {{ t.campaign.items.orderProposed }}
            </option>
          </select>
        </p>
        <table
          v-if="itemsShown.length > 0"
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
                {{ t.campaign.items.grades }}
              </th>
              <th scope="col">
                {{ t.common.field.teachers }}
              </th>
              <th scope="col">
                {{ t.common.field.sessions }}
              </th>
              <th scope="col">
                {{ t.campaign.items.firstProposedAt }}
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
              v-for="item in itemsOrdered"
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
                <p
                  v-if="bringsOf.get(item.id)"
                  class="muted"
                >
                  {{ bringsOf.get(item.id) }}
                </p>
              </td>
              <td>{{ gradesText(item) }}</td>
              <td>
                {{ teachersText(item) }}
                <p
                  v-if="leadLimitedText(item)"
                  class="muted short"
                >
                  {{ leadLimitedText(item) }}
                </p>
              </td>
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
              <td>{{ formatWhenShort(item.firstProposedAt) }}</td>
              <td>{{ item.places }}</td>
              <td><span :class="['badge', `badge-${item.state}`]">{{ ITEM_STATE_LABELS[item.state] ?? item.state }}</span></td>
              <td class="row-actions">
                <RouterLink
                  v-if="(own(item) && item.state === 'draft' && campaign.state === 'catalogue') || (organizes && item.state !== 'withdrawn') || (leads(item) && (item.state === 'proposed' || item.state === 'approved') && campaign.state !== 'archived')"
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
      </Collapsible>
      <form
        v-if="pending"
        class="panel"
        :aria-label="pending.kind === 'return' ? t.campaign.pending.returnTitle(pending.item.title) : t.campaign.pending.withdrawTitle(pending.item.title)"
        @submit.prevent="onSubmitPending"
      >
        <h3>{{ pending.kind === 'return' ? t.campaign.pending.returnTitle(pending.item.title) : t.campaign.pending.withdrawTitle(pending.item.title) }}</h3>
        <p
          v-if="leadsNothingAfter"
          class="notice"
        >
          {{ leadsNothingAfter }}
        </p>
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
