// Parser for the Handlebars-compatible subset the mail templates use:
// `{{name}}`, `{{{name}}}` and `{{#if name}} … {{else}} … {{/if}}`,
// nestable, with dotted names. Anything else Handlebars offers is a
// TemplateSyntaxError, so a template can never render differently here
// than the editor was promised. Ported from an internal mail service by
// the same author.

export interface Position {
  line: number
  column: number
}

export class TemplateSyntaxError extends Error {
  readonly line: number
  readonly column: number

  constructor(message: string, position: Position) {
    super(`${message} at line ${position.line}, column ${position.column}`)
    this.name = 'TemplateSyntaxError'
    this.line = position.line
    this.column = position.column
  }
}

export interface TextNode { kind: 'text', value: string }
export interface VarNode { kind: 'var', name: string, path: readonly string[], raw: boolean }
export interface IfNode { kind: 'if', name: string, path: readonly string[], consequent: Node[], alternate: Node[] }
export type Node = TextNode | VarNode | IfNode

type Tag
  = | { type: 'var', name: string, path: string[], raw: boolean }
    | { type: 'open', name: string, path: string[] }
    | { type: 'else' }
    | { type: 'close' }

interface TagToken { kind: 'tag', tag: Tag, start: number, end: number, position: Position }
interface TextToken { kind: 'text', start: number, end: number }
type Token = TagToken | TextToken

const SEGMENT = '[A-Za-z_][A-Za-z0-9_-]*'
const PATH_PATTERN = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})*$`)
const RESERVED = new Set(['this', 'true', 'false', 'null', 'undefined'])

const UNSUPPORTED_PREFIX: Record<string, string> = {
  '>': 'Partials are not supported',
  '!': 'Comments are not supported',
  '^': 'Inverted sections are not supported',
  '&': 'Unescaped {{& }} mustaches are not supported; use triple braces',
  '~': 'Whitespace control is not supported',
  '@': 'Data variables are not supported',
}

const TAB = 9
const NEWLINE = 10
const CR = 13
const SPACE = 32
const CLOSE_BRACE = 125

/** Real templates nest two or three levels; the cap keeps the recursive renderer clear of the call stack limit. */
const MAX_DEPTH = 100

/** Line and column of ascending offsets; each character of the source is scanned once in total. */
function positionTracker(source: string): (offset: number) => Position {
  let scanned = 0
  let line = 1
  let lineStart = 0
  return (offset) => {
    for (; scanned < offset; scanned++) {
      if (source.charCodeAt(scanned) === NEWLINE) {
        line++
        lineStart = scanned + 1
      }
    }
    return { line, column: offset - lineStart + 1 }
  }
}

function parsePath(name: string, position: Position): string[] {
  if (!PATH_PATTERN.test(name)) {
    throw new TemplateSyntaxError(`"${name}" is not a valid placeholder name`, position)
  }
  const path = name.split('.')
  for (const segment of path) {
    if (RESERVED.has(segment)) throw new TemplateSyntaxError(`"${segment}" is not supported as a placeholder name`, position)
  }
  return path
}

function parseBlockOpen(inner: string, position: Position): Tag {
  const parts = inner.slice(1).trim().split(/\s+/)
  const helper = parts[0] ?? ''
  if (helper !== 'if') throw new TemplateSyntaxError(`Block helper "#${helper}" is not supported; only #if is available`, position)
  if (parts.length !== 2) throw new TemplateSyntaxError('#if takes exactly one placeholder name', position)
  const name = parts[1] ?? ''
  return { type: 'open', name, path: parsePath(name, position) }
}

function parseBlockClose(inner: string, position: Position): Tag {
  const helper = inner.slice(1).trim()
  if (helper !== 'if') throw new TemplateSyntaxError(`Closing tag "{{/${helper}}}" does not match a supported block`, position)
  return { type: 'close' }
}

function classify(rawInner: string, triple: boolean, position: Position): Tag {
  const inner = rawInner.trim()
  if (inner.includes('{') || inner.includes('}')) throw new TemplateSyntaxError('Malformed mustache', position)
  if (inner === '') throw new TemplateSyntaxError('Empty mustache', position)
  if (triple) return { type: 'var', name: inner, path: parsePath(inner, position), raw: true }

  const first = inner.charAt(0)
  if ((first === '#' || first === '/') && rawInner.charAt(0) !== first) {
    throw new TemplateSyntaxError(`Malformed mustache: no space allowed between "{{" and "${first}"`, position)
  }
  if (first === '#') return parseBlockOpen(inner, position)
  if (first === '/') return parseBlockClose(inner, position)
  const unsupported = UNSUPPORTED_PREFIX[first]
  if (unsupported !== undefined || inner.endsWith('~')) {
    throw new TemplateSyntaxError(unsupported ?? UNSUPPORTED_PREFIX['~'] ?? 'Unsupported mustache', position)
  }
  if (inner === 'else') return { type: 'else' }
  if (inner.startsWith('else ')) throw new TemplateSyntaxError('Chained {{else if}} is not supported', position)
  if (/\s/.test(inner)) throw new TemplateSyntaxError('Helpers with arguments are not supported', position)
  return { type: 'var', name: inner, path: parsePath(inner, position), raw: false }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  const positionAt = positionTracker(source)
  let pos = 0
  while (pos < source.length) {
    const open = source.indexOf('{{', pos)
    if (open === -1) {
      tokens.push({ kind: 'text', start: pos, end: source.length })
      break
    }
    if (open > pos) tokens.push({ kind: 'text', start: pos, end: open })
    const triple = source.startsWith('{{{', open)
    const closer = triple ? '}}}' : '}}'
    const close = source.indexOf(closer, open + closer.length)
    const position = positionAt(open)
    if (close === -1) throw new TemplateSyntaxError('Unclosed mustache', position)
    const end = close + closer.length
    if (source.charCodeAt(end) === CLOSE_BRACE) throw new TemplateSyntaxError('Malformed mustache: surplus closing brace', position)
    tokens.push({ kind: 'tag', tag: classify(source.slice(open + closer.length, close), triple, position), start: open, end, position })
    pos = end
  }
  return tokens
}

interface Cut { before: number, after: number }

const isBlank = (code: number): boolean => code === SPACE || code === TAB

/** Start of the line when only blanks precede `offset` on it, otherwise null. */
function lineStartBefore(source: string, offset: number): number | null {
  let i = offset
  while (i > 0 && isBlank(source.charCodeAt(i - 1))) i--
  return i === 0 || source.charCodeAt(i - 1) === NEWLINE ? i : null
}

/**
 * Offset past the line break when only blanks follow `offset` on its line, otherwise null.
 * A carriage return counts as part of CRLF or at the very end of the source.
 */
function lineEndAfter(source: string, offset: number): number | null {
  let i = offset
  while (i < source.length && isBlank(source.charCodeAt(i))) i++
  if (i === source.length) return i
  if (source.charCodeAt(i) === CR) {
    if (i + 1 === source.length) return i + 1
    if (source.charCodeAt(i + 1) !== NEWLINE) return null
    i++
  }
  return source.charCodeAt(i) === NEWLINE ? i + 1 : null
}

/**
 * A block tag that is alone on its line, with only blanks around it, takes the whole line with it,
 * including the line break. This is the Mustache "standalone" rule that Handlebars applies too.
 * Both scans stop at the first non-blank character, so the work over a whole template stays linear.
 */
function standaloneCut(source: string, token: TagToken): Cut | null {
  if (token.tag.type === 'var') return null
  const before = lineStartBefore(source, token.start)
  if (before === null) return null
  const after = lineEndAfter(source, token.end)
  return after === null ? null : { before, after }
}

/** The text of a token clipped by the standalone cuts of its neighbouring tags, or null when nothing remains. */
function clippedText(source: string, token: TextToken, previous: Token | undefined, next: Token | undefined, cuts: ReadonlyMap<Token, Cut | null>): string | null {
  const start = Math.max(token.start, previous === undefined ? token.start : cuts.get(previous)?.after ?? token.start)
  const end = Math.min(token.end, next === undefined ? token.end : cuts.get(next)?.before ?? token.end)
  return end > start ? source.slice(start, end) : null
}

interface Frame { node: IfNode, inElse: boolean, position: Position }

/** Parses `source` into a node tree. Throws TemplateSyntaxError for anything outside the subset. */
export function parse(source: string): Node[] {
  const tokens = tokenize(source)
  const cuts = new Map<Token, Cut | null>()
  for (const token of tokens) {
    if (token.kind === 'tag') cuts.set(token, standaloneCut(source, token))
  }

  const root: Node[] = []
  const stack: Frame[] = []
  const current = (): Node[] => {
    const top = stack[stack.length - 1]
    if (top === undefined) return root
    return top.inElse ? top.node.alternate : top.node.consequent
  }

  tokens.forEach((token, index) => {
    if (token.kind === 'text') {
      const value = clippedText(source, token, tokens[index - 1], tokens[index + 1], cuts)
      if (value !== null) current().push({ kind: 'text', value })
      return
    }
    const { tag } = token
    switch (tag.type) {
      case 'var':
        current().push({ kind: 'var', name: tag.name, path: tag.path, raw: tag.raw })
        break
      case 'open': {
        if (stack.length >= MAX_DEPTH) throw new TemplateSyntaxError(`Blocks nest deeper than ${MAX_DEPTH} levels`, token.position)
        const node: IfNode = { kind: 'if', name: tag.name, path: tag.path, consequent: [], alternate: [] }
        current().push(node)
        stack.push({ node, inElse: false, position: token.position })
        break
      }
      case 'else': {
        const top = stack[stack.length - 1]
        if (top === undefined) throw new TemplateSyntaxError('{{else}} outside of a block', token.position)
        if (top.inElse) throw new TemplateSyntaxError('A block can have only one {{else}}', token.position)
        top.inElse = true
        break
      }
      case 'close':
        if (stack.pop() === undefined) throw new TemplateSyntaxError('{{/if}} without an open block', token.position)
        break
    }
  })

  const open = stack[stack.length - 1]
  if (open !== undefined) throw new TemplateSyntaxError(`Unclosed {{#if ${open.node.name}}}`, open.position)
  return root
}
