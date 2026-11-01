// The availability list an organizer uploads for a registration: a row per
// teacher, a column per project day, the note. Read by school-core against
// the registration's days, matched here against the teachers of the
// planning (by address or by abbreviation), shown as what it would change,
// applied in one transaction under the registration's lock, one audit
// event, until the registration is archived — as the organizer's hand on
// the page, only for everyone at once.

import { createHash } from 'node:crypto'
import type { AvailabilityImportApplied, AvailabilityImportPreview } from '@school-allocation/api-contracts/planning'
import { AVAILABILITY_CSV_VALUES, parseAvailabilityCsv, type AvailabilityCsvRow, type AvailabilityStatus } from '@school-allocation/school-core'
import type { Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import { lockedCampaign } from '../lib/dao/campaigns.ts'
import * as planningStore from '../lib/dao/planning.ts'
import { campaignRosterBatch, CURRENT_BATCH_ID } from '../lib/dao/roster-selection.ts'
import * as detailStore from '../lib/dao/teacher-detail.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { ApplicationError, AvailabilityImportInvalid } from '../lib/errors.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import { canonicalId, requireCampaign } from './campaigns.ts'
import { planning, plannedItems } from './planning.ts'

interface Resolved {
  preview: AvailabilityImportPreview
  /** Per person: the days to write and, where the file has the column, the note. */
  writes: Map<string, { days: Map<string, AvailabilityStatus>, note?: string | null, currentShortName: string | null }>
}

/** What the list would change for the registration; `applicable` says whether apply would take it. */
export async function previewAvailabilityImport(db: Database, rawId: string, csv: string): Promise<AvailabilityImportPreview> {
  const campaign = await requireCampaign(db, canonicalId(rawId))
  return (await resolve(db, campaign, csv)).preview
}

/** Applies the list: every day the file has for every teacher it names, and the notes; one audit event. */
export async function applyAvailabilityImport(db: Database, rawId: string, csv: string, actor: Actor): Promise<AvailabilityImportApplied> {
  const id = canonicalId(rawId)
  const counts = await db.tx(async (client) => {
    // The notes live in teacher_detail, the school's: its lock first, then the registration's (AGENTS.md, API boundaries).
    await lockScope(client, SCHOOL_SCOPE)
    await lockScope(client, id)
    const campaign = await lockedCampaign(client, id)
    if (!campaign) throw new ApplicationError('not_found')
    if (campaign.state === 'archived') throw new ApplicationError('campaign_state')
    const { preview, writes } = await resolve(client, campaign, csv)
    if (preview.fileProblems.length > 0) throw new ApplicationError('csv_file_invalid', preview.fileProblems.map((p) => `${p.code}${p.column === undefined ? '' : ` (${p.column})`}${p.line === undefined ? '' : ` (line ${p.line})`}`).join('; '))
    if (!preview.applicable) throw new AvailabilityImportInvalid(preview.problems)
    for (const [personId, write] of writes) {
      for (const [date, status] of write.days) await planningStore.writeAvailability(client, personId, date, status)
      if (write.note !== undefined) await detailStore.writeDetail(client, personId, { shortName: write.currentShortName, note: write.note })
    }
    await appendAudit(client, {
      scopeId: id, actor: { tid: actor.tid, oid: actor.oid, name: actor.name }, action: 'availability.imported',
      metadata: { sha256: createHash('sha256').update(csv).digest('hex'), teachers: preview.teachers.length, days: preview.days.length, changedDays: preview.changedDays, changedNotes: preview.changedNotes },
    })
    return { changedDays: preview.changedDays, changedNotes: preview.changedNotes }
  })
  return { planning: (await planning(db, id)).planning, ...counts }
}

/** The list as it stands: every teacher of the planning, their abbreviation, each project day's status, the note. */
export async function availabilityTemplate(db: Database, rawId: string): Promise<string> {
  const campaign = await requireCampaign(db, canonicalId(rawId))
  const items = await plannedItems(db, campaign)
  const teachers = await planningStore.planningTeachers(db, campaign.id, items.map((item) => item.id))
  // Addresses from the registration's roster, which may be frozen; a teacher named after the freeze from the one in force.
  const addressOf = new Map((await detailStore.rosterTeacherAddresses(db, CURRENT_BATCH_ID)).map((teacher) => [teacher.personId, teacher.address]))
  for (const teacher of await detailStore.rosterTeacherAddresses(db, campaignRosterBatch(campaign))) addressOf.set(teacher.personId, teacher.address)
  const limited = new Map((await planningStore.limitedDays(db, campaign.projectDays, teachers.map((teacher) => teacher.personId))).map((d) => [`${d.personId}|${d.date}`, d.status]))
  // RFC 4180 quoting; a note a spreadsheet would read as a formula gets an apostrophe first, so it stays text when opened.
  const field = (value: string): string => {
    const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const lines = [['email', 'short_name', ...campaign.projectDays, 'note'].join(';')]
  for (const teacher of teachers) {
    const cells = [addressOf.get(teacher.personId) ?? '', teacher.shortName ?? '', ...campaign.projectDays.map((date) => AVAILABILITY_CSV_VALUES[limited.get(`${teacher.personId}|${date}`) ?? 'available']), teacher.note ?? '']
    lines.push(cells.map(field).join(';'))
  }
  return `${lines.join('\r\n')}\r\n`
}

async function resolve(db: Queryable, campaign: Campaign, csv: string): Promise<Resolved> {
  const parsed = parseAvailabilityCsv(csv, campaign.projectDays)
  const preview: AvailabilityImportPreview = { fileProblems: parsed.fileProblems, problems: [...parsed.problems], ignoredColumns: parsed.ignoredColumns, days: parsed.days, teachers: [], changedDays: 0, changedNotes: 0, applicable: false }
  const writes: Resolved['writes'] = new Map()
  if (parsed.fileProblems.length > 0) return { preview, writes }
  const items = await plannedItems(db, campaign)
  const teachers = await planningStore.planningTeachers(db, campaign.id, items.map((item) => item.id))
  const byId = new Map(teachers.map((teacher) => [teacher.personId, teacher]))
  // The registration's roster first, which may be frozen; then the one in force, for a teacher named after the freeze.
  const addresses = [...new Set(parsed.rows.flatMap((row) => (row.email === undefined ? [] : [row.email])))]
  const byAddress = await detailStore.findTeachersByAddress(db, addresses, campaignRosterBatch(campaign))
  for (const [address, teacher] of await detailStore.findTeachersByAddress(db, addresses.filter((a) => !byAddress.has(a)), CURRENT_BATCH_ID)) byAddress.set(address, teacher)
  const byShortName = await detailStore.findByShortName(db, [...new Set(parsed.rows.flatMap((row) => (row.shortName === undefined ? [] : [row.shortName.toLowerCase()])))])
  const resolved: (AvailabilityCsvRow & { personId: string })[] = []
  for (const row of parsed.rows) {
    const fromAddress = row.email === undefined ? undefined : byAddress.get(row.email)?.personId
    const fromShortName = row.shortName === undefined ? undefined : byShortName.get(row.shortName.toLowerCase())?.personId
    if (fromAddress !== undefined && fromShortName !== undefined && fromAddress !== fromShortName) {
      preview.problems.push({ code: 'key_conflict', line: row.line, key: `${row.email} / ${row.shortName}` })
      continue
    }
    const personId = fromAddress ?? fromShortName
    if (personId === undefined || !byId.has(personId)) {
      preview.problems.push({ code: 'teacher_unknown', line: row.line, key: row.email ?? row.shortName ?? '' })
      continue
    }
    resolved.push({ ...row, personId })
  }
  const current = new Map((await planningStore.limitedDays(db, parsed.days, [...new Set(resolved.map((row) => row.personId))])).map((d) => [`${d.personId}|${d.date}`, d.status as AvailabilityStatus]))
  for (const row of resolved) {
    const teacher = byId.get(row.personId)
    if (teacher === undefined) continue
    // A teacher twice in the file: the later row's cells win, as in a sheet edited top to bottom.
    const write = writes.get(row.personId) ?? { days: new Map<string, AvailabilityStatus>(), currentShortName: teacher.shortName }
    for (const [date, status] of Object.entries(row.days)) write.days.set(date, status)
    if (row.note !== undefined) write.note = row.note
    writes.set(row.personId, write)
  }
  for (const [personId, write] of writes) {
    const teacher = byId.get(personId)
    if (teacher === undefined) continue
    const days = [...write.days].map(([date, after]) => ({ date, before: current.get(`${personId}|${date}`) ?? 'available', after }))
    preview.changedDays += days.filter((d) => d.before !== d.after).length
    const note = write.note === undefined || write.note === teacher.note ? null : { before: teacher.note, after: write.note }
    if (note !== null) preview.changedNotes++
    preview.teachers.push({ personId, displayName: teacher.displayName, shortName: teacher.shortName, days, note })
  }
  preview.applicable = preview.problems.length === 0 && writes.size > 0
  return { preview, writes }
}
