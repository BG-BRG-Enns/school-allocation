import type { Static, TSchema } from 'typebox'

export interface EndpointSchema {
  body?: TSchema
  params?: TSchema
  querystring?: TSchema
  response?: Record<string | number, TSchema>
}

export interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  schema: EndpointSchema
  transport: 'json' | 'empty' | 'download' | 'redirect'
  /** Some JSON endpoints also answer without content. */
  optionalResponse?: boolean
}

export function defineEndpoint<const E extends Endpoint>(endpoint: E): E {
  return endpoint
}

export type Part<E extends Endpoint, K extends keyof EndpointSchema> = E['schema'] extends Record<K, infer S extends TSchema> ? Static<S> : never
type Field<E extends Endpoint, K extends keyof EndpointSchema, Name extends string> = [Part<E, K>] extends [never] ? { [P in Name]?: never } : Record<string, never> extends Part<E, K> ? { [P in Name]?: Part<E, K> } : { [P in Name]: Part<E, K> }
export type EndpointLocation<E extends Endpoint> = Field<E, 'params', 'params'> & Field<E, 'querystring', 'query'>
export type EndpointInput<E extends Endpoint> = EndpointLocation<E> & Field<E, 'body', 'body'>
type Success<R> = { [K in keyof R]: `${K & (string | number)}` extends `2${string}` ? R[K] extends TSchema ? Static<R[K]> : never : never }[keyof R]
export type EndpointResponse<E extends Endpoint> = E['transport'] extends 'empty' ? undefined : (E['schema'] extends { response: infer R } ? Success<R> : never) | (E extends { optionalResponse: true } ? undefined : never)

/** Relative to the app's base path. Encode each path segment and query value once. */
export function endpointPath<E extends Endpoint>(endpoint: E, input: EndpointLocation<E>): string {
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
