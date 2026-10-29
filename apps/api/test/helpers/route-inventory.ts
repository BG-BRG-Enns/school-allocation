import type { RouteOptions } from 'fastify'
import { buildTestApp } from './app.ts'
import { startFakeEntra } from './fake-entra.ts'

/** Shared by the read-only regression test and explicit fixture regeneration. */
export async function routeInventory(inspect?: (route: RouteOptions) => void): Promise<unknown> {
  const entra = await startFakeEntra()
  try {
    const routes: object[] = []
    const { app } = await buildTestApp({}, undefined, {
      entraAuthority: entra.authority,
      onRoute(route) {
        inspect?.(route)
        for (const method of [route.method].flat()) {
          if (method === 'HEAD') continue
          routes.push({ method, url: route.url, body: route.schema?.body ?? null, params: route.schema?.params ?? null, querystring: route.schema?.querystring ?? null, bodyLimit: route.bodyLimit ?? null })
        }
      },
    })
    try {
      await app.ready()
      return JSON.parse(JSON.stringify(routes.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))) as unknown
    } finally {
      await app.close()
    }
  } finally {
    await entra.close()
  }
}
