// Die Wahl: die Organisation öffnet sie, eine Schülerin gibt ihre Wünsche
// ab und ist vollständig, die Organisation sieht den Wahlstand und gibt
// für einen Schüler ein, der Klassenvorstand sieht den Stand seiner
// Klasse, die Mailvorlagen lassen sich ändern. Baut auf 03-katalog und
// 04-einstellungen auf (Bernd ist Klassenvorstand der 5A).

import { expect, test } from '../support/test.ts'
import { refused } from '../support/console.ts'
import { ANNA, BERND, SARA, TIM } from '../support/personas.ts'
import { shot } from '../support/screenshot.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

test('die Organisation öffnet die Wahl; eine Schülerin gibt ihre Wünsche ab und ist vollständig', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('button', { name: 'Wahl öffnen' }).click()
  await expect(page.getByText('Wahl läuft')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Wahlstand' })).toBeVisible()
  await expect(page.getByText('2 Schüler/innen, 2 ohne vollständige Wünsche.')).toBeVisible()
  await shot(page, '24-wahl-geoeffnet')
  await signOut(page)

  await openAs(page, SARA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('link', { name: 'Wünsche abgeben oder ändern' }).click()
  await expect(page.getByRole('heading', { name: 'Meine Wünsche' })).toBeVisible()
  await expect(page.getByText('0 von 1 Wünschen')).toBeVisible()
  await page.getByLabel('Wunsch Klettern').selectOption('1')
  await expect(page.getByText('1 von 1 Wünschen')).toBeVisible()
  await shot(page, '25-wuensche')
  await page.getByRole('button', { name: 'Wünsche speichern' }).click()
  await expect(page.getByRole('status')).toHaveText('Gespeichert.')
  await expect(page.getByText('vollständig', { exact: true })).toBeVisible()
  await expect(page.getByText('gespeichert im Anmeldefenster, Fassung 1')).toBeVisible()
  await signOut(page)
})

test('die Organisation gibt für einen Schüler ein; der Klassenvorstand sieht den Stand seiner Klasse', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await expect(page.getByText('2 Schüler/innen, 1 ohne vollständige Wünsche.')).toBeVisible()
  const tim = page.getByRole('row', { name: new RegExp(TIM.name) })
  await expect(tim).toContainText('keine Wünsche')
  await tim.getByRole('link', { name: 'Eingeben' }).click()
  await expect(page.getByRole('heading', { name: 'Wünsche eingeben' })).toBeVisible()
  await expect(page.getByText(`Im Namen von ${TIM.name} (5A)`)).toBeVisible()
  await page.getByLabel('Wunsch Klettern').selectOption('1')
  // Without a reason the form does not submit; with one it is recorded.
  await page.getByLabel('Begründung').fill('Tim war krank')
  await page.getByRole('button', { name: 'Wünsche speichern' }).click()
  await expect(page.getByRole('status')).toHaveText('Gespeichert.')
  await shot(page, '26-im-namen')
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('link', { name: 'Meine Klasse 5A' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: SARA.name })).toContainText('vollständig')
  await expect(page.getByRole('listitem').filter({ hasText: TIM.name })).toContainText('vollständig')
  await shot(page, '27-klasse-wahlstand')
  await signOut(page)
})

test('die Administration ändert eine Mailvorlage; ein falscher Platzhalter wird abgewiesen', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung')
  await page.getByRole('link', { name: 'Mailvorlagen' }).click()
  await expect(page.getByRole('heading', { name: 'Erinnerung vor Ende der Wahl' })).toBeVisible()
  await expect(page.getByText('Der Mailversand ist auf diesem Server nicht eingerichtet')).toBeVisible()
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Erinnerung vor Ende der Wahl' }) })
  await section.getByRole('button', { name: 'Bearbeiten' }).click()
  const form = page.getByRole('form', { name: 'Erinnerung vor Ende der Wahl bearbeiten' })
  await form.getByLabel('Text').fill('Hallo {{vorname}}, bitte bis {{frist}}: {{link}} ({{klasse}})')
  await refused(page, 422, () => form.getByRole('button', { name: 'Speichern' }).click())
  await expect(page.getByRole('alert')).toContainText('Unbekannter Platzhalter: klasse')
  await form.getByLabel('Text').fill('Hallo {{vorname}}, bitte bis {{frist}}: {{link}}')
  await form.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('status')).toHaveText('Vorlage gespeichert.')
  await expect(section.getByText('Hallo {{vorname}}, bitte bis {{frist}}: {{link}}')).toBeVisible()
  await shot(page, '28-mailvorlagen')
  await signOut(page)
})
