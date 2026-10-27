// Anmelden und Abmelden: wer nicht angemeldet ist, landet auf der
// Anmeldeseite und kommt nach der Anmeldung dorthin, wo er hinwollte.

import { expect, test } from '../support/test.ts'
import { ANNA, SARA } from '../support/personas.ts'
import { at, encodedPath, urlOf } from '../support/base.ts'
import { apiGet } from '../support/api.ts'
import { openAs, signInAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

test('wer nicht angemeldet ist, landet auf der Anmeldeseite und kommt angemeldet zur Startseite', async ({ page }) => {
  await page.goto(at('/'))
  await expect(page).toHaveURL(new RegExp(`/anmelden\\?returnTo=${encodedPath('/')}$`))
  await expect(page).toHaveTitle('Anmeldung – SchulWahl')
  await signInAs(page, ANNA)
  await expect(page).toHaveURL(urlOf('/'))
  await expect(page.getByRole('heading', { name: 'Startseite' })).toBeVisible()
  await expect(page).toHaveTitle('Startseite – SchulWahl')
  await expect(page.getByText(`Angemeldet als ${ANNA.name}`)).toBeVisible()
  await signOut(page)
  await expect(page.getByRole('navigation', { name: 'Konto' })).toHaveCount(0)
})

test('ein Link in die App führt nach der Anmeldung dorthin; das Konto zeigt, wofür die App die Person hält', async ({ page }) => {
  await page.goto(at('/konto'))
  await expect(page).toHaveURL(new RegExp(`/anmelden\\?returnTo=${encodedPath('/konto')}$`))
  await signInAs(page, SARA)
  await expect(page).toHaveURL(urlOf('/konto'))
  await expect(page.getByRole('heading', { name: 'Mein Konto' })).toBeVisible()
  await expect(page.getByText('Keine besonderen Rollen.')).toBeVisible()
  const me = await apiGet<{ displayName: string, roles: string[] }>(page, '/api/auth/me')
  expect(me.status).toBe(200)
  expect(me.body).toMatchObject({ displayName: SARA.name, roles: [] })
})

test('wer angemeldet ist, wird von der Anmeldeseite gleich weitergeleitet', async ({ page }) => {
  await openAs(page, ANNA, '/konto')
  await page.goto(at('/anmelden?returnTo=%2F'))
  await expect(page).toHaveURL(urlOf('/'))
  await expect(page.getByRole('heading', { name: 'Startseite' })).toBeVisible()
})
