// Die Wahl: die Organisation öffnet sie, eine Schülerin gibt ihre Wünsche
// ab und ist vollständig, die Organisation sieht den Wahlstand und gibt
// für einen Schüler ein, der Klassenvorstand sieht den Stand seiner
// Klasse, die Mailvorlagen lassen sich ändern. Baut auf 03-katalog und
// 04-einstellungen auf (Bernd ist Klassenvorstand der 5A).

import { expect, test } from '../support/test.ts'
import { refused } from '../support/console.ts'
import { t } from '../support/messages.ts'
import { ANNA, BERND, SARA, TIM } from '../support/personas.ts'
import { shot } from '../support/screenshot.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

test('die Organisation öffnet die Wahl; eine Schülerin gibt ihre Wünsche ab und ist vollständig', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('button', { name: t.campaign.organization.open }).click()
  await expect(page.getByText(t.labels.campaignState.open)).toBeVisible()
  await expect(page.getByRole('heading', { name: t.campaign.missing.heading })).toBeVisible()
  await expect(page.getByText(t.campaign.missing.summary(2, 2))).toBeVisible()
  await shot(page, '24-wahl-geoeffnet')
  await signOut(page)

  await openAs(page, SARA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('link', { name: t.campaign.student.giveWishes }).click()
  await expect(page.getByRole('heading', { name: t.common.page.wishes })).toBeVisible()
  await expect(page.getByText(t.wishes.groupCount(0, 1))).toBeVisible()
  await page.getByLabel(t.wishes.wishFor('Klettern')).selectOption('1')
  // A student's change is saved at once, without a button.
  await expect(page.getByRole('status')).toHaveText(t.common.saved)
  await expect(page.getByText(t.wishes.groupCount(1, 1))).toBeVisible()
  await shot(page, '25-wuensche')
  await expect(page.getByText(t.labels.choiceState.complete, { exact: true })).toBeVisible()
  await expect(page.getByText(t.wishes.savedIn(t.labels.window.first, 1))).toBeVisible()
  await signOut(page)
})

test('die Organisation gibt für einen Schüler ein; der Klassenvorstand sieht den Stand seiner Klasse', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await expect(page.getByText(t.campaign.missing.summary(2, 1))).toBeVisible()
  const tim = page.getByRole('row', { name: new RegExp(TIM.name) })
  await expect(tim).toContainText(t.labels.choiceState.none)
  await tim.getByRole('link', { name: t.campaign.missing.enter }).click()
  await expect(page.getByRole('heading', { name: t.wishes.titleOnBehalf })).toBeVisible()
  await expect(page.getByText(t.wishes.onBehalf(TIM.name, '5A'))).toBeVisible()
  await page.getByLabel(t.wishes.wishFor('Klettern')).selectOption('1')
  // Without a reason the form does not submit; with one it is recorded.
  await page.getByLabel(t.common.field.reason).fill('Tim war krank')
  await page.getByRole('button', { name: t.wishes.saveWishes }).click()
  await expect(page.getByRole('status')).toHaveText(t.common.saved)
  await shot(page, '26-im-namen')
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: 'Projektwoche 2027' }).click()
  await page.getByRole('link', { name: t.campaign.myClass('5A') }).click()
  await expect(page.getByRole('listitem').filter({ hasText: SARA.name })).toContainText(t.labels.choiceState.complete)
  await expect(page.getByRole('listitem').filter({ hasText: TIM.name })).toContainText(t.labels.choiceState.complete)
  await shot(page, '27-klasse-wahlstand')
  await signOut(page)
})

test('die Administration ändert eine Mailvorlage; ein falscher Platzhalter wird abgewiesen, ein Klick fügt einen ein; Zurücksetzen bringt den vorgegebenen Text', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung')
  await page.getByRole('link', { name: t.common.page.mailTemplates }).click()
  const reminder = t.labels.mailKind.choice_reminder
  await expect(page.getByRole('heading', { name: reminder })).toBeVisible()
  await expect(page.getByText(t.mailTemplates.mailOff)).toBeVisible()
  const section = page.locator('section', { has: page.getByRole('heading', { name: reminder }) })
  await expect(section.getByText(t.mailTemplates.defaultText)).toBeVisible()
  await section.getByRole('button', { name: t.common.edit }).click()
  const form = page.getByRole('form', { name: t.mailTemplates.editing(reminder) })
  await expect(form.getByText(t.mailTemplates.placeholder.deadline)).toBeVisible()
  const body = form.getByLabel(t.mailTemplates.body)
  await body.fill('Hallo {{first_name}}, bitte bis {{deadline}}: {{link}} ({{class_name}})')
  await refused(page, 422, () => form.getByRole('button', { name: t.common.save }).click())
  await expect(page.getByRole('alert')).toContainText(`${t.labels.templateProblem.unknown_placeholder}: class_name`)
  // A placeholder's button puts it where the cursor stands, here at the end of the text.
  await body.fill('Hallo {{first_name}}, bitte bis {{deadline}}: ')
  await form.getByRole('button', { name: '{{link}}' }).click()
  await expect(body).toHaveValue('Hallo {{first_name}}, bitte bis {{deadline}}: {{link}}')
  await form.getByRole('button', { name: t.common.save }).click()
  await expect(page.getByRole('status')).toHaveText(t.mailTemplates.saved)
  await expect(section.getByText('Hallo {{first_name}}, bitte bis {{deadline}}: {{link}}')).toBeVisible()
  await expect(section.getByText(t.mailTemplates.customText)).toBeVisible()
  await shot(page, '28-mailvorlagen')
  page.once('dialog', (dialog) => void dialog.accept())
  await section.getByRole('button', { name: t.mailTemplates.reset }).click()
  await expect(page.getByRole('status')).toHaveText(t.mailTemplates.resetDone)
  await expect(section.getByText(t.mail.choice_reminder.subject)).toBeVisible()
  await expect(section.getByText(t.mailTemplates.defaultText)).toBeVisible()
  await signOut(page)
})
