// Anwesenheit und Abschluss: der Klassenvorstand trägt am Sporttag für seine
// Klasse die Anwesenheit ein und lädt die Liste; die Organisation schließt
// die Anmeldung danach ab; die Administration sieht, wie lange die Daten
// des Schuljahrs bleiben (bis 1. September 2035). Baut auf 07 auf (die
// Sportwoche ist veröffentlicht; Sara ist in Bogenschießen, Tim in Werken
// und Schach).

import { expect, test } from '../support/test.ts'
import { setClock } from '../support/clock.ts'
import { day, t } from '../support/messages.ts'
import { ANNA, BERND, SARA, TIM } from '../support/personas.ts'
import { picture, section, shot } from '../support/screenshot.ts'
import { sample } from '../support/sample.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

const NAME = sample.sportsWeek

test('der Klassenvorstand trägt die Anwesenheit seiner Klasse ein und lädt die Liste', async ({ page }) => {
  await setClock(page, '2034-06-26T15:00:00+02:00')
  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: NAME }).click()
  await page.getByRole('link', { name: t.campaign.myClass('5A') }).click()
  const attendance = t.schoolClass.attendance
  await expect(page.getByRole('heading', { name: attendance.heading })).toBeVisible()
  const monday = page.getByRole('form', { name: attendance.ofDay(day('2034-06-26')) })
  await monday.getByLabel(attendance.statusOf(SARA.name, sample.archery)).selectOption('present')
  await monday.getByLabel(attendance.statusOf(TIM.name, sample.chess)).selectOption('absent')
  await monday.getByRole('button', { name: attendance.save }).click()
  await expect(page.getByRole('status')).toHaveText(t.schoolClass.attendanceSaved)
  await expect(monday.getByLabel(attendance.statusOf(TIM.name, sample.chess))).toHaveValue('absent')
  // Recorded means recorded: the empty choice is gone for these two, and still there for what nobody has marked.
  await expect(monday.getByLabel(attendance.statusOf(TIM.name, sample.chess)).getByRole('option', { name: '–' })).toBeDisabled()
  await expect(monday.getByLabel(attendance.statusOf(TIM.name, sample.woodwork)).getByRole('option', { name: '–' })).toBeEnabled()
  await shot(page, '38-anwesenheit')
  await picture(page, 'anwesenheit', section(page, attendance.heading))
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: attendance.export }).click()
  expect((await download).suggestedFilename()).toBe(t.files.classAttendance('5A', '2033-34'))
  await signOut(page)
})

test('die Organisation schließt die Anmeldung ab; danach ist alles nur noch zu lesen', async ({ page }) => {
  await setClock(page, '2034-06-30T10:00:00+02:00')
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
  await expect(page.getByLabel(t.schoolClass.attendance.statusOf(SARA.name, sample.archery))).toBeDisabled()
  await expect(page.getByRole('button', { name: t.schoolClass.attendance.save })).toHaveCount(0)
  await signOut(page)
})

test('die Administration sieht die Schuljahre mit ihren Daten; vor dem Ende der Aufbewahrung lässt sich keines löschen', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung')
  await page.getByRole('link', { name: t.common.page.retention }).click()
  await expect(page.getByRole('heading', { name: t.common.page.retention })).toBeVisible()
  const year = page.getByRole('row', { name: /^2033\/34/ })
  await expect(year).toContainText(sample.projectWeek)
  await expect(year).toContainText(`${NAME} ${t.labels.campaignState.archived}`)
  await expect(year).toContainText(day('2035-09-01'))
  // Kept until a year after the school year ends: the year is offered for deletion, but cannot be chosen yet.
  await expect(page.getByLabel(t.common.field.schoolYear).getByRole('option', { name: `2033/34 – ${t.retention.purge.stillRetained}` })).toBeDisabled()
  await picture(page, 'aufbewahrung', page.locator('main'))
  await signOut(page)
})
