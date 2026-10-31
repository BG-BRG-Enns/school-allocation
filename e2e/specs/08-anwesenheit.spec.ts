// Anwesenheit und Abschluss: der Klassenvorstand trägt für seine Klasse
// die Anwesenheit der Sportwoche ein und lädt die Liste; die Organisation
// schließt die Anmeldung ab. Baut auf 07 auf (die Sportwoche ist veröffentlicht;
// Sara ist in Bogenschießen, Tim in Werken und Schach).

import { expect, test } from '../support/test.ts'
import { day, t } from '../support/messages.ts'
import { ANNA, BERND, SARA, TIM } from '../support/personas.ts'
import { shot } from '../support/screenshot.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

const NAME = 'Sportwoche 2027'

test('der Klassenvorstand trägt die Anwesenheit seiner Klasse ein und lädt die Liste', async ({ page }) => {
  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: NAME }).click()
  await page.getByRole('link', { name: t.campaign.myClass('5A') }).click()
  const attendance = t.schoolClass.attendance
  await expect(page.getByRole('heading', { name: attendance.heading })).toBeVisible()
  const monday = page.getByRole('form', { name: attendance.ofDay(day('2027-06-28')) })
  await monday.getByLabel(attendance.statusOf(SARA.name, 'Bogenschießen')).selectOption('present')
  await monday.getByLabel(attendance.statusOf(TIM.name, 'Schach')).selectOption('absent')
  await monday.getByRole('button', { name: attendance.save }).click()
  await expect(page.getByRole('status')).toHaveText(t.schoolClass.attendanceSaved)
  await expect(monday.getByLabel(attendance.statusOf(TIM.name, 'Schach'))).toHaveValue('absent')
  // Recorded means recorded: the empty choice is gone for these two, and still there for what nobody has marked.
  await expect(monday.getByLabel(attendance.statusOf(TIM.name, 'Schach')).getByRole('option', { name: '–' })).toBeDisabled()
  await expect(monday.getByLabel(attendance.statusOf(TIM.name, 'Werken')).getByRole('option', { name: '–' })).toBeEnabled()
  await shot(page, '38-anwesenheit')
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: attendance.export }).click()
  expect((await download).suggestedFilename()).toBe(t.files.classAttendance('5A', '2026-27'))
  await signOut(page)
})

test('die Organisation schließt die Anmeldung ab; danach ist alles nur noch zu lesen', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: NAME }).click()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: t.campaign.organization.archive }).click()
  await expect(page.getByText(t.labels.campaignState.archived, { exact: true })).toBeVisible()
  await shot(page, '39-abgeschlossen')
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: NAME }).click()
  await page.getByRole('link', { name: t.campaign.myClass('5A') }).click()
  await expect(page.getByRole('heading', { name: t.schoolClass.attendance.heading })).toBeVisible()
  await expect(page.getByLabel(t.schoolClass.attendance.statusOf(SARA.name, 'Bogenschießen'))).toBeDisabled()
  await expect(page.getByRole('button', { name: t.schoolClass.attendance.save })).toHaveCount(0)
  await signOut(page)
})
