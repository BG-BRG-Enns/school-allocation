// The one way the pages talk to the API: same-origin JSON, with the
// browser's cookies, every body as JSON (the API refuses other bodies),
// and the same handling of a refusal everywhere. A 401 means the session
// is gone: the browser goes to the sign-in page and comes back to this
// one. A 204 is an answer without content, undefined to the caller.

import { endpointPath, type Endpoint, type EndpointInput, type EndpointResponse } from '@school-allocation/api-contracts/endpoint'

import { ApiError, problemOf, signInUrl } from './api-rules.ts'
import { withBase } from './base.ts'

let goToSignIn: () => void = () => window.location.assign(withBase(signInUrl(window.location.pathname + window.location.search)))

/** How a 401 takes the browser to sign-in: the app registers the router, so it is a navigation within the app. */
export function onUnauthenticated(handler: () => void): void {
  goToSignIn = handler
}

/** The selected endpoint determines its URL, method, body and successful response. */
export async function apiRequest<E extends Endpoint & { transport: 'json' | 'empty' }>(endpoint: E, input: EndpointInput<NoInfer<E>>): Promise<EndpointResponse<E>> {
  const response = await send(endpoint.method, endpointPath(endpoint, input), input.body)
  // The server validates and serializes against this same endpoint's schema.
  if (response.status === 204) return undefined as EndpointResponse<E>
  return response.json() as Promise<EndpointResponse<E>>
}

/** The request, with a refusal thrown and a 401 sent to sign-in; the response for the caller to read. */
async function send(method: string, path: string, body?: unknown): Promise<Response> {
  // A request without a body carries no content type: the API would refuse
  // an empty JSON body, and some routes take none.
  const headers: Record<string, string> = { accept: 'application/json' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(withBase(path), {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 401) {
    goToSignIn()
    throw new ApiError(401, 'unauthenticated')
  }
  if (!response.ok) {
    throw problemOf(response.status, await response.json().catch(() => ({})))
  }
  return response
}
