// Pictures of the journeys' steps, of two kinds. A normal run takes
// neither. Notices are part of the page here, not toasts over it, so
// nothing is hidden for a picture.
//
// - Full-page screenshots, named in order, for a quick look at the whole
//   app without clicking through it: `shot`, when SCREENSHOT_DIR is set
//   (npm run e2e:screenshots, into a folder git ignores).
// - The handbooks' pictures, cut to what a step shows: `picture`, when
//   HANDBOOK_SHOTS is set (npm run handbook:shots, which runs the journeys
//   in German and in English), into handbook/public/bilder/<language>,
//   where they are committed. The handbooks refer to them by name.

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { LOCALE } from './messages.ts'

export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SCREENSHOT_DIR
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
}

/** The handbooks' languages; formal German has no handbook of its own. */
const HANDBOOK_LANGUAGES: readonly string[] = ['de', 'en']

/**
 * The handbook's picture `name` (handbook/public/bilder/<language>/<name>.png):
 * the page cut to the box around every element of `of`, with `pad` pixels
 * around it, at the journeys' 1280 pixels and a device scale of 1.
 */
export async function picture(page: Page, name: string, of: Locator | readonly Locator[], pad = 16): Promise<void> {
  if (!process.env.HANDBOOK_SHOTS) return
  if (!HANDBOOK_LANGUAGES.includes(LOCALE)) throw new Error(`The handbooks are in ${HANDBOOK_LANGUAGES.join(' and ')}, not ${LOCALE}`)
  // From the top of the page, where a box's position in the viewport is its position in the page, which the clip needs.
  await page.evaluate(() => window.scrollTo(0, 0))
  const boxes = []
  for (const locator of [of].flat()) {
    const box = await locator.boundingBox()
    if (box === null) throw new Error(`An element of the picture ${name} is not on the page`)
    boxes.push(box)
  }
  const extent = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
  const left = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad)
  const top = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad)
  const right = Math.min(extent.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad)
  const bottom = Math.min(extent.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad)
  const dir = path.join(import.meta.dirname, '..', '..', 'handbook', 'public', 'bilder', LOCALE)
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true, clip: { x: left, y: top, width: right - left, height: bottom - top } })
}

/** The innermost section of the page under the heading `name`: what a picture usually shows. */
export function section(page: Page, name: string | RegExp): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) }).last()
}
