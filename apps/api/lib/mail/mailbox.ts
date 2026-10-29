// One RFC 5322 mailbox, as the From setting and a recipient may be
// written: `user@example.org`, `Name <user@example.org>` or
// `"Display Name" <user@example.org>`. Lists, groups and comments are
// rejected: a notice goes to one person. Ported from an internal mail
// service by the same author.

export interface Mailbox {
  /** Display name without quotes, or null. */
  name: string | null
  /** The addr-spec as written. */
  address: string
}

const LOCAL = '[A-Za-z0-9!#$%&\'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&\'*+/=?^_`{|}~-]+)*'
const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?'
const DOMAIN = `${LABEL}(?:\\.${LABEL})*`
const ADDRESS = `${LOCAL}@${DOMAIN}`

// No control characters anywhere in a display name; the plain form also excludes the RFC 5322 specials
// that would start a comment, a group or a route, while dots stay allowed ("Dr. Muster").
const CONTROL = '\\x00-\\x1F\\x7F'
const BARE = new RegExp(`^(${ADDRESS})$`)
const QUOTED_NAME = new RegExp(`^"((?:[^"\\\\${CONTROL}]|\\\\[^${CONTROL}])*)"[ \\t]*<(${ADDRESS})>$`)
const PLAIN_NAME = new RegExp(`^([^<>@",\\\\()\\[\\]:;${CONTROL}]*?)[ \\t]*<(${ADDRESS})>$`)

/** Parses one mailbox; null when the value is not exactly one plain mailbox. */
export function parseMailbox(value: string): Mailbox | null {
  const text = value.trim()
  if (text.length === 0 || text.length > 320) return null
  const bare = BARE.exec(text)
  if (bare) return { name: null, address: bare[1] as string }
  const quoted = QUOTED_NAME.exec(text)
  if (quoted) {
    const name = (quoted[1] as string).replaceAll(/\\(.)/g, '$1')
    return { name: name === '' ? null : name, address: quoted[2] as string }
  }
  const plain = PLAIN_NAME.exec(text)
  if (plain) {
    const name = (plain[1] as string).trim()
    return { name: name === '' ? null : name, address: plain[2] as string }
  }
  return null
}

/** Address part, lowercased, for case-insensitive lookups; the input itself when it is not a mailbox. */
export function normalizeAddress(value: string): string {
  const parsed = parseMailbox(value)
  return (parsed?.address ?? value.trim()).toLowerCase()
}

/** Domain part of a mailbox, lowercased; used for generated ids. */
export function domainOf(mailbox: Mailbox): string {
  return mailbox.address.slice(mailbox.address.lastIndexOf('@') + 1).toLowerCase()
}
