import type { Endpoint, EndpointResponse, Part } from '@school-allocation/api-contracts/endpoint'
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify'

type ReadonlyPayload<T> = T extends object ? { readonly [K in keyof T]: ReadonlyPayload<T[K]> } : T

type RequestOf<E extends Endpoint> = { Body: Part<E, 'body'>, Params: Part<E, 'params'>, Querystring: Part<E, 'querystring'> }

/** One descriptor supplies method, URL, schemas and request types. HTTP hooks stay local. */
export function registerEndpoint<E extends Endpoint>(app: FastifyInstance, endpoint: E, options: Omit<RouteShorthandOptions, 'schema'>, handler: (request: FastifyRequest<RequestOf<E>>, reply: FastifyReply) => ReadonlyPayload<EndpointResponse<E>> | FastifyReply | void | Promise<ReadonlyPayload<EndpointResponse<E>> | FastifyReply | void>): void {
  app.route<RequestOf<E>>({ ...options, method: endpoint.method, url: endpoint.path, schema: endpoint.schema, handler })
}
