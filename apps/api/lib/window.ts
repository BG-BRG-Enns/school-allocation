// What a window transition does besides the state (docs/domain-and-api.md
// §2, §4): at the opening the pre-assignments are materialized and every
// student invited; at the close the class teachers get their class's
// missing lists and the students in the grace week their invitation; at
// the end the roster batch is frozen, the students without a complete
// list told, the class teachers told again. Every notice is an outbox
// row in the transition's own transaction, once per dedupe key.

import type { CampaignState } from '@school-allocation/school-core'
import type { Campaign } from './campaigns.ts'
import { choiceStates, materializePreAssignments, type StudentChoiceState } from './choices.ts'
import type { Queryable } from './db.ts'
import { enqueueMail } from './mail/outbox.ts'
import { readTemplate, renderTemplate, type MailKind } from './mail/templates.ts'
import { SCHOOL_TIME_ZONE } from './time.ts'

/** Where the links in a notice point: the deployment's public URL. */
export interface WindowContext {
  baseUrl: string
}

const whenFormat = new Intl.DateTimeFormat('de-AT', { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('de-AT', { timeZone: SCHOOL_TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })

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

/** The class teachers of the campaign's roster with an address, by class: assigned in the app for the roster's year, or named by the roster's column. */
async function classTeachersByClass(client: Queryable, campaign: Campaign): Promise<Map<string, { personId: string, displayName: string, address: string }[]>> {
  const batch = campaign.rosterBatchId === null ? '(select id from import_batch where state = \'committed\' order by decided_at desc limit 1)' : `'${campaign.rosterBatchId}'::uuid`
  const { rows } = await client.query<{ class_name: string, person_id: string, display_name: string, address: string }>(
    `with b as (select id, school_year from import_batch where id = ${batch}),
     teachers as (select e.person_id, e.display_name, coalesce(e.mail, e.upn) as address, lower(e.mail) as mail, lower(e.upn) as upn
                    from roster_entry e, b where e.batch_id = b.id and e.kind = 'teacher' and e.person_id is not null),
     classes as (select distinct e.class_name, lower(e.class_teacher_mail) as kv_mail from roster_entry e, b where e.batch_id = b.id and e.kind = 'student' and e.class_name is not null)
     select distinct c.class_name, t.person_id, t.display_name, t.address
       from classes c
       join teachers t on (c.kv_mail is not null and (t.mail = c.kv_mail or t.upn = c.kv_mail))
                       or exists (select 1 from class_teacher a, b where a.person_id = t.person_id and a.class_name = c.class_name and a.school_year = b.school_year and a.revoked_at is null)
      where t.address is not null
      order by c.class_name, t.display_name`,
  )
  const byClass = new Map<string, { personId: string, displayName: string, address: string }[]>()
  for (const row of rows) {
    const list = byClass.get(row.class_name) ?? []
    list.push({ personId: row.person_id, displayName: row.display_name, address: row.address })
    byClass.set(row.class_name, list)
  }
  return byClass
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
        fenster: window === 'first' ? 'Anmeldefenster' : 'Nachfrist',
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
      await client.query('update campaign set roster_batch_id = (select id from import_batch where state = \'committed\' order by decided_at desc limit 1) where id = $1', [campaign.id])
    }
    const states = await choiceStates(client, after)
    const incomplete = states.filter((s) => s.state !== 'complete')
    const told = await notifyStudents(client, context, after, 'missed_deadline', incomplete, 'closed')
    const classTeachers = await notifyClassTeachers(client, context, after, states, campaign.state === 'grace' ? 'late' : 'first')
    return { incomplete: incomplete.length, told, classTeachers }
  }
  return {}
}
