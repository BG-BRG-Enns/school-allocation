import type { Static, TSchema } from 'typebox'
import type { EndpointMetadata } from './endpoint-metadata.ts'

export interface EndpointSchema {
  body?: TSchema
  params?: TSchema
  querystring?: TSchema
  response?: Record<string | number, TSchema>
}

export interface Endpoint extends EndpointMetadata {
  schema: EndpointSchema
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
