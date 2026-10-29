// A stand-in for Microsoft Graph on a local port: the member listing of a
// group, paged as Graph pages it, behind a bearer token. It accepts the
// access tokens the fake Entra handed out (they share the list), so the
// roster refresh runs end to end: the administrator authorizes at the
// stand-in for Entra, the app reads the groups here. A test sets the
// groups and their members, the page size, and a failure to answer with.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ANNA, BERND, CARLA, SARA, TIM, type Person } from './personas.ts'

/** A member as Graph lists it; `type` is the @odata.type, a user unless said otherwise, left out when null. */
export interface FakeMember {
  id: string
  displayName?: string
  mail?: string
  userPrincipalName?: string
  type?: string | null
}

export interface FakeGraph {
  baseUrl: string
  /** The groups and their members; a test changes them in place. */
  groups: Map<string, FakeMember[]>
  /** What the groups are called in the tenant, for the picker's search; a group without a name here is "Gruppe <id…>". */
  names: Map<string, string>
  /** Members per page; Graph's own limit is 999. */
  pageSize: number
  /** When set, every listing fails with this status. */
  failWith?: number
  /** Every request answered, as "METHOD path". */
  requests: string[]
  close: () => Promise<void>
}

/** The group ids the default groups use: a class and the teachers. */
export const CLASS_5A_GROUP = '11111111-1111-4111-8111-111111111111'
export const TEACHERS_GROUP = '22222222-2222-4222-8222-222222222222'

export function memberOf(person: Person, extra: Partial<FakeMember> = {}): FakeMember {
  return { id: person.oid, displayName: person.name, mail: person.email, userPrincipalName: person.email, ...extra }
}

/** The groups the journeys and the dev server start with: 5A with Sara and Tim, the teachers with Anna, Bernd and Carla. */
export function defaultGroups(): Map<string, FakeMember[]> {
  return new Map([
    [CLASS_5A_GROUP, [memberOf(SARA), memberOf(TIM)]],
    [TEACHERS_GROUP, [memberOf(ANNA), memberOf(BERND), memberOf(CARLA)]],
  ])
}

/** `accepted` is the list of tokens the stand-in for Entra issued; a bearer token not in it is refused with 401. */
export async function startFakeGraph(accepted: readonly string[], groups = defaultGroups()): Promise<FakeGraph> {
  const requests: string[] = []
  let baseUrl = ''
  const names = new Map([[CLASS_5A_GROUP, 'Klasse 5A'], [TEACHERS_GROUP, 'Lehrkräfte']])
  const graph: FakeGraph = { baseUrl, groups, names, pageSize: 999, requests, close: async () => {} }

  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`)
    const url = new URL(request.url ?? '/', baseUrl)
    const match = /^\/v1\.0\/groups\/([^/]+)\/members$/.exec(url.pathname)
    const token = request.headers.authorization?.replace(/^Bearer /, '')
    if (token === undefined || !accepted.includes(token)) return json(response, 401, { error: { code: 'InvalidAuthenticationToken' } })
    if (graph.failWith !== undefined) return json(response, graph.failWith, { error: { code: 'Failed' } })
    if (request.method === 'GET' && url.pathname === '/v1.0/groups') {
      // The picker's search: startswith(displayName,'…') over the groups' names, which here are their labels.
      const prefix = /^startswith\(displayName,'(.*)'\)$/.exec(url.searchParams.get('$filter') ?? '')?.[1]?.replaceAll('\'\'', '\'') ?? ''
      const value = [...graph.groups.keys()]
        .map((id) => ({ id, displayName: graph.names.get(id) ?? `Gruppe ${id.slice(0, 8)}`, description: null }))
        .filter((group) => group.displayName.toLowerCase().startsWith(prefix.toLowerCase()))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
      return json(response, 200, { value })
    }
    if (request.method !== 'GET' || !match) return json(response, 404, { error: { code: 'ResourceNotFound' } })
    const members = graph.groups.get(decodeURIComponent(match[1] ?? ''))
    if (!members) return json(response, 404, { error: { code: 'Request_ResourceNotFound' } })
    const skip = Number(url.searchParams.get('$skiptoken') ?? '0')
    const page = members.slice(skip, skip + graph.pageSize).map((member) => ({
      ...(member.type === null ? {} : { '@odata.type': member.type ?? '#microsoft.graph.user' }),
      id: member.id,
      displayName: member.displayName ?? null,
      mail: member.mail ?? null,
      userPrincipalName: member.userPrincipalName ?? null,
    }))
    const body: Record<string, unknown> = { value: page }
    if (skip + graph.pageSize < members.length) {
      // As Graph does: the same request, query as it was, with a skip token.
      const query = url.search.replace(/[&?]\$skiptoken=\d+/, '')
      body['@odata.nextLink'] = `${baseUrl}${url.pathname}${query}${query === '' ? '?' : '&'}$skiptoken=${skip + graph.pageSize}`
    }
    return json(response, 200, body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  graph.baseUrl = baseUrl
  graph.close = () => new Promise((resolve) => server.close(() => resolve()))
  return graph
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

export type { IncomingMessage }
