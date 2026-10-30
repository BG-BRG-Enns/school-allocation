// Die Zuteilung: die Organisation beendet die Wahl, berechnet einen Lauf
// gegen den Solver-Stellvertreter des Testservers und sieht die Prüfung:
// die Stufen, wer was bekommen hat, die Aktivitäten; dann veröffentlicht
// sie, die Schülerin sieht ihr Ergebnis, der Klassenvorstand die Plätze
// seiner Klasse. Baut auf 05-wahl auf (Sara hat gewählt, Tim wurde
// eingetragen; 5A ist in Wien fix; Bernd ist Klassenvorstand der 5A).

import { expect, test } from '../support/test.ts'
import { anyCount, anyText, literally, t } from '../support/messages.ts'
import { ANNA, BERND, SARA } from '../support/personas.ts'
import { shot } from '../support/screenshot.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

test('die Organisation beendet die Wahl und berechnet eine Zuteilung; die Prüfung zeigt Stufen, Plätze und Aktivitäten', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  // The daily minimum the run needs was set with the window (04-einstellungen).
  await page.getByRole('button', { name: t.campaign.organization.close }).click()
  await expect(page.getByText(t.labels.campaignState.closed)).toBeVisible()
  await page.getByRole('link', { name: t.common.page.allocation }).click()
  await expect(page.getByRole('heading', { name: t.common.page.allocation })).toBeVisible()
  await expect(page.getByText(anyText((version) => t.allocation.start.ready(version, version)))).toBeVisible()
  await page.getByLabel(t.allocation.start.seed).fill('4711')
  await page.getByRole('button', { name: t.allocation.start.submit }).click()
  await expect(page.getByRole('status')).toHaveText(t.allocation.started)
  const runs = page.locator('section', { has: page.getByRole('heading', { name: anyCount(t.allocation.runs.heading) }) })
  await expect(page.getByRole('heading', { name: t.allocation.review.heading(1) })).toBeVisible()
  await expect(runs.getByRole('row', { name: /^1 / })).toContainText(t.labels.runStatus.succeeded)
  await expect(page.getByRole('heading', { name: t.allocation.review.levels })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(literally(t.labels.level.students_with_deficit)) })).toContainText(t.allocation.review.proven)
  await expect(page.getByRole('heading', { name: t.allocation.review.items, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: new RegExp(literally(t.allocation.review.studentList(2))) })).toBeVisible()
  await shot(page, '29-zuteilung')
  // The same seed again is the same allocation, which the comparison says.
  await runs.getByRole('row', { name: /^1 / }).getByRole('button', { name: t.allocation.runs.repeat }).click()
  await expect(page.getByRole('heading', { name: t.allocation.review.heading(2) })).toBeVisible()
  await expect(runs.getByRole('row', { name: /^2 / })).toContainText(t.labels.runStatus.succeeded)
  await page.getByLabel(t.allocation.review.compareWith).selectOption({ label: t.allocation.review.compareOption(1, 4711) })
  await expect(page.getByText(new RegExp(literally(t.allocation.review.differences(2, 1))))).toContainText(t.allocation.review.noDifferences)
  await shot(page, '30-zuteilung-vergleich')
  await signOut(page)
})

test('die Organisation veröffentlicht den Lauf; die Schülerin sieht ihr Ergebnis, der Klassenvorstand die Plätze seiner Klasse', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('link', { name: t.common.page.allocation }).click()
  await expect(page.getByRole('heading', { name: t.allocation.review.heading(2) })).toBeVisible()
  await page.getByRole('button', { name: t.allocation.publish.start(2) }).click()
  const confirm = page.getByRole('form', { name: t.allocation.publish.confirm })
  // Klettern needs six participants and two wanted it: the run cancelled it, and the organizer confirms that before publishing.
  await expect(confirm.getByText('Klettern')).toBeVisible()
  await expect(confirm.getByRole('button', { name: t.allocation.publish.submit })).toBeDisabled()
  await confirm.getByLabel(t.allocation.publish.confirmCancellations).check()
  await confirm.getByRole('button', { name: t.allocation.publish.submit }).click()
  await expect(page.getByRole('status')).toHaveText(t.allocation.published)
  await expect(page.getByRole('heading', { name: t.allocation.publication.heading })).toBeVisible()
  // The sentence names the time of publication, which the journey does not know.
  await expect(page.getByText(anyText((when) => t.allocation.publication.text(2, when)))).toBeVisible()
  await shot(page, '31-veroeffentlicht')
  await signOut(page)

  await openAs(page, SARA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await expect(page.getByText(t.labels.campaignState.results)).toBeVisible()
  await page.getByRole('link', { name: t.campaign.student.viewResult }).click()
  await expect(page.getByRole('heading', { name: t.common.page.result })).toBeVisible()
  // Klettern needs six and two wanted it: cancelled by the run, so Sara has her days still to fill, which the page says.
  await expect(page.getByText(new RegExp(literally(t.result.deficit(240)))).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: t.result.explanation.heading })).toBeVisible()
  await shot(page, '32-mein-ergebnis')
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('link', { name: t.campaign.myClass('5A') }).click()
  await expect(page.getByRole('heading', { name: t.schoolClass.unplaced.heading(2) })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: SARA.name }).first()).toContainText(anyCount(t.schoolClass.unplaced.minutesMissing))
  await shot(page, '33-klasse-plaetze')
  await signOut(page)
})
