// Signing in and out the way a person does: the sign-in page's button,
// the stand-in's page with the personas, and back to the page they wanted.

import { expect, type Page } from '@playwright/test'
import { at, urlOf } from './base.ts'
import { t } from './messages.ts'
import type { Person } from './personas.ts'

/** From the app's sign-in page, where a signed-out person lands, to the app as `person`. */
export async function signInAs(page: Page, person: Person): Promise<void> {
  await expect(page.getByRole('heading', { name: t.common.page.signIn, exact: true })).toBeVisible()
  await page.getByRole('link', { name: t.signIn.signIn }).click()
  // The stand-in's own page, not the app's: its words are the test helper's.
  await expect(page.getByRole('heading', { name: 'Anmeldung (Test)' })).toBeVisible()
  await page.getByRole('button', { name: person.name }).click()
  await expect(page.getByRole('navigation', { name: t.shell.navigation })).toContainText(person.name)
}

/** Opens `path` as `person` in a page of its own, signing in on the way. */
export async function openAs(page: Page, person: Person, path: string): Promise<void> {
  await page.goto(at(path))
  await signInAs(page, person)
  await expect(page).toHaveURL(urlOf(path))
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: t.shell.signOut }).click()
  await expect(page.getByRole('heading', { name: t.common.page.signIn, exact: true })).toBeVisible()
}
