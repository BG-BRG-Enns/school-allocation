// Die Zuteilung: die Organisation beendet die Wahl, berechnet einen Lauf
// gegen den Solver-Stellvertreter des Testservers und sieht die Prüfung:
// die Stufen, wer was bekommen hat, die Aktivitäten. Baut auf 05-wahl auf
// (Sara hat gewählt, Tim wurde eingetragen; 5A ist in Wien fix).

import { expect, test } from '../support/test.ts'
import { ANNA } from '../support/personas.ts'
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
