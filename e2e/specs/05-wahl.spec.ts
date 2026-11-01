// Die Anmeldung: sie öffnet sich zu ihrer Zeit, eine Schülerin gibt ihre
// Wünsche ab und ist vollständig, einen Tag vor dem Ende wird erinnert, wer
// noch fehlt, die Organisation sieht den Stand der Anmeldung und gibt für
// einen Schüler ein, der Klassenvorstand sieht den Stand seiner Klasse, die
// E-Mail-Vorlagen lassen sich ändern. Baut auf 03-katalog und
// 04-einstellungen auf (Bernd ist Klassenvorstand der 5A; die Anmeldung
// läuft vom 6. bis 12. März 2034, die Nachfrist bis 19. März). Die anderen
// 598 Schüler*innen der Schule speichern ihre Listen zu ihrer Zeit
// (e2e/support/scenario.ts).

import type { Page } from '@playwright/test'
import { expect, test } from '../support/test.ts'
import { runTick, setClock } from '../support/clock.ts'
import { refused } from '../support/console.ts'
import { anyCount, t } from '../support/messages.ts'
import { ANNA, BERND, SARA, TIM } from '../support/personas.ts'
import { picture, section, shot } from '../support/screenshot.ts'
import { sample } from '../support/sample.ts'
import { classSize, loadStage, SCHOOL, STUDENTS } from '../support/scenario.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

/** A day before the end, the registration's default: when the reminder goes out. */
const REMINDER = '2034-03-11T20:00:00+01:00'

/** The state of the registration builds every student's groups, one after another: for 600 students that takes seconds. */
const STATE = { timeout: 30_000 }

/** Gives every group of the wishes page the wishes it asks for, after those given already, in the order the page lists the activities. */
async function giveWishes(page: Page): Promise<void> {
  for (const group of await page.locator('main fieldset').filter({ has: page.locator('select') }).all()) {
    const selects = await group.locator('select').all()
    const required = Math.min(SCHOOL.campaign.wishesPerGroup, selects.length)
    let given = 0
    for (const select of selects) if (await select.inputValue() !== '0') given++
    for (const select of selects) {
      if (given >= required) break
      if (await select.inputValue() !== '0') continue
      given++
      await select.selectOption(String(given))
    }
  }
}

test('die Anmeldung öffnet sich zu ihrer Zeit; eine Schülerin gibt ihre Wünsche ab und ist vollständig', async ({ page }) => {
  await setClock(page, '2034-03-06T08:00:00+01:00')
  expect(await runTick()).toEqual({ transitions: 1, reminders: 0 })
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await expect(page.getByText(t.labels.campaignState.open)).toBeVisible()
  await expect(page.getByRole('heading', { name: t.campaign.missing.heading })).toBeVisible()
  await expect(page.getByText(t.campaign.missing.summary(STUDENTS, STUDENTS))).toBeVisible(STATE)
  await shot(page, '24-wahl-geoeffnet')
  await signOut(page)

  await openAs(page, SARA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.campaign.student.giveWishes }).click()
  await expect(page.getByRole('heading', { name: t.common.page.wishes })).toBeVisible()
  // Climbing's group, Monday morning: three wishes, none given yet.
  const climbingGroup = page.locator('main fieldset').filter({ has: page.getByLabel(t.wishes.wishFor(sample.climbing)) })
  const wishes = SCHOOL.campaign.wishesPerGroup
  await expect(climbingGroup.locator('legend')).toContainText(t.wishes.groupCount(0, wishes))
  // The registration's rule for the 9th grade (04-einstellungen): one sport activity, which climbing is.
  const rules = section(page, t.wishes.rules.heading)
  await expect(rules).toContainText(t.rules.asks(sample.sport, 1, 'items'))
  await expect(rules).toContainText(t.wishes.rules.notYet)
  await page.getByLabel(t.wishes.wishFor(sample.climbing)).selectOption('1')
  // A student's change is saved at once, without a button.
  await expect(page.getByRole('status')).toHaveText(t.common.saved)
  await expect(climbingGroup.locator('legend')).toContainText(t.wishes.groupCount(1, wishes))
  await expect(rules).toContainText(t.wishes.rules.reach(t.rules.progress(1, 1, 'items')))
  await expect(rules).toContainText(t.wishes.rules.done)
  // The other wishes of every group, which make the list complete.
  await expect(page.getByText(t.labels.choiceState.complete, { exact: true })).toHaveCount(0)
  await giveWishes(page)
  await expect(page.getByText(t.labels.choiceState.complete, { exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(t.common.saved)
  await shot(page, '25-wuensche')
  await picture(page, 'wuensche', page.locator('main'))
  // Every change a version of its own.
  await expect(page.getByText(anyCount((version) => t.wishes.savedIn(t.labels.window.first, version)))).toBeVisible()
  await signOut(page)
})

test('einen Tag vor dem Ende wird erinnert, wer fehlt; die Organisation gibt für einen Schüler ein; der Klassenvorstand sieht den Stand seiner Klasse', async ({ page }) => {
  // The school's lists take a while to save.
  test.slow()
  // The rest of the school saves until the reminder goes out, a day before the end (the registration's default): to everyone whose list is not complete, Tim among them, not to Sara.
  const saves = await loadStage(page, 'choices', REMINDER)
  const incomplete = STUDENTS - 1 - saves.complete
  await setClock(page, REMINDER)
  expect(await runTick()).toEqual({ transitions: 0, reminders: incomplete })
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await expect(page.getByText(t.campaign.missing.summary(STUDENTS, incomplete))).toBeVisible(STATE)
  const tim = page.getByRole('row', { name: new RegExp(TIM.name) })
  await expect(tim).toContainText(t.labels.choiceState.none)
  await expect(tim).toContainText(`${t.labels.mailKind.choice_reminder}: ${t.labels.mailState.queued}`)
  await expect(page.getByRole('row', { name: new RegExp(SARA.name) })).not.toContainText(t.labels.mailKind.choice_reminder)
  await picture(page, 'stand-der-anmeldung', section(page, t.campaign.missing.heading))
  await tim.getByRole('link', { name: t.campaign.missing.enter }).click()
  await expect(page.getByRole('heading', { name: t.wishes.titleOnBehalf })).toBeVisible()
  await expect(page.getByText(t.wishes.onBehalf(TIM.name, '5A'))).toBeVisible()
  await page.getByLabel(t.wishes.wishFor(sample.climbing)).selectOption('1')
  await giveWishes(page)
  // Without a reason the form does not submit; with one it is recorded.
  await page.getByLabel(t.common.field.reason).fill(sample.reason.ill)
  await picture(page, 'fuer-jemanden-eintragen', page.locator('main'))
  await page.getByRole('button', { name: t.wishes.saveWishes }).click()
  await expect(page.getByRole('status')).toHaveText(t.common.saved)
  await shot(page, '26-im-namen')
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.campaign.myClass('5A') }).click()
  await expect(page.getByRole('listitem').filter({ hasText: SARA.name })).toContainText(t.labels.choiceState.complete)
  await expect(page.getByRole('listitem').filter({ hasText: TIM.name })).toContainText(t.labels.choiceState.complete)
  await shot(page, '27-klasse-wahlstand')
  await picture(page, 'klasse-anmeldestand', section(page, t.schoolClass.students(classSize('5A'))))
  await signOut(page)
})

test('die Administration ändert eine E-Mail-Vorlage; ein falscher Platzhalter wird abgewiesen, ein Klick fügt einen ein; Zurücksetzen bringt den vorgegebenen Text', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung')
  await page.getByRole('link', { name: t.common.page.mailTemplates }).click()
  const reminder = t.labels.mailKind.choice_reminder
  await expect(page.getByRole('heading', { name: reminder })).toBeVisible()
  await expect(page.getByText(t.mailTemplates.mailOff)).toBeVisible()
  const template = section(page, reminder)
  await expect(template.getByText(t.mailTemplates.defaultText)).toBeVisible()
  await template.getByRole('button', { name: t.common.edit }).click()
  const form = page.getByRole('form', { name: t.mailTemplates.editing(reminder) })
  await expect(form.getByText(t.mailTemplates.placeholder.deadline)).toBeVisible()
  const body = form.getByLabel(t.mailTemplates.body)
  await body.fill(`${sample.reminder}{{link}} ({{class_name}})`)
  await refused(page, 422, () => form.getByRole('button', { name: t.common.save }).click())
  await expect(page.getByRole('alert')).toContainText(`${t.labels.templateProblem.unknown_placeholder}: class_name`)
  // A placeholder's button puts it where the cursor stands, here at the end of the text.
  await body.fill(sample.reminder)
  await form.getByRole('button', { name: '{{link}}' }).click()
  await expect(body).toHaveValue(`${sample.reminder}{{link}}`)
  await picture(page, 'e-mail-vorlage', template)
  await form.getByRole('button', { name: t.common.save }).click()
  await expect(page.getByRole('status')).toHaveText(t.mailTemplates.saved)
  await expect(template.getByText(`${sample.reminder}{{link}}`)).toBeVisible()
  await expect(template.getByText(t.mailTemplates.customText)).toBeVisible()
  await shot(page, '28-mailvorlagen')
  page.once('dialog', (dialog) => void dialog.accept())
  await template.getByRole('button', { name: t.mailTemplates.reset }).click()
  await expect(page.getByRole('status')).toHaveText(t.mailTemplates.resetDone)
  await expect(template.getByText(t.mail.choice_reminder.subject)).toBeVisible()
  await expect(template.getByText(t.mailTemplates.defaultText)).toBeVisible()
  await signOut(page)
})
