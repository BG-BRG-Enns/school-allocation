// The publication of a run (docs/domain-and-api.md §4, §8): the organizer
// publishes one run of a campaign in review, confirming the items it
// cancelled; the campaign moves to results and the notices go out in the
// same transaction. From then on a student reads their result with its
// explanation (and, while the swap window is open, what they could move
// into), a teacher the participants of their item, a class teacher the
// places of their class, and the organizer the workbook. Every read is of
// the run's current rows: what the changes after publication
// (assignment-changes.ts) left standing.

import { explainStudent, moveOffers, type Assignment, type StudentExplanation } from '@school-allocation/school-core'
import type { AssignmentChange } from '@school-allocation/api-contracts/publication'
import type { Actor, Caller } from '../lib/actor.ts'
import { appendAudit, lockScope } from '../lib/audit.ts'
import * as store from '../lib/dao/allocation.ts'
import { lockedCampaign, readCampaign, updateState } from '../lib/dao/campaigns.ts'
import { listCampaignItems } from '../lib/dao/items.ts'
import { campaignStudents } from '../lib/dao/choices.ts'
import { classTeachersByClass } from '../lib/dao/window.ts'
import { readSnapshot, type Database, type Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
import { schoolWords, type Words } from '../lib/i18n.ts'
import { enqueueMail } from '../lib/mail/outbox.ts'
import type { AllocationRun, StoredRun } from '../lib/models/allocation.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { CampaignStudent } from '../lib/models/choices.ts'
import type { Item } from '../lib/models/items.ts'
import type { WindowContext } from '../lib/models/window.ts'
import { isOrganizer, isOwn, isTeacher, withoutTeachers } from '../lib/policies.ts'
import { SCHOOL_TIME_ZONE } from '../lib/time.ts'
import { runReview, snapshotHash, snapshotOf } from './allocation.ts'
import { catalogueItems } from './items.ts'
import { readTemplate, renderTemplate } from './mail-templates.ts'
import { firstNameOf, formatWhen } from './window.ts'

/** The two lists name the same ids, in any order. */
function same(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a)
  const right = new Set(b)
  return left.size === right.size && [...left].every((id) => right.has(id))
}

/** The item as the notices name it: its number and title. */
export function itemLabel(item: Pick<Item, 'number' | 'title'>): string {
  return item.number === null ? item.title : `${item.number}. ${item.title}`
}

/**
 * How the notices write a student's programme, in `words`: built once for
 * the notices of one transaction, its formats then used for every student.
 */
export function programmeWriter({ t, intl }: Words) {
  const dayShort = new Intl.DateTimeFormat(intl, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit' })
  const clock = new Intl.DateTimeFormat(intl, { timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit' })
  // Two decimals and no grouping, as the notices have always written a fee.
  const amount = new Intl.NumberFormat(intl, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })

  /** The item as a line of a student's programme: its number and title, the day and the clock span of each session. */
  function line(item: Item, source: Assignment['source']): string {
    const when = item.sessions.map((s) => {
      const start = new Date(s.startsAt)
      const end = new Date(s.endsAt)
      // A trip over the night names both days.
      return dayShort.format(start) === dayShort.format(end)
        ? `${dayShort.format(start)} ${clock.format(start)} – ${clock.format(end)}`
        : `${dayShort.format(start)} ${clock.format(start)} – ${dayShort.format(end)} ${clock.format(end)}`
    }).join(', ')
    return `${when}: ${itemLabel(item)}${source === 'fixed' ? ` (${t.notices.programme.fixed})` : ''}${item.feeCents > 0 ? ` – ${t.notices.programme.fee(amount.format(item.feeCents / 100))}` : ''}`
  }

  /** The minutes a student still misses, per day, as the notices say it; empty when none. */
  function missing(explanation: StudentExplanation): string[] {
    return explanation.days.filter((d) => d.deficit > 0).map((d) => `${dayShort.format(new Date(`${d.date}T12:00:00Z`))} ${t.common.minutes(d.deficit)}`)
  }

  /** A student's programme as the notices list it: the items in the order of their first session, then what is still missing. */
  function lines(explanation: StudentExplanation, items: Map<string, Item>): string[] {
    const result = explanation.items.map((e) => ({ item: items.get(e.itemId), source: e.source })).filter((e): e is { item: Item, source: Assignment['source'] } => e.item !== undefined)
      .sort((a, b) => (a.item.sessions[0]?.startsAt ?? '').localeCompare(b.item.sessions[0]?.startsAt ?? ''))
      .map((e) => line(e.item, e.source))
    const short = missing(explanation)
    if (short.length > 0) result.push(t.notices.programme.missing(short.join(', ')))
    return result
  }

  return { missing, lines }
}

/** The swap window as the notices write it, in `words`; empty without one. */
function swapWindowText({ t, intl }: Words, campaign: Campaign): string {
  return campaign.swapFrom !== null && campaign.swapUntil !== null ? t.notices.swapWindow(formatWhen(intl, campaign.swapFrom), formatWhen(intl, campaign.swapUntil)) : ''
}

/**
 * Publishes a run: under the campaign's lock, in review, the run succeeded
 * and not stale, the cancelled items confirmed as the review showed them.
 * The campaign moves to results; every student with an address is told
 * their programme, every class teacher with a student short of minutes
 * their list, every teacher of a cancelled item the cancellation; each
 * notice once per run. Audited.
 */
export async function publishRun(db: Database, context: WindowContext, campaign: Campaign, runId: string, cancelledItemIds: readonly string[], actor: Actor): Promise<{ campaign: Campaign, run: AllocationRun, queued: number }> {
  let queued = 0
  await db.tx(async (client) => {
    await lockScope(client, campaign.id)
    const current = await lockedCampaign(client, campaign.id)
    if (!current) throw new ApplicationError('not_found')
    if (current.state !== 'review') throw new ApplicationError('campaign_state')
    const run = await store.lockRun(client, campaign.id, runId.toLowerCase())
    if (!run) throw new ApplicationError('not_found')
    if (run.status !== 'succeeded') throw new ApplicationError('run_not_publishable')
    // Ids as PostgreSQL spells them, whatever case the browser sent.
    if (!same(cancelledItemIds.map((id) => id.toLowerCase()), run.cancelledItemIds)) throw new ApplicationError('cancelled_mismatch')
    if (snapshotHash(await snapshotOf(client, current, 0, 0)) !== run.snapshotSha256) throw new ApplicationError('run_stale')
    await store.markPublished(client, run.id, actor.id)
    await updateState(client, campaign.id, 'results')
    queued = await notifyPublication(client, context, { ...current, state: 'results' }, run)
    const auditActor = { tid: actor.tid, oid: actor.oid, name: actor.name }
    await appendAudit(client, { scopeId: campaign.id, actor: auditActor, action: 'run.published', metadata: { runId: run.id, seq: run.seq, seed: run.seed, cancelled: run.cancelledItemIds.length, queued } })
    await appendAudit(client, { scopeId: campaign.id, actor: auditActor, action: 'campaign.transitioned', metadata: { campaignId: campaign.id, from: 'review', to: 'results', runId: run.id } })
  })
  const published = await requirePublished(db, campaign.id)
  const { snapshot: _snapshot, passResults: _passes, ...view } = published.run
  return { campaign: published.campaign, run: view, queued }
}

/** The notices of a publication, in the publishing transaction; returns how many were queued. */
async function notifyPublication(client: Queryable, context: WindowContext, campaign: Campaign, run: StoredRun): Promise<number> {
  // One after another on the transaction's client, in the school's language as the transaction reads it.
  const words = await schoolWords(client)
  const programme = programmeWriter(words)
  const swapWindow = swapWindowText(words, campaign)
  const students = await campaignStudents(client, campaign)
  const rows = await store.listAssignments(client, run.id)
  const items = await catalogueItems(client, campaign.id)
  const byId = new Map(items.map((item) => [item.id, item]))
  let queued = 0
  const common = (displayName: string) => ({ vorname: firstNameOf(displayName), name: displayName, wahl: campaign.name })

  const result = await readTemplate(client, 'result_published')
  const short = new Map<string, { student: CampaignStudent, missing: string[] }>()
  for (const student of students) {
    const explanation = explainStudent(run.snapshot, rows, student.personId)
    if (!explanation) continue
    const missing = programme.missing(explanation)
    if (missing.length > 0) short.set(student.personId, { student, missing })
    if (student.address === null) continue
    const { subject, body } = renderTemplate(result, { ...common(student.displayName), link: `${context.baseUrl}/wahlen/${campaign.id}/ergebnis`, zuteilung: programme.lines(explanation, byId).join('\n') || '–', tauschfenster: swapWindow })
    if (await enqueueMail(client, { kind: 'result_published', campaignId: campaign.id, personId: student.personId, to: student.address, subject, body, dedupeKey: `result_published:${campaign.id}:${student.personId}:${run.id}` })) queued += 1
  }

  if (short.size > 0) {
    const template = await readTemplate(client, 'class_unplaced')
    const teachers = await classTeachersByClass(client, campaign)
    for (const [className, list] of teachers) {
      const mine = [...short.values()].filter((s) => s.student.className === className)
      if (mine.length === 0) continue
      for (const teacher of list) {
        const { subject, body } = renderTemplate(template, { ...common(teacher.displayName), link: `${context.baseUrl}/wahlen/${campaign.id}/klasse/${encodeURIComponent(className)}`, klasse: className, liste: mine.map((s) => `- ${s.student.displayName}: ${s.missing.join(', ')}`).join('\n') })
        if (await enqueueMail(client, { kind: 'class_unplaced', campaignId: campaign.id, personId: teacher.personId, to: teacher.address, subject, body, dedupeKey: `class_unplaced:${campaign.id}:${className}:${teacher.personId}:${run.id}` })) queued += 1
      }
    }
  }

  if (run.cancelledItemIds.length > 0) {
    const template = await readTemplate(client, 'item_cancelled')
    const cancelled = run.cancelledItemIds.map((id) => byId.get(id)).filter((item): item is Item => item !== undefined)
    const addresses = await store.teacherAddresses(client, campaign.rosterBatchId, cancelled.flatMap((item) => item.teachers.map((t) => t.personId)))
    for (const item of cancelled) {
      const wished = run.snapshot.students.filter((s) => Object.values(s.ranking ?? {}).some((ids) => ids.includes(item.id))).length
      for (const teacher of item.teachers) {
        const address = addresses.get(teacher.personId)
        if (!address) continue
        const { subject, body } = renderTemplate(template, { ...common(address.displayName), link: `${context.baseUrl}/wahlen/${campaign.id}/aktivitaet/${item.id}`, aktivitaet: item.title, anmeldungen: String(wished), minimum: String(item.minParticipants) })
        if (await enqueueMail(client, { kind: 'item_cancelled', campaignId: campaign.id, personId: teacher.personId, to: address.address, subject, body, dedupeKey: `item_cancelled:${campaign.id}:${item.id}:${teacher.personId}:${run.id}` })) queued += 1
      }
    }
  }
  return queued
}

/** The campaign with its published run; `not_published` before publication. */
export async function requirePublished(db: Queryable, campaignId: string): Promise<{ campaign: Campaign, run: StoredRun }> {
  const campaign = await readCampaign(db, campaignId)
  if (!campaign) throw new ApplicationError('not_found')
  const run = await store.readPublishedRun(db, campaignId)
  if (!run) throw new ApplicationError('not_published')
  return { campaign, run }
}

/** Whether `now` is inside the campaign's swap window (D-06). */
export function swapWindowOpen(campaign: Pick<Campaign, 'state' | 'swapFrom' | 'swapUntil'>, now = Date.now()): boolean {
  return campaign.state === 'results' && campaign.swapFrom !== null && campaign.swapUntil !== null && Date.parse(campaign.swapFrom) <= now && now <= Date.parse(campaign.swapUntil)
}

/** Items nobody enters after publication: cancelled by the run, withdrawn since. */
export function unavailableItems(run: Pick<StoredRun, 'cancelledItemIds'>, items: readonly Item[]): Set<string> {
  return new Set([...run.cancelledItemIds, ...items.filter((item) => item.state !== 'approved').map((item) => item.id)])
}

/**
 * A student's own result: their places with the explanation, the items as
 * the catalogue shows them, the fee, the swap window and, while it is
 * open, what they could move into (D-13: the free places per item), and
 * their own changes since publication.
 */
export async function myResult(db: Database, campaign: Campaign, caller: Caller) {
  const personId = caller.person?.kind === 'student' ? caller.person.id : null
  if (personId === null) throw new ApplicationError('not_a_student')
  // The rows and the changes of one moment: a swap committing in between would show the move and the old place at once.
  const { run, rows, all, log } = await readSnapshot(db, async (client) => {
    const { run } = await requirePublished(client, campaign.id)
    return { run, rows: await store.listAssignments(client, run.id), all: await listCampaignItems(client, campaign.id), log: await store.listChanges(client, run.id) }
  })
  const mine = rows.filter((r) => r.personId === personId)
  const explanation = explainStudent(run.snapshot, mine, personId)
  if (!explanation) throw new ApplicationError('not_found')
  const offers = swapWindowOpen(campaign) ? moveOffers(run.snapshot, rows, personId, 'swap', unavailableItems(run, all)) : null
  const changes = log.filter((c) => c.personId === personId).map((c) => ({ kind: c.kind, toItemId: c.toItemId, leftItemIds: c.leftItemIds, changedAt: c.changedAt }))
  // Every item the page names: the places given (one withdrawn since publication still names a place given), the items
  // on offer, the items left. The fee is the run's, as the student saw it when ranking and as the workbook sums it.
  const named = new Set([...mine.map((r) => r.itemId), ...(offers ?? []).map((o) => o.itemId), ...changes.flatMap((c) => [...c.leftItemIds, ...(c.toItemId === null ? [] : [c.toItemId])])])
  const frozenFee = new Map(run.snapshot.items.map((item) => [item.id, item.feeCents]))
  const items = all.filter((item) => named.has(item.id)).map((item) => ({ ...item, feeCents: frozenFee.get(item.id) ?? item.feeCents }))
  return {
    campaign,
    run: { seq: run.seq, seed: run.seed, publishedAt: run.publishedAt ?? '' },
    explanation,
    items: campaign.showTeachers ? items : items.map(withoutTeachers),
    feeCents: items.filter((item) => mine.some((r) => r.itemId === item.id)).reduce((sum, item) => sum + item.feeCents, 0),
    swapWindow: campaign.swapFrom !== null && campaign.swapUntil !== null ? { from: campaign.swapFrom, until: campaign.swapUntil } : null,
    offers,
    changes,
  }
}

/** The participants of an item in the published run: the organizer's and the auditor's always, a teacher's for their own item. */
export async function participants(db: Database, campaign: Campaign, caller: Caller, itemId: string) {
  const items = await listCampaignItems(db, campaign.id)
  const item = items.find((i) => i.id === itemId.toLowerCase())
  if (!item) throw new ApplicationError('not_found')
  // A teacher of the item who is a teacher of the roster now: a binding outlives the roster, a proposer's account its role.
  if (!isOrganizer(caller) && !caller.roles.includes('read_only_auditor') && !(isTeacher(caller) && isOwn(caller, item))) throw new ApplicationError('forbidden')
  const { run } = await requirePublished(db, campaign.id)
  const rows = (await store.listAssignments(db, run.id)).filter((r) => r.itemId === item.id)
  const students = new Map((await campaignStudents(db, campaign)).map((s) => [s.personId, s]))
  return {
    item: { id: item.id, title: item.title, number: item.number, cancelled: run.cancelledItemIds.includes(item.id) },
    participants: rows.map((r) => ({ personId: r.personId, displayName: students.get(r.personId)?.displayName ?? '', className: students.get(r.personId)?.className ?? '', source: r.source })).sort((a, b) => a.className.localeCompare(b.className, 'de') || a.displayName.localeCompare(b.displayName, 'de')),
  }
}

export interface ClassPlacement {
  items: { itemId: string, title: string, source: string }[]
  deficit: number
  /** For a student short of minutes: the items a class teacher could place them into, full ones included so the page can say so. */
  offers: { itemId: string, title: string, number: number | null, free: number, problems: string[] }[]
}

/** Per student of a class: their items, the minutes they miss and what would fill the gap, from the published run's current rows; empty when nothing is published. */
export async function classPlacements(db: Queryable, campaign: Campaign, className: string): Promise<Map<string, ClassPlacement>> {
  const run = await store.readPublishedRun(db, campaign.id)
  if (!run) return new Map()
  const [rows, items] = await Promise.all([store.listAssignments(db, run.id), listCampaignItems(db, campaign.id)])
  const byId = new Map(items.map((item) => [item.id, item]))
  const unavailable = unavailableItems(run, items)
  const result = new Map<string, ClassPlacement>()
  for (const student of run.snapshot.students.filter((s) => s.className === className)) {
    const explanation = explainStudent(run.snapshot, rows, student.personId) as StudentExplanation
    const deficit = explanation.days.reduce((sum, d) => sum + d.deficit, 0)
    // What fits the gap as the rows stand; a full item is shown as full, one that overlaps or does not help is not shown.
    const offers = deficit === 0
      ? []
      : moveOffers(run.snapshot, rows, student.personId, 'place', unavailable)
          .filter((o) => o.problems.every((p) => p.code === 'item_full'))
          .map((o) => ({ itemId: o.itemId, title: byId.get(o.itemId)?.title ?? '', number: byId.get(o.itemId)?.number ?? null, free: o.free, problems: o.problems.map((p) => p.code) }))
    result.set(student.personId, { items: explanation.items.map((e) => ({ itemId: e.itemId, title: byId.get(e.itemId)?.title ?? '', source: e.source })), deficit, offers })
  }
  return result
}

/** The published run's review with its changes, for the assignments workbook; both read at one moment, so the sheets agree. */
export async function publishedReview(db: Database, campaignId: string, changes: (client: Queryable, campaign: Campaign) => Promise<AssignmentChange[]>) {
  return readSnapshot(db, async (client) => {
    const { campaign, run } = await requirePublished(client, campaignId)
    return { campaign, review: await runReview(client, campaign, run.id), changes: await changes(client, campaign) }
  })
}
