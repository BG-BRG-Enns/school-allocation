import type { FastifyRequest, RouteOptions } from 'fastify'
import assert from 'node:assert/strict'

/** Every exercised JSON success response must survive serialization unchanged.
 * This catches omitted properties and changed nullability when a schema is added.
 * Buffers, redirects and empty responses keep their own transport semantics.
 */
export function preserveResponseShape(route: RouteOptions): void {
  const before = new WeakMap<FastifyRequest, unknown>()
  route.preSerialization = [...(route.preSerialization ? [route.preSerialization].flat() : []), async (request, reply, payload) => {
    if (reply.statusCode >= 200 && reply.statusCode < 300 && payload !== null && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
      before.set(request, JSON.parse(JSON.stringify(payload)) as unknown)
    }
    return payload
  }]
  route.onSend = [...(route.onSend ? [route.onSend].flat() : []), async (request, reply, payload) => {
    if (before.has(request) && reply.statusCode >= 200 && reply.statusCode < 300 && typeof payload === 'string') {
      assert.deepEqual(JSON.parse(payload) as unknown, before.get(request), `${request.method} ${route.url}: response schema changed the payload`)
    }
    return payload
  }]
}
