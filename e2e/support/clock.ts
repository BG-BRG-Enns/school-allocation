// The journeys' time: the harness's clock (e2e/harness/server.ts), which
// the server, its database and the stand-in for Entra ID read, and the
// browser's, which follows it. The story starts on Monday 7 November 2033
// at 08:00 in Vienna, when teachers propose their activities, for the
// project days of 3 to 5 July 2034; a journey moves the clock on to where
// its part takes place. Only while nobody is signed in: a session lasts
// eight hours on this clock, so a jump signs everyone out.

import type { BrowserContext, Page } from '@playwright/test'

/** The harness's control port: E2E_CONTROL_PORT, or the one above the app's. */
export const CONTROL_PORT = Number(process.env.E2E_CONTROL_PORT ?? Number(process.env.E2E_PORT ?? 3100) + 1)

/** Where the clock stands when the harness starts. */
export const STORY_STARTS = new Date('2033-11-07T08:00:00+01:00')

const CONTROL = `http://127.0.0.1:${CONTROL_PORT}`

/** A request to the harness's control port, failing on anything but success. */
export async function control<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
  const response = await fetch(`${CONTROL}${path}`, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
  if (!response.ok) throw new Error(`clock control ${method} ${path}: ${response.status} ${await response.text()}`)
  return await response.json() as T
}

/** Sets the browser's clock in `context` to the harness's; every context starts with it (support/test.ts). */
export async function followClock(context: BrowserContext): Promise<void> {
  const { at } = await control<{ at: string }>('GET', '/clock')
  await context.clock.setFixedTime(new Date(at))
}

/** Moves the clock to `at` (ISO 8601 with its offset), the harness's and the browser's of `page`. */
export async function setClock(page: Page, at: string): Promise<void> {
  const to = new Date(at)
  if (Number.isNaN(to.getTime()) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(at)) throw new Error(`not a time with its offset: ${at}`)
  await control('POST', '/clock', { at: to.toISOString() })
  await page.context().clock.setFixedTime(to)
}

/** Runs the scheduler once, at the clock's time: what is due opens or closes, and the reminders due are queued. */
export function runTick(): Promise<{ transitions: number, reminders: number }> {
  return control('POST', '/tick')
}
