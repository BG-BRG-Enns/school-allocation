// Einloggen und Ausloggen: wer nicht eingeloggt ist, landet auf der
// Login-Seite und kommt nach dem Einloggen dorthin, wo er hinwollte.

import { expect, test } from '../support/test.ts'
import { ANNA, SARA } from '../support/personas.ts'
import { at, encodedPath, urlOf } from '../support/base.ts'
import { apiGet } from '../support/api.ts'
import { LOCALE, t } from '../support/messages.ts'
import { handbookLink } from '../../apps/web/src/lib/handbook.ts'
import { shot } from '../support/screenshot.ts'
import { openAs, signInAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

test('wer nicht eingeloggt ist, landet auf der Login-Seite und kommt eingeloggt zur Startseite', async ({ page }) => {
  await page.goto(at('/'))
  await expect(page).toHaveURL(new RegExp(`/anmelden\\?returnTo=${encodedPath('/')}$`))
  await expect(page).toHaveTitle(`${t.common.page.signIn} – ${t.common.appName}`)
  await shot(page, '01-anmeldung')
  await signInAs(page, ANNA)
  await expect(page).toHaveURL(urlOf('/'))
  await expect(page.getByRole('heading', { name: t.common.page.start })).toBeVisible()
  await expect(page).toHaveTitle(`${t.common.page.start} – ${t.common.appName}`)
  await expect(page.getByText(`${t.start.signedInAs} ${ANNA.name}`)).toBeVisible()
  // Help is the handbook of the person's role, in a tab of its own: Anna administers the school.
  const help = page.getByRole('link', { name: t.shell.help })
  await expect(help).toHaveAttribute('href', handbookLink({ roles: ['school_admin'], person: null }, LOCALE) ?? '')
  await expect(help).toHaveAttribute('target', '_blank')
  await shot(page, '02-startseite')
  await signOut(page)
  await expect(page.getByRole('navigation', { name: t.shell.navigation })).toHaveCount(0)
})

test('ein Link in die App führt nach der Anmeldung dorthin; das Konto zeigt, wofür die App die Person hält', async ({ page }) => {
  await page.goto(at('/konto'))
  await expect(page).toHaveURL(new RegExp(`/anmelden\\?returnTo=${encodedPath('/konto')}$`))
  await signInAs(page, SARA)
  await expect(page).toHaveURL(urlOf('/konto'))
  await expect(page.getByRole('heading', { name: t.common.page.account })).toBeVisible()
  await expect(page.getByText(t.account.noRoles)).toBeVisible()
  await shot(page, '03-mein-konto')
  const me = await apiGet<{ displayName: string, roles: string[] }>(page, '/api/auth/me')
  expect(me.status).toBe(200)
  expect(me.body).toMatchObject({ displayName: SARA.name, roles: [] })
})

test('wer eingeloggt ist, wird von der Login-Seite gleich weitergeleitet', async ({ page }) => {
  await openAs(page, ANNA, '/konto')
  await page.goto(at('/anmelden?returnTo=%2F'))
  await expect(page).toHaveURL(urlOf('/'))
  await expect(page.getByRole('heading', { name: t.common.page.start })).toBeVisible()
})
