// Die Einstellungen der Schule und der Wahl: das Stundenraster, die
// Klassenvorstände (die ihre Klasse in der Wahl sehen), die Gruppensuche
// bei Microsoft für die Personenliste, das Wahlfenster und der Bedarf je
// Tag und Schulstufe. Baut auf 02-stammdaten und 03-katalog auf.

import { expect, test } from '../support/test.ts'
import { refused } from '../support/console.ts'
import { ANNA, BERND, SARA, TIM } from '../support/personas.ts'
import { shot } from '../support/screenshot.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

test('die Administration passt das Stundenraster an', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung')
  await page.getByRole('link', { name: 'Stundenraster' }).click()
  await expect(page.getByRole('heading', { name: 'Stundenraster' })).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(11)
  await expect(page.getByLabel('Beginn 2. Einheit')).toHaveValue('08:30')
  await shot(page, '19-stundenraster')
  await page.getByRole('button', { name: 'Letzte entfernen' }).click()
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('status')).toHaveText('Stundenraster gespeichert.')
  await expect(page.getByRole('row')).toHaveCount(10)
  // A reversed period is refused with its rule.
  await page.getByLabel('Ende 1. Einheit').fill('07:00')
  await refused(page, 422, () => page.getByRole('button', { name: 'Speichern' }).click())
  await expect(page.getByRole('alert')).toContainText('Eine Einheit endet nicht nach ihrem Beginn')
  await signOut(page)
})

test('die Administration ordnet einen Klassenvorstand zu, der seine Klasse in der Wahl sieht', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung/klassen')
  await expect(page.getByRole('heading', { name: 'Klassenvorstände' })).toBeVisible()
  await expect(page.getByRole('row', { name: /5A/ })).toContainText('–')
  await page.getByRole('row', { name: /5A/ }).getByRole('button', { name: 'Zuordnen' }).click()
  const panel = page.getByRole('form', { name: 'Klassenvorstand der 5A zuordnen' })
  await panel.getByLabel('Lehrkraft hinzufügen').fill('Bernd')
  await panel.getByRole('button', { name: `${BERND.name} hinzufügen` }).click()
  await shot(page, '20-klassenvorstand-zuordnen')
  await panel.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('status')).toHaveText('Klassenvorstände gespeichert.')
  await expect(page.getByRole('row', { name: /5A/ })).toContainText(BERND.name)
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('link', { name: 'Meine Klasse 5A' }).click()
  await expect(page.getByRole('heading', { name: 'Klasse 5A' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Schüler/innen (2)' })).toBeVisible()
  await expect(page.getByText(SARA.name)).toBeVisible()
  await expect(page.getByText(TIM.name)).toBeVisible()
  await shot(page, '21-meine-klasse')
  await signOut(page)
})

test('die Administration findet eine Entra-Gruppe über die Suche bei Microsoft', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung/stammdaten')
  await page.getByRole('link', { name: 'Gruppen bei Microsoft suchen' }).click()
  await expect(page.getByRole('heading', { name: 'Anmeldung (Test)' })).toBeVisible()
  await page.getByRole('button', { name: ANNA.name }).click()
  await expect(page.getByRole('heading', { name: 'Gruppen suchen' })).toBeVisible()
  await page.getByLabel('Name der Gruppe beginnt mit').fill('Klasse 6')
  await page.getByRole('button', { name: 'Klasse 6A übernehmen' }).click()
  await expect(page.getByLabel('Gruppen-ID Klasse 6A')).toHaveValue('33333333-3333-4333-8333-333333333333')
  await expect(page.getByLabel('Klasse Klasse 6A')).toHaveValue('6A')
  await expect(page.getByLabel('Schulstufe Klasse 6A')).toHaveValue('10')
  // All the groups named after a class at once, class and Schulstufe filled in.
  await page.getByRole('button', { name: 'Alle Klassengruppen suchen' }).click()
  await expect(page.getByRole('button', { name: '7B übernehmen' })).toBeVisible()
  await shot(page, '22-gruppen-suchen')
  await page.getByRole('button', { name: 'Alle 2 Gruppen übernehmen' }).click()
  await expect(page.getByLabel('Klasse 7B')).toHaveValue('7B')
  await expect(page.getByLabel('Schulstufe 7B')).toHaveValue('11')
  await expect(page.getByLabel('Gruppen-ID 8C')).toHaveValue('55555555-5555-4555-8555-555555555555')
  await expect(page.getByLabel('Schulstufe 8C')).toHaveValue('12')
  await expect(page.getByRole('button', { name: 'Alle Klassengruppen suchen' })).toBeVisible()
  await signOut(page)
})

test('die Organisation legt das Wahlfenster fest und sieht den Bedarf je Tag und Schulstufe', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await expect(page.getByRole('heading', { name: 'Bedarf' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Mo., 21.06.2027/ })).toContainText('2 brauchen · 12 angeboten')
  await page.getByRole('button', { name: 'Einstellungen ändern' }).click()
  const form = page.getByRole('form', { name: 'Einstellungen der Wahl' })
  await expect(form.getByLabel('Bezeichnung')).toBeDisabled()
  await form.getByLabel('Beginn', { exact: true }).fill('2027-03-01T08:00')
  await form.getByLabel('Ende', { exact: true }).fill('2027-03-08T20:00')
  await form.getByLabel('Nachfrist bis').fill('2027-03-12T20:00')
  await form.getByLabel('Wünsche je Zeitgruppe').fill('3')
  await form.getByLabel('Mindestminuten je Tag, 9. Schulstufe').fill('240')
  await shot(page, '23-wahlfenster')
  await form.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('status')).toHaveText('Gespeichert.')
  await expect(page.getByText('Wahl von Mo., 01.03., 08:00 bis Mo., 08.03., 20:00, Nachfrist bis Fr., 12.03., 20:00 · 3 Wünsche je Zeitgruppe')).toBeVisible()
  await signOut(page)
})
