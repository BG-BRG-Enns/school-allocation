// Reading the members of the labelled groups from Microsoft Graph, with the
// administrator's own token (docs/data-sources.md §3 A, D-22): the app holds
// no standing directory permission; the token is obtained for the refresh
// and forgotten with it. Only the fields of the minimal roster record are
// taken from a member (docs/data-sources.md §2), whatever Graph returns.

import { isClassGroupName, type RosterEntry } from '@school-allocation/school-core'
import { GUID } from '../config.ts'
import { boundedName } from './app-user.ts'
import type { RosterWarning } from './roster.ts'
import type { RosterGroup } from './roster-groups.ts'

export const GRAPH_BASE_URL = 'https://graph.microsoft.com'

/** The pages of one listing that are followed before the import gives up: 50 × 999 members is more than a school. */
const MAX_PAGES = 50
const REQUEST_TIMEOUT_MS = 15_000

/** A member as the listing returns it; everything else Graph sends is dropped at the boundary. */
export interface GraphMember {
  id: string
  type: string | undefined
  displayName: string | null
  mail: string | null
  userPrincipalName: string | null
}

/** A failed Graph call; `code` says why and is safe to log and show. */
export type GraphErrorCode = 'graph_unauthorized' | 'graph_forbidden' | 'graph_not_found' | 'graph_failed'

export class GraphError extends Error {
  override name = 'GraphError'
  readonly code: GraphErrorCode
  constructor(code: GraphErrorCode, message: string = code) {
    super(message)
    this.code = code
  }
}

/**
 * Every member of a group, over all pages. A next link that points
 * anywhere but the Graph origin the import started with is not followed:
 * the token goes to Graph alone.
 */
export async function listGroupMembers(baseUrl: string, accessToken: string, groupId: string, fetchFn: typeof fetch = fetch): Promise<GraphMember[]> {
  const origin = new URL(baseUrl).origin
  // transitiveMembers, not members: a class group may hold its students in
  // nested groups (3A made of 3AR and 3AG); Graph flattens them, and only
  // the users among the result become entries (membersToEntries).
  let next: string | undefined = `${origin}/v1.0/groups/${encodeURIComponent(groupId)}/transitiveMembers?$select=id,displayName,mail,userPrincipalName&$top=999`
  const members: GraphMember[] = []
  for (let page = 0; next !== undefined; page += 1) {
    if (page >= MAX_PAGES) throw new GraphError('graph_failed', 'too many pages')
    if (new URL(next).origin !== origin) throw new GraphError('graph_failed', 'next link leaves Graph')
    let response: Response
    try {
      response = await fetchFn(next, {
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new GraphError('graph_failed', 'request failed')
    }
    if (response.status === 401) throw new GraphError('graph_unauthorized')
    if (response.status === 403) throw new GraphError('graph_forbidden')
    if (response.status === 404) throw new GraphError('graph_not_found')
    if (!response.ok) throw new GraphError('graph_failed', `status ${response.status}`)
    const body = await response.json().catch(() => undefined) as { 'value'?: unknown, '@odata.nextLink'?: unknown } | undefined
    if (!body || !Array.isArray(body.value)) throw new GraphError('graph_failed', 'not a listing')
    for (const item of body.value) {
      const member = toMember(item)
      if (member) members.push(member)
    }
    next = typeof body['@odata.nextLink'] === 'string' ? body['@odata.nextLink'] : undefined
  }
  return members
}

/** A group as the picker lists it. */
export interface GraphGroup {
  id: string
  displayName: string
  description: string | null
}

const MAX_GROUPS = 50

/**
 * The tenant's groups whose name starts with `q` (D-23; Group.Read.All,
 * delegated): fifty at most, sorted by name here. The filter is Graph's
 * own; the quote inside it is doubled, as OData escapes it, so a name
 * cannot end the filter early. No $orderby: with a $filter, Graph takes
 * it only as an advanced query (ConsistencyLevel: eventual and $count),
 * which the delegated listing does not need otherwise.
 */
export async function searchGroups(baseUrl: string, accessToken: string, q: string, fetchFn: typeof fetch = fetch): Promise<GraphGroup[]> {
  const origin = new URL(baseUrl).origin
  const filter = `startswith(displayName,'${q.replaceAll('\'', '\'\'')}')`
  const url = `${origin}/v1.0/groups?$filter=${encodeURIComponent(filter)}&$select=id,displayName,description&$top=${MAX_GROUPS}`
  let response: Response
  try {
    response = await fetchFn(url, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch {
    throw new GraphError('graph_failed', 'request failed')
  }
  if (response.status === 401) throw new GraphError('graph_unauthorized')
  if (response.status === 403) throw new GraphError('graph_forbidden')
  if (!response.ok) throw new GraphError('graph_failed', `status ${response.status}`)
  const body = await response.json().catch(() => undefined) as { value?: unknown } | undefined
  if (!body || !Array.isArray(body.value)) throw new GraphError('graph_failed', 'not a listing')
  const groups: GraphGroup[] = []
  for (const item of body.value) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    if (typeof record.id !== 'string' || !GUID.test(record.id.toLowerCase())) continue
    groups.push({ id: record.id.toLowerCase(), displayName: boundedName(text(record.displayName)) ?? record.id.toLowerCase(), description: text(record.description)?.slice(0, 200) ?? null })
  }
  return groups.sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))
}

/**
 * Every group of the tenant whose name is a class, "5A" (D-23): one search
 * per leading digit, since Graph filters by prefix only, kept to the names
 * that are nothing but a class. Ten searches for the whole school at once
 * instead of one per class by hand.
 */
export async function searchClassGroups(baseUrl: string, accessToken: string, fetchFn: typeof fetch = fetch): Promise<GraphGroup[]> {
  const found = await Promise.all(['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => searchGroups(baseUrl, accessToken, digit, fetchFn)))
  const byId = new Map<string, GraphGroup>()
  for (const group of found.flat()) if (isClassGroupName(group.displayName)) byId.set(group.id, group)
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))
}

function toMember(item: unknown): GraphMember | undefined {
  if (typeof item !== 'object' || item === null) return undefined
  const record = item as Record<string, unknown>
  if (typeof record.id !== 'string') return undefined
  return {
    id: record.id,
    type: typeof record['@odata.type'] === 'string' ? record['@odata.type'] : undefined,
    displayName: text(record.displayName),
    mail: text(record.mail),
    userPrincipalName: text(record.userPrincipalName),
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * The entries of a batch from the members of the labelled groups: the
 * group's kind, class and grade, the member's object id, name and
 * addresses. Only members Graph marks as users are taken: nested groups,
 * devices, and anything without the type annotation are left out. A member
 * in two groups becomes two entries with one key, which the
 * batch check refuses, as designed. A member without an address is a
 * warning: the import goes through, notifications cannot reach them.
 */
export function membersToEntries(groups: readonly RosterGroup[], membersByGroup: ReadonlyMap<string, readonly GraphMember[]>): { entries: RosterEntry[], warnings: RosterWarning[] } {
  const entries: RosterEntry[] = []
  const warnings: RosterWarning[] = []
  for (const group of groups) {
    for (const member of membersByGroup.get(group.groupId) ?? []) {
      if (member.type !== '#microsoft.graph.user') continue
      const oid = member.id.toLowerCase()
      if (!GUID.test(oid)) continue
      const entry: RosterEntry = {
        kind: group.kind,
        oid,
        displayName: boundedName(member.displayName) ?? member.userPrincipalName ?? oid,
      }
      if (member.mail !== null) entry.mail = member.mail
      if (member.userPrincipalName !== null) entry.upn = member.userPrincipalName
      if (group.kind === 'student') {
        if (group.className !== undefined) entry.className = group.className
        if (group.grade !== undefined) entry.grade = group.grade
      }
      if (entry.mail === undefined && entry.upn === undefined) warnings.push({ code: 'no_address', key: oid })
      entries.push(entry)
    }
  }
  return { entries, warnings }
}
