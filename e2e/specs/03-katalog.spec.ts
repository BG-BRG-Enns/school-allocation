// Der Katalog: die Organisation legt eine Wahl an und sammelt Aktivitäten,
// eine Lehrkraft reicht eine ein, die Organisation genehmigt und
// veröffentlicht, und Schüler/innen lesen den nummerierten Katalog. Baut
// auf der Personenliste aus 02-stammdaten auf (Anna organisiert als
// Administratorin, Bernd ist Lehrkraft, Sara Schülerin der 5A).

import { expect, test } from '../support/test.ts'
import { ANNA, BERND, SARA } from '../support/personas.ts'
import { shot } from '../support/screenshot.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

test('die Organisation legt die Wahl an und öffnet sie für Aktivitäten', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await expect(page.getByRole('heading', { name: 'Wahlen' })).toBeVisible()
  await page.getByLabel('Bezeichnung').fill('Projektwoche 2027')
  await page.getByLabel('Schuljahr').fill('2026/27')
  await page.getByLabel('Projekttag 1').fill('2027-06-21')
  await page.getByRole('button', { name: 'Tag hinzufügen' }).click()
  await page.getByLabel('Projekttag 2').fill('2027-06-22')
  await shot(page, '13-wahl-anlegen')
  await page.getByRole('button', { name: 'Wahl anlegen' }).click()
  await expect(page.getByRole('heading', { name: 'Projektwoche 2027' })).toBeVisible()
  await expect(page.getByText('In Vorbereitung')).toBeVisible()
  await shot(page, '14-wahl-in-vorbereitung')
  await page.getByRole('button', { name: 'Aktivitäten sammeln' }).click()
  await expect(page.getByText('Aktivitäten werden gesammelt')).toBeVisible()
  await signOut(page)
})

test('eine Lehrkraft reicht eine Aktivität ein; die Organisation genehmigt und veröffentlicht', async ({ page }) => {
  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('link', { name: 'Neue Aktivität' }).click()
  await expect(page.getByRole('heading', { name: 'Neue Aktivität' })).toBeVisible()
  await page.getByLabel('Titel').fill('Klettern')
  await page.getByLabel('Beschreibung').fill('Kletterhalle, Ausrüstung wird gestellt.')
  await page.getByLabel('Beginn am').fill('2027-06-21')
  await page.getByLabel('Beginn am').dispatchEvent('change')
  await page.getByLabel('Ende am').fill('2027-06-21')
  await page.getByLabel('um').first().fill('09:00')
  await page.getByLabel('um').last().fill('13:00')
  await page.getByLabel(/Minuten am/).fill('210')
  await page.getByLabel('Plätze', { exact: true }).fill('12')
  await page.getByLabel('Mindestteilnehmer/innen').fill('6')
  await page.getByLabel('Beitrag in Euro').fill('15,00')
  await shot(page, '15-neue-aktivitaet')
  await page.getByRole('button', { name: 'Speichern und einreichen' }).click()
  await expect(page.getByRole('heading', { name: 'Projektwoche 2027' })).toBeVisible()
  const row = page.getByRole('row', { name: /Klettern/ })
  await expect(row).toContainText('Eingereicht')
  await expect(row).toContainText(BERND.name)
  await expect(row).toContainText('15,00 €')
  await shot(page, '16-wahl-eingereicht')
  await signOut(page)

  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('row', { name: /Klettern/ }).getByRole('button', { name: 'Genehmigen' }).click()
  await expect(page.getByRole('row', { name: /Klettern/ })).toContainText('Genehmigt')
  await page.getByRole('button', { name: 'Katalog veröffentlichen' }).click()
  await expect(page.getByText('Katalog veröffentlicht')).toBeVisible()
  await expect(page.getByRole('row', { name: /Klettern/ })).toContainText('1')
  await expect(page.getByRole('link', { name: 'Katalog als Excel' })).toBeVisible()
  await shot(page, '17-katalog-veroeffentlicht')
  await signOut(page)
})

test('Schüler/innen lesen den veröffentlichten Katalog mit Nummern', async ({ page }) => {
  await openAs(page, SARA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await expect(page.getByRole('link', { name: 'Neue Aktivität' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Katalog ansehen' }).click()
  await expect(page.getByRole('heading', { name: 'Katalog Projektwoche 2027' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '1 · Klettern' })).toBeVisible()
  await expect(page.getByText('12 Plätze · für alle Schulstufen · Beitrag 15,00 €')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Drucken' })).toBeVisible()
  await shot(page, '18-katalog')
  await signOut(page)
})
