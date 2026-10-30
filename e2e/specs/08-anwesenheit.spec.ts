// Anwesenheit und Abschluss: der Klassenvorstand trägt für seine Klasse
// die Anwesenheit der Sportwoche ein und lädt die Liste; die Organisation
// schließt die Wahl ab. Baut auf 07 auf (die Sportwoche ist veröffentlicht,
// Sara ist in Bogenschießen und Schach, Tim in Werken).

import { expect, test } from '../support/test.ts'
import { ANNA, BERND, SARA } from '../support/personas.ts'
import { shot } from '../support/screenshot.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

const NAME = 'Sportwoche 2027'

test('der Klassenvorstand trägt die Anwesenheit seiner Klasse ein und lädt die Liste', async ({ page }) => {
  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: NAME }).click()
  await page.getByRole('link', { name: 'Meine Klasse 5A' }).click()
  await expect(page.getByRole('heading', { name: 'Anwesenheit' })).toBeVisible()
  const day = page.getByRole('form', { name: 'Anwesenheit Mo., 28.06.2027' })
  await day.getByLabel(`Anwesenheit ${SARA.name}, Bogenschießen`).selectOption('present')
  await day.getByLabel(`Anwesenheit ${SARA.name}, Schach`).selectOption('absent')
  await day.getByRole('button', { name: 'Anwesenheit speichern' }).click()
  await expect(page.getByRole('status')).toHaveText('Anwesenheit gespeichert.')
  await expect(day.getByLabel(`Anwesenheit ${SARA.name}, Schach`)).toHaveValue('absent')
  await shot(page, '38-anwesenheit')
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Anwesenheit als Excel' }).click()
  expect((await download).suggestedFilename()).toBe('anwesenheit-5A-2026-27.xlsx')
  await signOut(page)
})

test('die Organisation schließt die Wahl ab; danach ist alles nur noch zu lesen', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: NAME }).click()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Wahl abschließen' }).click()
  await expect(page.getByText('Abgeschlossen', { exact: true })).toBeVisible()
  await shot(page, '39-abgeschlossen')
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: NAME }).click()
  await page.getByRole('link', { name: 'Meine Klasse 5A' }).click()
  await expect(page.getByRole('heading', { name: 'Anwesenheit' })).toBeVisible()
  await expect(page.getByLabel(`Anwesenheit ${SARA.name}, Bogenschießen`)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Anwesenheit speichern' })).toHaveCount(0)
  await signOut(page)
})
