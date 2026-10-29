// The publication of a run (docs/domain-and-api.md §3 rule 7 is S5; §4,
// §8): the organizer publishes one run of a campaign in review, confirming
// the items it cancelled; the campaign moves to results and the notices go
// out in the same transaction. From then on a student reads their result
// with its explanation, a teacher the participants of their item, a class
// teacher the places of their class, and the organizer the workbook.

import { explainStudent, type Assignment, type StudentExplanation } from '@school-allocation/school-core'
import type { Actor, Caller } from '../lib/actor.ts'
import { appendAudit, lockScope } from '../lib/audit.ts'
import * as store from '../lib/dao/allocation.ts'
import { lockedCampaign, readCampaign, updateState } from '../lib/dao/campaigns.ts'
import { listCampaignItems } from '../lib/dao/items.ts'
import { campaignStudents } from '../lib/dao/choices.ts'
import { classTeachersByClass } from '../lib/dao/window.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError } from '../lib/errors.ts'
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

const dayShort = new Intl.DateTimeFormat('de-AT', { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit' })
const clock = new Intl.DateTimeFormat('de-AT', { timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit' })

const same = (a: readonly string[], b: readonly string[]) => [...new Set(a)].sort().join(',') === [...new Set(b)].sort().join(',')

/** The item as a line of a student's programme: its number and title, the day and the clock span of each session. */
function programmeLine(item: Item, source: Assignment['source']): string {
  const when = item.sessions.map((s) => {
    const start = new Date(s.startsAt)
    const end = new Date(s.endsAt)
    // A trip over the night names both days.
    return dayShort.format(start) === dayShort.format(end)
      ? `${dayShort.format(start)} ${clock.format(start)} – ${clock.format(end)}`
      : `${dayShort.format(start)} ${clock.format(start)} – ${dayShort.format(end)} ${clock.format(end)}`
  }).join(', ')
  const title = item.number === null ? item.title : `${item.number}. ${item.title}`
  return `${when}: ${title}${source === 'fixed' ? ' (Klasse)' : ''}${item.feeCents > 0 ? ` – Beitrag ${(item.feeCents / 100).toFixed(2).replace('.', ',')} €` : ''}`
}

function swapWindowText(campaign: Campaign): string {
  return campaign.swapFrom !== null && campaign.swapUntil !== null ? `${formatWhen(campaign.swapFrom)} bis ${formatWhen(campaign.swapUntil)}` : ''
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
    if (!same(cancelledItemIds, run.cancelledItemIds)) throw new ApplicationError('cancelled_mismatch')
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
  // One after another on the transaction's client.
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
    const missing = explanation.days.filter((d) => d.deficit > 0).map((d) => `${dayShort.format(new Date(`${d.date}T12:00:00Z`))} ${d.deficit} min`)
    if (missing.length > 0) short.set(student.personId, { student, missing })
    if (student.address === null) continue
    const lines = explanation.items.map((e) => ({ item: byId.get(e.itemId), source: e.source })).filter((e): e is { item: Item, source: Assignment['source'] } => e.item !== undefined)
      .sort((a, b) => (a.item.sessions[0]?.startsAt ?? '').localeCompare(b.item.sessions[0]?.startsAt ?? ''))
      .map((e) => programmeLine(e.item, e.source))
    if (missing.length > 0) lines.push(`Noch ohne Platz: ${missing.join(', ')} – dein Klassenvorstand teilt dich zu.`)
    const { subject, body } = renderTemplate(result, { ...common(student.displayName), link: `${context.baseUrl}/wahlen/${campaign.id}/ergebnis`, zuteilung: lines.join('\n') || '–', tauschfenster: swapWindowText(campaign) })
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

/** A student's own result: their places with the explanation, the items as the catalogue shows them, the fee, the swap window. */
export async function myResult(db: Database, campaign: Campaign, caller: Caller) {
  const personId = caller.person?.kind === 'student' ? caller.person.id : null
  if (personId === null) throw new ApplicationError('not_a_student')
  const { run } = await requirePublished(db, campaign.id)
  const rows = (await store.listAssignments(db, run.id)).filter((r) => r.personId === personId)
  const explanation = explainStudent(run.snapshot, rows, personId)
  if (!explanation) throw new ApplicationError('not_found')
  // Every item the campaign had: one withdrawn since publication still names a place given. The fee is the run's,
  // as the student saw it when ranking and as the workbook sums it; a fee changed since is not theirs.
  const frozenFee = new Map(run.snapshot.items.map((item) => [item.id, item.feeCents]))
  const items = (await listCampaignItems(db, campaign.id)).filter((item) => rows.some((r) => r.itemId === item.id)).map((item) => ({ ...item, feeCents: frozenFee.get(item.id) ?? item.feeCents }))
  return {
    campaign,
    run: { seq: run.seq, seed: run.seed, publishedAt: run.publishedAt ?? '' },
    explanation,
    items: campaign.showTeachers ? items : items.map(withoutTeachers),
    feeCents: items.reduce((sum, item) => sum + item.feeCents, 0),
    swapWindow: campaign.swapFrom !== null && campaign.swapUntil !== null ? { from: campaign.swapFrom, until: campaign.swapUntil } : null,
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
}

/** Per student of a class: their items and the minutes they miss, from the published run; empty when nothing is published. */
export async function classPlacements(db: Queryable, campaign: Campaign, className: string): Promise<Map<string, ClassPlacement>> {
  const run = await store.readPublishedRun(db, campaign.id)
  if (!run) return new Map()
  const [rows, items] = await Promise.all([store.listAssignments(db, run.id), listCampaignItems(db, campaign.id)])
  const titles = new Map(items.map((item) => [item.id, item.title]))
  const result = new Map<string, ClassPlacement>()
  for (const student of run.snapshot.students.filter((s) => s.className === className)) {
    const explanation = explainStudent(run.snapshot, rows, student.personId) as StudentExplanation
    result.set(student.personId, { items: explanation.items.map((e) => ({ itemId: e.itemId, title: titles.get(e.itemId) ?? '', source: e.source })), deficit: explanation.days.reduce((sum, d) => sum + d.deficit, 0) })
  }
  return result
}

/** The published run's review, for the assignments workbook. */
export async function publishedReview(db: Database, campaignId: string) {
  const { campaign, run } = await requirePublished(db, campaignId)
  return { campaign, review: await runReview(db, campaign, run.id) }
}
