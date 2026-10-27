// Full-page screenshots of the journeys' steps, named in order, for a quick
// look at the app without clicking through it. Only when SCREENSHOT_DIR is
// set (npm run e2e:screenshots, into a folder git ignores); a normal run
// writes none. Notices are part of the page here, not toasts over it, so
// nothing is hidden for the picture.

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'

export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SCREENSHOT_DIR
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
}
