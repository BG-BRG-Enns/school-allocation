// What a window transition does besides the state (docs/domain-and-api.md
// §2, §4): at the opening the pre-assignments are materialized and every
// student invited; at the close the class teachers get their class's
// missing lists and the students in the grace week their invitation; at
// the end the roster batch is frozen, the students without a complete
// list told, the class teachers told again. Every notice is an outbox
// row in the transition's own transaction, once per dedupe key, in the
// school's language as that transaction reads it.

import { type MailKind } from '@school-allocation/api-contracts/mail'
import type { CampaignState } from '@school-allocation/school-core'
import * as store from '../lib/dao/window.ts'
import { classTeachersByClass } from '../lib/dao/window.ts'
import type { Queryable } from '../lib/db.ts'
import { schoolWords } from '../lib/i18n.ts'
import { enqueueMail } from '../lib/mail/outbox.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { StudentChoiceState } from '../lib/models/choices.ts'
import type { WindowContext } from '../lib/models/window.ts'
import { SCHOOL_TIME_ZONE } from '../lib/time.ts'
import { choiceStates, materializePreAssignments } from './choices.ts'
import { readTemplate, renderTemplate, type Placeholder } from './mail-templates.ts'

/** A moment as the notices write it, in the school's time and `intl`'s words: "Mo., 08.03.2027, 20:00"; "–" for none. */
export function formatWhen(intl: string, iso: string | null): string {
  if (iso === null) return '–'
  return new Intl.DateTimeFormat(intl, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** The first name as the greeting uses it: the first word of the display name. */
export function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName
}

/** The placeholders of a notice to a student: the campaign's, written once in `intl`'s words, and each student's own. */
function studentData(context: WindowContext, intl: string, campaign: Campaign): (student: { displayName: string }) => Partial<Record<Placeholder, string>> {
  const day = new Intl.DateTimeFormat(intl, { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  const shared = {
    campaign: campaign.name,
    link: `${context.baseUrl}/wahlen/${campaign.id}/wuensche`,
    deadline: formatWhen(intl, campaign.state === 'grace' ? campaign.lateUntil : campaign.closesAt),
    project_days: campaign.projectDays.map((date) => day.format(new Date(`${date}T12:00:00Z`))).join(', '),
  }
  return (student) => ({ first_name: firstNameOf(student.displayName), name: student.displayName, ...shared })
}

/** Queues `kind` to every student in `students` who has an address, once per dedupe key. Returns how many were queued. */
export async function notifyStudents(client: Queryable, context: WindowContext, campaign: Campaign, kind: MailKind, students: readonly StudentChoiceState[], dedupeSuffix: string): Promise<number> {
  const { locale, intl } = await schoolWords(client)
  const template = await readTemplate(client, kind, locale)
  const dataOf = studentData(context, intl, campaign)
  let queued = 0
  for (const student of students) {
    if (student.address === null) continue
    const { subject, body } = renderTemplate(template, dataOf(student))
    if (await enqueueMail(client, { kind, campaignId: campaign.id, personId: student.personId, to: student.address, subject, body, dedupeKey: `${kind}:${campaign.id}:${student.personId}:${dedupeSuffix}` })) queued += 1
  }
  return queued
}

/** Tells each class teacher which students of their class have no complete list, once per window. */
export async function notifyClassTeachers(client: Queryable, context: WindowContext, campaign: Campaign, states: readonly StudentChoiceState[], window: 'first' | 'late'): Promise<number> {
  const { locale, t } = await schoolWords(client)
  const template = await readTemplate(client, 'class_missing', locale)
  const teachers = await classTeachersByClass(client, campaign)
  let queued = 0
  for (const [className, list] of teachers) {
    const missing = states.filter((s) => s.className === className && s.state !== 'complete')
    if (missing.length === 0) continue
    for (const teacher of list) {
      const { subject, body } = renderTemplate(template, {
        first_name: firstNameOf(teacher.displayName),
        name: teacher.displayName,
        campaign: campaign.name,
        link: `${context.baseUrl}/wahlen/${campaign.id}/klasse/${encodeURIComponent(className)}`,
        class_name: className,
        window: window === 'first' ? t.labels.window.first : t.labels.window.late,
        list: missing.map((s) => `- ${s.displayName}`).join('\n'),
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
