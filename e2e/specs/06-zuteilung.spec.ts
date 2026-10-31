// Die Zuteilung: mit dem Ende der Anmeldung beginnt die Nachfrist, die die
// Organisation vorzeitig beendet; sie berechnet die Zuteilung gegen den
// Solver-Stellvertreter des Testservers und sieht die Prüfung: die Ziele,
// wer was bekommen hat, die Aktivitäten; eine Woche später veröffentlicht
// sie, die Schülerin sieht ihre Einteilung, der Klassenvorstand die Plätze
// seiner Klasse. Baut auf 05-wahl auf (Sara hat gewählt, Tim wurde
// eingetragen; Bernd ist Klassenvorstand der 5A).

import { expect, test } from '../support/test.ts'
import { runTick, setClock } from '../support/clock.ts'
import { anyCount, anyText, literally, t } from '../support/messages.ts'
import { ANNA, BERND, SARA } from '../support/personas.ts'
import { picture, section, shot } from '../support/screenshot.ts'
import { sample } from '../support/sample.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

test('die Nachfrist beginnt zu ihrer Zeit, die Organisation beendet sie und berechnet die Zuteilung; die Prüfung zeigt Ziele, Plätze und Aktivitäten', async ({ page }) => {
  await setClock(page, '2034-03-13T20:00:00+01:00')
  expect(await runTick()).toEqual({ transitions: 1, reminders: 0 })
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await expect(page.getByText(t.labels.campaignState.grace, { exact: true })).toBeVisible()
  // Everyone has their wishes: the organizer ends the late registration early. The daily minimum the run needs was set with the window (04-einstellungen).
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
  await picture(page, 'zuteilung-pruefen', [page.getByRole('heading', { name: t.allocation.review.heading(1) }), page.getByRole('heading', { name: t.allocation.review.levels }).locator('xpath=following-sibling::p[1]')])
  // The same seed again is the same allocation, which the comparison says.
  await runs.getByRole('row', { name: /^1 / }).getByRole('button', { name: t.allocation.runs.repeat }).click()
  await expect(page.getByRole('heading', { name: t.allocation.review.heading(2) })).toBeVisible()
  await expect(runs.getByRole('row', { name: /^2 / })).toContainText(t.labels.runStatus.succeeded)
  await page.getByLabel(t.allocation.review.compareWith).selectOption({ label: t.allocation.review.compareOption(1, 4711) })
  await expect(page.getByText(new RegExp(literally(t.allocation.review.differences(2, 1))))).toContainText(t.allocation.review.noDifferences)
  await shot(page, '30-zuteilung-vergleich')
  await picture(page, 'zuteilung-berechnen', [section(page, t.allocation.start.heading), runs])
  await picture(page, 'zuteilung-vergleich', [page.getByRole('heading', { name: t.allocation.review.compare, exact: true }), page.getByText(new RegExp(literally(t.allocation.review.differences(2, 1))))])
  await signOut(page)
})

test('die Organisation veröffentlicht die Berechnung; die Schülerin sieht ihre Einteilung, der Klassenvorstand die Plätze seiner Klasse', async ({ page }) => {
  await setClock(page, '2034-03-20T10:00:00+01:00')
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.common.page.allocation }).click()
  await expect(page.getByRole('heading', { name: t.allocation.review.heading(2) })).toBeVisible()
  await page.getByRole('button', { name: t.allocation.publish.start(2) }).click()
  const confirm = page.getByRole('form', { name: t.allocation.publish.confirm })
  // Climbing needs six participants and two wanted it: the run cancelled it, and the organizer confirms that before publishing.
  await expect(confirm.getByText(sample.climbing)).toBeVisible()
  await expect(confirm.getByRole('button', { name: t.allocation.publish.submit })).toBeDisabled()
  await confirm.getByLabel(t.allocation.publish.confirmCancellations).check()
  await picture(page, 'veroeffentlichen', [page.getByRole('heading', { name: t.allocation.publish.heading, exact: true }), confirm])
  await confirm.getByRole('button', { name: t.allocation.publish.submit }).click()
  await expect(page.getByRole('status')).toHaveText(t.allocation.published)
  await expect(page.getByRole('heading', { name: t.allocation.publication.heading })).toBeVisible()
  // The sentence names the time of publication, which the journey does not know.
  await expect(page.getByText(anyText((when) => t.allocation.publication.text(2, when)))).toBeVisible()
  await shot(page, '31-veroeffentlicht')
  await picture(page, 'veroeffentlicht', [page.getByRole('heading', { name: t.allocation.publication.heading }), page.getByRole('link', { name: t.allocation.publication.assignmentsExport })])
  await signOut(page)

  await openAs(page, SARA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await expect(page.getByText(t.labels.campaignState.results)).toBeVisible()
  await page.getByRole('link', { name: t.campaign.student.viewResult }).click()
  await expect(page.getByRole('heading', { name: t.common.page.result })).toBeVisible()
  // Climbing needs six and two wanted it: cancelled by the run, so Sara has her days still to fill, which the page says.
  await expect(page.getByText(new RegExp(literally(t.result.deficit(240)))).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: t.result.explanation.heading })).toBeVisible()
  await shot(page, '32-mein-ergebnis')
  await picture(page, 'meine-einteilung', page.locator('main'))
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.campaign.myClass('5A') }).click()
  await expect(page.getByRole('heading', { name: t.schoolClass.unplaced.heading(2) })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: SARA.name }).first()).toContainText(anyCount(t.schoolClass.unplaced.minutesMissing))
  await shot(page, '33-klasse-plaetze')
  await signOut(page)
})
