// Die Zuteilung: die Organisation beendet die Wahl, berechnet einen Lauf
// gegen den Solver-Stellvertreter des Testservers und sieht die Prüfung:
// die Stufen, wer was bekommen hat, die Aktivitäten; dann veröffentlicht
// sie, die Schülerin sieht ihr Ergebnis, der Klassenvorstand die Plätze
// seiner Klasse. Baut auf 05-wahl auf (Sara hat gewählt, Tim wurde
// eingetragen; 5A ist in Wien fix; Bernd ist Klassenvorstand der 5A).

import { expect, test } from '../support/test.ts'
import { ANNA, BERND, SARA } from '../support/personas.ts'
import { shot } from '../support/screenshot.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

test('die Organisation beendet die Wahl und berechnet eine Zuteilung; die Prüfung zeigt Stufen, Plätze und Aktivitäten', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  // The daily minimum the run needs was set with the window (04-einstellungen).
  await page.getByRole('button', { name: 'Wahl beenden' }).click()
  await expect(page.getByText('Wahl beendet')).toBeVisible()
  await page.getByRole('link', { name: 'Zuteilung' }).click()
  await expect(page.getByRole('heading', { name: 'Zuteilung' })).toBeVisible()
  await expect(page.getByText('Solver bereit')).toBeVisible()
  await page.getByLabel('Seed (leer: wird gezogen)').fill('4711')
  await page.getByRole('button', { name: 'Zuteilung berechnen' }).click()
  await expect(page.getByRole('status')).toHaveText('Die Zuteilung wird berechnet.')
  const runs = page.locator('section', { has: page.getByRole('heading', { name: /^Läufe/ }) })
  await expect(page.getByRole('heading', { name: 'Lauf 1' })).toBeVisible()
  await expect(runs.getByRole('row', { name: /^1 / })).toContainText('fertig')
  await expect(page.getByRole('heading', { name: 'Stufen' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Schüler\/innen mit fehlenden Minuten/ })).toContainText('bewiesen')
  await expect(page.getByRole('heading', { name: 'Aktivitäten', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Schüler\/innen \(2\)/ })).toBeVisible()
  await shot(page, '29-zuteilung')
  // The same seed again is the same allocation, which the comparison says.
  await runs.getByRole('row', { name: /^1 / }).getByRole('button', { name: 'Wiederholen' }).click()
  await expect(page.getByRole('heading', { name: 'Lauf 2' })).toBeVisible()
  await expect(runs.getByRole('row', { name: /^2 / })).toContainText('fertig')
  await page.getByLabel('Mit Lauf').selectOption({ label: 'Lauf 1 (Seed 4711)' })
  await expect(page.getByText(/Schüler\/innen sind in Lauf 2 anders zugeteilt als in Lauf 1/)).toContainText('dieselbe Zuteilung')
  await shot(page, '30-zuteilung-vergleich')
  await signOut(page)
})

test('die Organisation veröffentlicht den Lauf; die Schülerin sieht ihr Ergebnis, der Klassenvorstand die Plätze seiner Klasse', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('link', { name: 'Zuteilung' }).click()
  await expect(page.getByRole('heading', { name: 'Lauf 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Lauf 2 veröffentlichen …' }).click()
  const confirm = page.getByRole('form', { name: 'Veröffentlichung bestätigen' })
  // Klettern needs six participants and two wanted it: the run cancelled it, and the organizer confirms that before publishing.
  await expect(confirm.getByText('Klettern')).toBeVisible()
  await expect(confirm.getByRole('button', { name: 'Jetzt veröffentlichen' })).toBeDisabled()
  await confirm.getByLabel('Ich bestätige diese Absagen.').check()
  await confirm.getByRole('button', { name: 'Jetzt veröffentlichen' }).click()
  await expect(page.getByRole('status')).toHaveText('Das Ergebnis ist veröffentlicht; die Benachrichtigungen sind unterwegs.')
  await expect(page.getByRole('heading', { name: 'Veröffentlicht' })).toBeVisible()
  await expect(page.getByText('Lauf 2 ist das Ergebnis dieser Wahl')).toBeVisible()
  await shot(page, '31-veroeffentlicht')
  await signOut(page)

  await openAs(page, SARA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await expect(page.getByText('Ergebnis veröffentlicht')).toBeVisible()
  await page.getByRole('link', { name: 'Mein Ergebnis ansehen' }).click()
  await expect(page.getByRole('heading', { name: 'Mein Ergebnis' })).toBeVisible()
  // Klettern needs six and two wanted it: cancelled by the run, so Sara has her days still to fill, which the page says.
  await expect(page.getByText(/fehlen dir noch 240 Minuten/).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'So kam die Zuteilung zustande' })).toBeVisible()
  await shot(page, '32-mein-ergebnis')
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('link', { name: 'Meine Klasse 5A' }).click()
  await expect(page.getByRole('heading', { name: 'Nicht vollständig zugeteilt (2)' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: SARA.name }).first()).toContainText('Minuten fehlen')
  await shot(page, '33-klasse-plaetze')
  await signOut(page)
})
