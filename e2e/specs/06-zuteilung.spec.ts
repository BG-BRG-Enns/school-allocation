// Die Zuteilung: mit dem Ende der Anmeldung beginnt die Nachfrist, die die
// Organisation vorzeitig beendet; sie berechnet die Zuteilung gegen den
// Solver-Stellvertreter des Testservers und sieht die Prüfung: die Ziele,
// wer was bekommen hat, die Aktivitäten; eine Woche später veröffentlicht
// sie, die Schülerin sieht ihre Einteilung, der Klassenvorstand die Plätze
// seiner Klasse. Baut auf 05-wahl auf (Sara hat gewählt, Tim wurde
// eingetragen; Bernd ist Klassenvorstand der 5A). Die anderen
// Schüler*innen speichern bis zum Ende und in der Nachfrist
// (e2e/support/scenario.ts). Was eine Berechnung ergibt, hängt an den
// Kennungen der Datenbank: die Journey prüft, was die Prüfung zeigt, nicht
// ihre Zahlen. Mit E2E_SOLVER=real rechnet der echte Solver, und das dauert.

import { expect, test } from '../support/test.ts'
import { runTick, setClock } from '../support/clock.ts'
import { anyCount, anyText, literally, t } from '../support/messages.ts'
import { ANNA, BERND, SARA } from '../support/personas.ts'
import { picture, section, shot } from '../support/screenshot.ts'
import { sample } from '../support/sample.ts'
import { classSize, loadStage, SCHOOL, STUDENTS } from '../support/scenario.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

const CLOSES = '2034-03-12T20:00:00+01:00'
const LATE_UNTIL = '2034-03-19T20:00:00+01:00'
/** How long a run may take: seconds with the stand-in, minutes with the real solver at the default time per level. */
const RUN = { timeout: process.env.E2E_SOLVER === 'real' ? 900_000 : 30_000 }

test('die Nachfrist beginnt zu ihrer Zeit, die Organisation beendet sie und berechnet die Zuteilung; die Prüfung zeigt Ziele, Plätze und Aktivitäten', async ({ page }) => {
  test.setTimeout(3 * 60_000 + 2 * RUN.timeout)
  // The lists saved on the window's last two days; then its end, and the late registration begins.
  await loadStage(page, 'choices', CLOSES)
  await setClock(page, CLOSES)
  expect(await runTick()).toEqual({ transitions: 1, reminders: 0 })
  // The late lists, until the end of the late registration.
  await loadStage(page, 'choices', LATE_UNTIL)
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await expect(page.getByText(t.labels.campaignState.grace, { exact: true })).toBeVisible()
  // The late lists are in: the organizer ends the late registration before its time. The daily minimums the run needs were set with the window (04-einstellungen).
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
  await expect(runs.getByRole('row', { name: /^1 / })).toContainText(t.labels.runStatus.succeeded, RUN)
  await expect(page.getByRole('heading', { name: t.allocation.review.levels })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(literally(t.labels.level.students_with_deficit)) })).toContainText(t.allocation.review.proven)
  await expect(page.getByRole('heading', { name: t.allocation.review.items, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: new RegExp(literally(t.allocation.review.studentList(STUDENTS))) })).toBeVisible()
  // Each rule with how many of its students the run met: sport every student's, careers guidance the 7th grade's.
  for (const rule of SCHOOL.campaign.rules) {
    const students = SCHOOL.classes.filter((c) => rule.grades.includes(c.grade)).reduce((sum, c) => sum + c.students.length, 0)
    await expect(page.getByText(anyCount((met) => `${t.rules.asks(rule.category, rule.minimum, rule.unit)} · ${t.rules.scope(rule.grades, [])}: ${t.allocation.review.ruleMet(met, students)}`))).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: anyCount(t.allocation.review.ruleGaps) })).toBeVisible()
  await shot(page, '29-zuteilung')
  await picture(page, 'zuteilung-pruefen', [page.getByRole('heading', { name: t.allocation.review.heading(1) }), page.getByRole('heading', { name: t.allocation.review.levels }).locator('xpath=following-sibling::p[1]')])
  // Repeated with the same settings: a second run, which the comparison sets against the first.
  await runs.getByRole('row', { name: /^1 / }).getByRole('button', { name: t.allocation.runs.repeat }).click()
  await expect(page.getByRole('heading', { name: t.allocation.review.heading(2) })).toBeVisible()
  await expect(runs.getByRole('row', { name: /^2 / })).toContainText(t.labels.runStatus.succeeded, RUN)
  await page.getByLabel(t.allocation.review.compareWith).selectOption({ label: t.allocation.review.compareOption(1, 4711) })
  await expect(page.getByText(new RegExp(literally(t.allocation.review.differences(2, 1))))).toBeVisible()
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
  // Climbing needs six participants, and only Sara and Tim wanted it: the run cancelled it, and the organizer confirms that before publishing.
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
  // Climbing is cancelled: Sara has another of her wishes on Monday morning, and the page explains how the places came about.
  await expect(page.getByRole('heading', { name: t.result.explanation.heading })).toBeVisible()
  await expect(section(page, t.result.rules)).toContainText(t.rules.asks(sample.sport, 1, 'items'))
  await shot(page, '32-mein-ergebnis')
  await picture(page, 'meine-einteilung', page.locator('main'))
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.campaign.myClass('5A') }).click()
  await expect(page.getByRole('heading', { name: t.schoolClass.title('5A') })).toBeVisible()
  await expect(page.getByRole('heading', { name: t.schoolClass.students(classSize('5A')) })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: SARA.name }).first()).toBeVisible()
  await shot(page, '33-klasse-plaetze')
  await signOut(page)
})
