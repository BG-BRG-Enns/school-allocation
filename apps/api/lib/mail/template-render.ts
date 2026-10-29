// Renders a parsed template: placeholders escaped for HTML or raw, `#if`
// with Handlebars truthiness, an output cap so a small template cannot
// multiply a large value. A notice is plain text, so the renderer is
// called with escaping off. Ported from an internal mail service by the
// same author.

import { parse, type Node, type VarNode } from './template-parse.ts'

/** What an unknown placeholder renders to: `keep` re-emits it as `{{{name}}}` for a later pass, `drop` renders nothing. */
export type UnknownPolicy = 'keep' | 'drop'

export interface RenderOptions {
  unknown: UnknownPolicy
  /** Upper bound for the rendered output in characters; exceeding it throws TemplateOutputError, or cuts the output there with `overflow: 'cut'`. */
  maxLength?: number
  /** What happens at `maxLength`: `throw` (default) or `cut`, which stops rendering and keeps the output within the bound. */
  overflow?: 'throw' | 'cut'
  /** False renders `{{name}}` like `{{{name}}}`, for plain-text targets such as a subject line. Default true. */
  escape?: boolean
}

/** The rendered output would exceed `maxLength`; a small template can otherwise multiply a large value. */
export class TemplateOutputError extends Error {
  readonly limit: number

  constructor(limit: number) {
    super(`The rendered output exceeds ${limit} characters`)
    this.name = 'TemplateOutputError'
    this.limit = limit
  }
}

interface Sink { parts: string[], length: number, limit: number, cut: boolean, full: boolean }

/** Appends within the bound: over it, a cutting sink keeps what fits and takes nothing more, a throwing one throws. */
function emit(sink: Sink, text: string): void {
  if (sink.full) return
  if (sink.length + text.length > sink.limit) {
    if (!sink.cut) throw new TemplateOutputError(sink.limit)
    sink.parts.push(text.slice(0, sink.limit - sink.length))
    sink.length = sink.limit
    sink.full = true
    return
  }
  sink.length += text.length
  sink.parts.push(text)
}

/** Escaping can grow a value sixfold; doing it per chunk keeps the allocation ahead of the limit check small. */
const ESCAPE_CHUNK = 65_536

function emitEscaped(sink: Sink, text: string): void {
  for (let start = 0; start < text.length; start += ESCAPE_CHUNK) {
    emit(sink, escapeHtml(text.slice(start, start + ESCAPE_CHUNK)))
  }
}

export interface CompiledTemplate {
  render: (data: unknown, options: RenderOptions) => string
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#x27;',
  '`': '&#x60;',
  '=': '&#x3D;',
}
const ESCAPE_PATTERN = /[&<>"'`=]/g

/** The seven characters Handlebars escapes in `{{name}}` output. */
export function escapeHtml(value: string): string {
  return value.replace(ESCAPE_PATTERN, (char) => ESCAPES[char] ?? char)
}

/** Handlebars `#if` semantics: false, null, undefined, empty string, zero, NaN and an empty array are false. */
export function isTruthy(value: unknown): boolean {
  if (!value) return false
  return !(Array.isArray(value) && value.length === 0)
}

/**
 * Own properties along the path, on objects and on primitives alike, matching Handlebars'
 * lookupProperty. Prototype properties are never reached.
 */
function lookup(data: unknown, path: readonly string[]): unknown {
  let current: unknown = data
  for (const segment of path) {
    if (current === null || current === undefined) return undefined
    const holder = Object(current) as Record<string, unknown>
    if (!Object.hasOwn(holder, segment)) return undefined
    current = holder[segment]
  }
  return current
}

function renderVar(node: VarNode, data: unknown, options: RenderOptions, sink: Sink): void {
  const value = lookup(data, node.path)
  if (value === undefined || value === null) {
    // Handlebars calls helperMissing only for simple names; a missing dotted path renders empty.
    if (options.unknown === 'keep' && node.path.length === 1) emit(sink, `{{{${node.name}}}}`)
    return
  }
  // Stringified as Handlebars does, objects included ("[object Object]"); the data here are strings anyway.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Handlebars-compatible stringification is the contract
  const text = String(value)
  if (node.raw || options.escape === false) {
    emit(sink, text)
  } else {
    emitEscaped(sink, text)
  }
}

function renderNodes(nodes: readonly Node[], data: unknown, options: RenderOptions, sink: Sink): void {
  for (const node of nodes) {
    if (node.kind === 'text') {
      emit(sink, node.value)
    } else if (node.kind === 'var') {
      renderVar(node, data, options, sink)
    } else {
      renderNodes(isTruthy(lookup(data, node.path)) ? node.consequent : node.alternate, data, options, sink)
    }
  }
}

/** Compiles once; render as often as needed with different data. Throws TemplateSyntaxError, render throws TemplateOutputError. */
export function compile(source: string): CompiledTemplate {
  const nodes = parse(source)
  return {
    render(data, options) {
      const sink: Sink = { parts: [], length: 0, limit: options.maxLength ?? Number.POSITIVE_INFINITY, cut: options.overflow === 'cut', full: false }
      renderNodes(nodes, data ?? {}, options, sink)
      return sink.parts.join('')
    },
  }
}

/** Convenience for one-off rendering. */
export function render(source: string, data: unknown, options: RenderOptions): string {
  return compile(source).render(data, options)
}
