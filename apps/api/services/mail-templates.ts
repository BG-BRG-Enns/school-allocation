// The mails the window sends, by kind (docs/domain-and-api.md §4): each
// with the placeholders it may use. A kind's text is the school's own when
// an organizer saved one, a row kept with the language it was written in,
// or else the message catalogue's default (packages/messages, `mail`) in
// the school's language; the reset removes the row. A save is refused
// when the syntax is not the subset's or a placeholder is not the kind's,
// so a template can never fail at sending time.

import { MAIL_KINDS, type MailKind } from '@school-allocation/api-contracts/mail'
import { isLocale, messagesFor, type Locale } from '@school-allocation/messages'
import { type Actor } from '../lib/actor.ts'
import { appendAudit, lockScope, SCHOOL_SCOPE } from '../lib/audit.ts'
import * as store from '../lib/dao/mail-templates.ts'
import type { Database, Queryable } from '../lib/db.ts'
import { TemplateInvalid } from '../lib/errors.ts'
import { schoolLocale } from '../lib/i18n.ts'
import { parse, TemplateSyntaxError, type Node } from '../lib/mail/template-parse.ts'
import { compile } from '../lib/mail/template-render.ts'
import type { MailTemplate, TemplateProblem } from '../lib/models/mail-templates.ts'

export function isMailKind(value: unknown): value is MailKind {
  return typeof value === 'string' && (MAIL_KINDS as readonly string[]).includes(value)
}

/**
 * Every placeholder a template may name, in English since they are code;
 * what each stands for and the test mail's value for it are the
 * catalogue's (mailTemplates.placeholder, mailTemplates.sample).
 */
export const PLACEHOLDER_NAMES = [
  'first_name', 'name', 'campaign', 'link', 'deadline', 'project_days', 'class_name', 'window', 'list',
  'programme', 'swap_period', 'activity', 'wish_count', 'minimum', 'changed_by', 'change',
] as const
export type Placeholder = typeof PLACEHOLDER_NAMES[number]

/** What every mail may say: the person's names, the campaign, the link to their page. */
const COMMON = ['first_name', 'name', 'campaign', 'link'] as const

/** The placeholders each kind may use, the common ones included. */
export const PLACEHOLDERS: Readonly<Record<MailKind, readonly Placeholder[]>> = {
  choice_invitation: [...COMMON, 'deadline', 'project_days'],
  choice_reminder: [...COMMON, 'deadline'],
  grace_invitation: [...COMMON, 'deadline'],
  grace_reminder: [...COMMON, 'deadline'],
  missed_deadline: [...COMMON],
  class_missing: [...COMMON, 'class_name', 'window', 'list'],
  // The publication (S4c): a student's programme, the class teacher's list of those without a full place, a teacher's cancelled item.
  result_published: [...COMMON, 'programme', 'swap_period'],
  class_unplaced: [...COMMON, 'class_name', 'list'],
  item_cancelled: [...COMMON, 'activity', 'wish_count', 'minimum'],
  // After publication (S5a): the student's own move, and a change by the class teacher's or the organizer's hand (who, and what changed; the reason stays theirs).
  swap_confirmed: [...COMMON, 'programme'],
  assignment_changed: [...COMMON, 'programme', 'changed_by', 'change'],
}

/** Every placeholder filled with something, whatever the language: what the check of a subject renders. */
const FILLED: Readonly<Record<Placeholder, string>> = Object.fromEntries(PLACEHOLDER_NAMES.map((name) => [name, name])) as Record<Placeholder, string>

/** The default texts in `locale`; typed so that the catalogue must have one for every kind. */
export function defaultTemplates(locale: Locale): Readonly<Record<MailKind, { subject: string, body: string }>> {
  return messagesFor(locale).mail
}

/** The test mail's values in `locale`; typed so that the catalogue must have one for every placeholder. */
export function sampleData(locale: Locale): Readonly<Record<Placeholder, string>> {
  return messagesFor(locale).mailTemplates.sample
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
  const allowed: readonly string[] = PLACEHOLDERS[kind]
  for (const name of [...names].sort((a, b) => a.localeCompare(b, 'en'))) {
    if (!allowed.includes(name)) problems.push({ code: 'unknown_placeholder', message: name })
  }
  // A subject that renders empty, with every placeholder filled or with none, would block the notice.
  if (problems.length === 0) {
    for (const data of [FILLED, {}]) {
      if (compile(subject).render(data, { unknown: 'drop', escape: false, maxLength: 998, overflow: 'cut' }).trim() === '') {
        problems.push({ code: 'subject_empty', message: 'the subject renders empty' })
        break
      }
    }
  }
  return problems
}

/** Every kind in the order of MAIL_KINDS: the school's own text where an organizer saved one, else the default in `locale`. */
async function templatesIn(db: Queryable, locale: Locale): Promise<MailTemplate[]> {
  const saved = new Map((await store.listTemplates(db)).map((row) => [row.kind, row]))
  const defaults = defaultTemplates(locale)
  return MAIL_KINDS.map((kind) => {
    const row = saved.get(kind)
    if (row === undefined) {
      return { kind, subject: defaults[kind].subject, body: defaults[kind].body, placeholders: PLACEHOLDERS[kind], custom: false, locale: null, updatedAt: null, updatedBy: null }
    }
    return {
      kind, subject: row.subject, body: row.body, placeholders: PLACEHOLDERS[kind], custom: true,
      locale: isLocale(row.locale) ? row.locale : null, updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy,
    }
  })
}

/** Every kind as it stands for the school, its defaults in the school's language: the page's list. */
export async function readTemplates(db: Queryable): Promise<MailTemplate[]> {
  return templatesIn(db, await schoolLocale(db))
}

/** One kind as it stands, its default in `locale`: a notice passes the language its transaction read. */
export async function readTemplate(db: Queryable, kind: MailKind, locale: Locale): Promise<MailTemplate> {
  const template = (await templatesIn(db, locale)).find((t) => t.kind === kind)
  if (!template) throw new Error(`mail template ${kind} is missing`)
  return template
}

/** Stores the school's text of a kind, in the school's language as it is now, checked, audited. */
export async function saveTemplate(db: Database, kind: MailKind, subject: string, body: string, actor: Actor): Promise<MailTemplate> {
  const problems = checkTemplate(kind, subject, body)
  if (problems.length > 0) throw new TemplateInvalid(problems)
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const locale = await schoolLocale(client)
    await store.saveTemplate(client, kind, subject, body, locale, actor)
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'mail.template-changed',
      metadata: { kind, locale, subjectLength: subject.length, bodyLength: body.length },
    })
  })
  return readTemplate(db, kind, await schoolLocale(db))
}

/**
 * Removes the school's text of a kind, so that the default in the school's
 * language applies again; audited with the language the removed text was
 * written in. A kind without a text of the school's is left as it is, and
 * nothing is recorded.
 */
export async function resetTemplate(db: Database, kind: MailKind, actor: Actor): Promise<MailTemplate> {
  await db.tx(async (client) => {
    await lockScope(client, SCHOOL_SCOPE)
    const removed = await store.deleteTemplate(client, kind)
    if (removed === null) return
    await appendAudit(client, {
      scopeId: SCHOOL_SCOPE,
      actor: { tid: actor.tid, oid: actor.oid, name: actor.name },
      action: 'mail.template-reset',
      metadata: { kind, locale: removed.locale },
    })
  })
  return readTemplate(db, kind, await schoolLocale(db))
}

/** A kind as a test mail: its text as it stands, filled with the sample values of the school's language as `db` reads it. */
export async function sampleMail(db: Queryable, kind: MailKind): Promise<{ subject: string, body: string }> {
  const locale = await schoolLocale(db)
  return renderTemplate(await readTemplate(db, kind, locale), sampleData(locale))
}

/**
 * The subject line and the plain-text body for `data`; a missing
 * placeholder renders empty. Never throws: the outbox's bounds are applied
 * by cutting (a subject has 998 characters, a body 100 000), and an empty
 * subject becomes the product's name, so a template can never block the
 * transition that renders it.
 */
export function renderTemplate(template: Pick<MailTemplate, 'subject' | 'body'>, data: Readonly<Partial<Record<Placeholder, string>>>): { subject: string, body: string } {
  // The bound is kept while rendering, so a template that repeats a long value is cut at the outbox's limit, not expanded first.
  const options = { unknown: 'drop' as const, escape: false, overflow: 'cut' as const }
  const subject = compile(template.subject).render(data, { ...options, maxLength: 998 }).replaceAll(/[\r\n]+/g, ' ').trim()
  return { subject: subject || 'SchulWahl', body: compile(template.body).render(data, { ...options, maxLength: 100_000 }) }
}
