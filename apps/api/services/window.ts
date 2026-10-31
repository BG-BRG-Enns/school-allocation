// What a window transition does besides the state (docs/domain-and-api.md
// §2, §4): at the opening the pre-assignments are materialized and every
// student invited; at the close the class teachers get their class's
// missing lists and the students in the grace week their invitation; at
// the end the roster batch is frozen, the students without a complete
// list told, the class teachers told again. Every notice is an outbox
// row in the transition's own transaction, once per dedupe key.

import { type MailKind } from '@school-allocation/api-contracts/mail'
import type { CampaignState } from '@school-allocation/school-core'
import * as store from '../lib/dao/window.ts'
import { classTeachersByClass } from '../lib/dao/window.ts'
import type { Queryable } from '../lib/db.ts'
import { INTL_LOCALE, t } from '../lib/i18n.ts'
import { enqueueMail } from '../lib/mail/outbox.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { StudentChoiceState } from '../lib/models/choices.ts'
import type { WindowContext } from '../lib/models/window.ts'
import { SCHOOL_TIME_ZONE } from '../lib/time.ts'
import { choiceStates, materializePreAssignments } from './choices.ts'
import { readTemplate, renderTemplate } from './mail-templates.ts'

const whenFormat = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })

export function formatWhen(iso: string | null): string {
  return iso === null ? '–' : whenFormat.format(new Date(iso))
}

/** The first name as the greeting uses it: the first word of the display name. */
export function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName
}

/** The common placeholders of a notice to a student. */
function studentData(context: WindowContext, campaign: Campaign, student: { displayName: string }): Record<string, string> {
  return {
    vorname: firstNameOf(student.displayName),
    name: student.displayName,
    wahl: campaign.name,
    link: `${context.baseUrl}/wahlen/${campaign.id}/wuensche`,
    frist: formatWhen(campaign.state === 'grace' ? campaign.lateUntil : campaign.closesAt),
    projekttage: campaign.projectDays.map((day) => dayFormat.format(new Date(`${day}T12:00:00Z`))).join(', '),
  }
}

/** Queues `kind` to every student in `students` who has an address, once per dedupe key. Returns how many were queued. */
export async function notifyStudents(client: Queryable, context: WindowContext, campaign: Campaign, kind: MailKind, students: readonly StudentChoiceState[], dedupeSuffix: string): Promise<number> {
  const template = await readTemplate(client, kind)
  let queued = 0
  for (const student of students) {
    if (student.address === null) continue
    const { subject, body } = renderTemplate(template, studentData(context, campaign, student))
    if (await enqueueMail(client, { kind, campaignId: campaign.id, personId: student.personId, to: student.address, subject, body, dedupeKey: `${kind}:${campaign.id}:${student.personId}:${dedupeSuffix}` })) queued += 1
  }
  return queued
}

/** Tells each class teacher which students of their class have no complete list, once per window. */
export async function notifyClassTeachers(client: Queryable, context: WindowContext, campaign: Campaign, states: readonly StudentChoiceState[], window: 'first' | 'late'): Promise<number> {
  const template = await readTemplate(client, 'class_missing')
  const teachers = await classTeachersByClass(client, campaign)
  let queued = 0
  for (const [className, list] of teachers) {
    const missing = states.filter((s) => s.className === className && s.state !== 'complete')
    if (missing.length === 0) continue
    for (const teacher of list) {
      const { subject, body } = renderTemplate(template, {
        vorname: firstNameOf(teacher.displayName),
        name: teacher.displayName,
        wahl: campaign.name,
        link: `${context.baseUrl}/wahlen/${campaign.id}/klasse/${encodeURIComponent(className)}`,
        klasse: className,
        fenster: window === 'first' ? t.labels.window.first : t.labels.window.late,
        liste: missing.map((s) => `- ${s.displayName}`).join('\n'),
      })
      const key = `class_missing:${campaign.id}:${className}:${teacher.personId}:${window}`
      if (await enqueueMail(client, { kind: 'class_missing', campaignId: campaign.id, personId: teacher.personId, to: teacher.address, subject, body, dedupeKey: key })) queued += 1
    }
  }
  return queued
}

/**
 * The side effects of moving a campaign to `to`, inside the transition's
 * transaction; returns what the audit event records about them.
 */
export async function windowEffects(client: Queryable, context: WindowContext, campaign: Campaign, to: CampaignState): Promise<Record<string, number>> {
  const after: Campaign = { ...campaign, state: to }
  if (to === 'open') {
    const preAssigned = await materializePreAssignments(client, campaign)
    const states = await choiceStates(client, after)
    const invited = await notifyStudents(client, context, after, 'choice_invitation', states, 'open')
    return { preAssigned, invited }
  }
  if (to === 'grace') {
    const states = await choiceStates(client, after)
    const incomplete = states.filter((s) => s.state !== 'complete')
    const invited = await notifyStudents(client, context, after, 'grace_invitation', incomplete, 'grace')
    const classTeachers = await notifyClassTeachers(client, context, after, states, 'first')
    return { incomplete: incomplete.length, invited, classTeachers }
  }
  if (to === 'closed') {
    // The roster is frozen as it is now; everything after goes by it.
    if (campaign.rosterBatchId === null) {
      await store.freezeRoster(client, campaign)
    }
    const states = await choiceStates(client, after)
    const incomplete = states.filter((s) => s.state !== 'complete')
    const told = await notifyStudents(client, context, after, 'missed_deadline', incomplete, 'closed')
    const classTeachers = await notifyClassTeachers(client, context, after, states, campaign.state === 'grace' ? 'late' : 'first')
    return { incomplete: incomplete.length, told, classTeachers }
  }
  return {}
}
