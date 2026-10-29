import type * as metadata from './endpoint-metadata.ts'
import type { Endpoint, EndpointInput, EndpointLocation, EndpointResponse } from './endpoint.ts'
import type * as descriptors from './endpoints.ts'

/** Only method/path/transport are browser values. Schemas are used exclusively as types. */
export type ClientEndpoint = typeof metadata[keyof typeof metadata]
type Descriptor = typeof descriptors[keyof typeof descriptors]
type Contract<E extends ClientEndpoint> = Extract<Descriptor, E> extends infer D extends Endpoint ? D : never
export type ClientInput<E extends ClientEndpoint> = EndpointInput<Contract<E>>
export type ClientLocation<E extends ClientEndpoint> = EndpointLocation<Contract<E>>
export type ClientResponse<E extends ClientEndpoint> = EndpointResponse<Contract<E>>

/** Relative to the app's base path. Encode each path segment and query value once. */
export function endpointPath<E extends ClientEndpoint>(endpoint: E, input: ClientLocation<NoInfer<E>>): string {
  const params = input.params as Record<string, string> | undefined
  const path = endpoint.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, key: string) => {
    const value = params?.[key]
    if (value === undefined) throw new Error(`missing path parameter: ${key}`)
    return encodeURIComponent(value)
  })
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') query.set(key, String(value))
    else if (value !== undefined) throw new Error(`query parameter must be scalar: ${key}`)
  }
  const suffix = query.toString()
  return suffix === '' ? path : `${path}?${suffix}`
}
