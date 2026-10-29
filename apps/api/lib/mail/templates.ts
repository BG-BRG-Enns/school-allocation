// The mails the window sends, by kind (docs/domain-and-api.md §4): each
// with the placeholders it may use. The texts are rows an organizer edits
// in the app, seeded by the migration with the product's German defaults;
// a save is refused when the syntax is not the subset's or a placeholder
// is not the kind's, so a template can never fail at sending time.

import { appendAudit, lockScope, SCHOOL_SCOPE } from '../audit.ts'
import type { Database, Queryable } from '../db.ts'
import type { Actor } from '../roster.ts'
import { parse, TemplateSyntaxError, type Node } from './template-parse.ts'
import { compile } from './template-render.ts'

export const MAIL_KINDS = ['choice_invitation', 'choice_reminder', 'grace_invitation', 'grace_reminder', 'missed_deadline', 'class_missing'] as const
export type MailKind = typeof MAIL_KINDS[number]

export function isMailKind(value: unknown): value is MailKind {
  return typeof value === 'string' && (MAIL_KINDS as readonly string[]).includes(value)
}

/** What every mail may say: the person's names, the campaign, the link to their page. */
const COMMON = ['vorname', 'name', 'wahl', 'link'] as const

/** The placeholders each kind may use, the common ones included. */
export const PLACEHOLDERS: Readonly<Record<MailKind, readonly string[]>> = {
  choice_invitation: [...COMMON, 'frist', 'projekttage'],
  choice_reminder: [...COMMON, 'frist'],
  grace_invitation: [...COMMON, 'frist'],
  grace_reminder: [...COMMON, 'frist'],
  missed_deadline: [...COMMON],
  class_missing: [...COMMON, 'klasse', 'fenster', 'liste'],
}

/** Sample values for a test mail, so the organizer sees every placeholder filled. */
export const SAMPLE_DATA: Readonly<Record<string, string>> = {
  vorname: 'Maria',
  name: 'Maria Muster',
  wahl: 'Projektwoche 2027',
  link: 'https://wahl.example.org/wahlen/…',
  frist: 'Mo., 08.03.2027, 20:00',
  projekttage: 'Mo., 21.06.2027, Di., 22.06.2027',
  klasse: '5A',
  fenster: 'Anmeldefenster 1',
  liste: '- Maria Muster\n- Max Muster',
}

export interface MailTemplate {
  kind: MailKind
  subject: string
  body: string
  placeholders: readonly string[]
  updatedAt: string
  updatedBy: string | null
}

export interface TemplateProblem {
  code: 'subject_syntax' | 'body_syntax' | 'unknown_placeholder' | 'subject_empty'
  message: string
}

/** The template as entered breaks the rules; the problems say which. */
export class TemplateInvalid extends Error {
  override name = 'TemplateInvalid'
  readonly problems: TemplateProblem[]
  constructor(problems: TemplateProblem[]) {
    super('template_invalid')
    this.problems = problems
  }
}

/** Every placeholder name a parsed template reads, blocks included. */
function namesOf(nodes: readonly Node[], into: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    if (node.kind === 'var') into.add(node.name)
    if (node.kind === 'if') {
      into.add(node.name)
      namesOf(node.consequent, into)
      namesOf(node.alternate, into)
    }
  }
  return into
}

/** The problems of a template for `kind`: the syntax of subject and body, and placeholders the kind does not have. */
export function checkTemplate(kind: MailKind, subject: string, body: string): TemplateProblem[] {
  const problems: TemplateProblem[] = []
  const names = new Set<string>()
  for (const [field, source] of [['subject_syntax', subject], ['body_syntax', body]] as const) {
    try {
      namesOf(parse(source), names)
    } catch (err) {
      if (!(err instanceof TemplateSyntaxError)) throw err
      problems.push({ code: field, message: err.message })
    }
  }
  const allowed = PLACEHOLDERS[kind]
  for (const name of [...names].sort((a, b) => a.localeCompare(b, 'en'))) {
    if (!allowed.includes(name)) problems.push({ code: 'unknown_placeholder', message: name })
  }
  // A subject that renders empty, with every placeholder filled or with none, would block the notice.
  if (problems.length === 0) {
    for (const data of [SAMPLE_DATA, {}]) {
      if (compile(subject).render(data, { unknown: 'drop', escape: false, maxLength: 998, overflow: 'cut' }).trim() === '') {
        problems.push({ code: 'subject_empty', message: 'the subject renders empty' })
        break
      }
    }
  }
  return problems
}

export async function readTemplates(db: Queryable): Promise<MailTemplate[]> {
  const { rows } = await db.query<{ kind: MailKind, subject: string, body: string, updated_at: Date, updated_by: string | null }>(
    'select kind, subject, body, updated_at, updated_by from mail_template order by kind',
  )
  return rows.filter((row) => isMailKind(row.kind)).map((row) => ({
    kind: row.kind, subject: row.subject, body: row.body, placeholders: PLACEHOLDERS[row.kind], updatedAt: row.updated_at.toISOString(), updatedBy: row.updated_by,
  }))
}

export async function readTemplate(db: Queryable, kind: MailKind): Promise<MailTemplate> {
  const template = (await readTemplates(db)).find((t) => t.kind === kind)
  if (!template) throw new Error(`mail template ${kind} is missing; the migration seeds it`)
  return template
}

/** Replaces a template's subject and body, checked, audited. */
export async function saveTemplate(db: Database, kind: MailKind, subject: string, body: string, actor: Actor): Promise<MailTemplate> {
  const problems = checkTemplate(kind, subject, body)
  if (problems.length > 0) throw new TemplateInvalid(problems)
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    await client.query('update mail_template set subject = $2, body = $3, updated_at = now(), updated_by = $4 where kind = $1', [kind, subject, body, actor.id])
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'mail.template-changed',
      metadata: { kind, subjectLength: subject.length, bodyLength: body.length },
    })
  })
  return readTemplate(db, kind)
}

/**
 * The subject line and the plain-text body for `data`; a missing
 * placeholder renders empty. Never throws: the outbox's bounds are applied
 * by cutting (a subject has 998 characters, a body 100 000), and an empty
 * subject becomes the product's name, so a template can never block the
 * transition that renders it.
 */
export function renderTemplate(template: Pick<MailTemplate, 'subject' | 'body'>, data: Readonly<Record<string, string>>): { subject: string, body: string } {
  // The bound is kept while rendering, so a template that repeats a long value is cut at the outbox's limit, not expanded first.
  const options = { unknown: 'drop' as const, escape: false, overflow: 'cut' as const }
  const subject = compile(template.subject).render(data, { ...options, maxLength: 998 }).replaceAll(/[\r\n]+/g, ' ').trim()
  return { subject: subject || 'SchulWahl', body: compile(template.body).render(data, { ...options, maxLength: 100_000 }) }
}
