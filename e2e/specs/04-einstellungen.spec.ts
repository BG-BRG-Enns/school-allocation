// Die Einstellungen der Schule und der Anmeldung: die Sprache, das Stundenraster, die
// Klassenvorstände (die ihre Klasse in der Anmeldung sehen), die Gruppensuche
// bei Microsoft für die Klassenlisten, der Anmeldezeitraum und der Bedarf je
// Tag und Schulstufe. Baut auf 02-stammdaten und 03-katalog auf.

import { htmlLang } from '../../packages/messages/src/index.ts'
import { expect, test } from '../support/test.ts'
import { refused } from '../support/console.ts'
import { ANNA, BERND, SARA, TIM } from '../support/personas.ts'
import { picture, section, shot } from '../support/screenshot.ts'
import { sample } from '../support/sample.ts'
import { openAs, signOut } from '../support/sign-in.ts'
import { day, dayTime, literally, LOCALE, t } from '../support/messages.ts'

test.describe.configure({ mode: 'serial' })

test('die Administration sieht die Sprache der Schule, die auch die Seite nennt; Speichern lädt die Seite neu', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung')
  await expect(page.locator('html')).toHaveAttribute('lang', htmlLang(LOCALE))
  const language = page.getByLabel(t.admin.language.label)
  await expect(language).toHaveValue(LOCALE)
  await expect(language.getByRole('option')).toHaveText([t.labels.locale.de, t.labels.locale['de-formal'], t.labels.locale.en])
  await picture(page, 'verwaltung', page.locator('main'))
  // The same language again: nothing changes, and the page loads anew.
  const reloaded = page.waitForEvent('load')
  await page.getByRole('button', { name: t.common.save }).click()
  await reloaded
  await expect(page.getByLabel(t.admin.language.label)).toHaveValue(LOCALE)
  await signOut(page)
})

test('die Administration passt das Stundenraster an', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung')
  await page.getByRole('link', { name: t.common.page.periods }).click()
  await expect(page.getByRole('heading', { name: t.common.page.periods })).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(11)
  await expect(page.getByLabel(t.periods.startsOf(2))).toHaveValue('08:30')
  await shot(page, '19-stundenraster')
  await picture(page, 'stundenraster', page.locator('main form'))
  await page.getByRole('button', { name: t.periods.removeLast }).click()
  await page.getByRole('button', { name: t.common.save }).click()
  await expect(page.getByRole('status')).toHaveText(t.periods.saved)
  await expect(page.getByRole('row')).toHaveCount(10)
  // A reversed period is refused with its rule.
  await page.getByLabel(t.periods.endsOf(1)).fill('07:00')
  await refused(page, 422, () => page.getByRole('button', { name: t.common.save }).click())
  await expect(page.getByRole('alert')).toContainText(t.labels.periodProblem.period_ends_before_start)
  await signOut(page)
})

test('die Administration ordnet einen Klassenvorstand zu, der seine Klasse in der Anmeldung sieht', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung/klassen')
  await expect(page.getByRole('heading', { name: t.common.page.classTeachers })).toBeVisible()
  await expect(page.getByRole('row', { name: /5A/ })).toContainText('–')
  await page.getByRole('row', { name: /5A/ }).getByRole('button', { name: t.classTeachers.assign }).click()
  const panel = page.getByRole('form', { name: t.classTeachers.assignTo('5A') })
  await panel.getByLabel(t.classTeachers.addTeacher).fill('Bernd')
  await panel.getByRole('button', { name: t.classTeachers.addPerson(BERND.name) }).click()
  await shot(page, '20-klassenvorstand-zuordnen')
  await picture(page, 'klassenvorstand-zuordnen', page.locator('main'))
  await panel.getByRole('button', { name: t.common.save }).click()
  await expect(page.getByRole('status')).toHaveText(t.classTeachers.saved)
  await expect(page.getByRole('row', { name: /5A/ })).toContainText(BERND.name)
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.campaign.myClass('5A') }).click()
  await expect(page.getByRole('heading', { name: t.schoolClass.title('5A') })).toBeVisible()
  await expect(page.getByRole('heading', { name: t.schoolClass.students(2) })).toBeVisible()
  await expect(page.getByText(SARA.name)).toBeVisible()
  await expect(page.getByText(TIM.name)).toBeVisible()
  await shot(page, '21-meine-klasse')
  await picture(page, 'meine-klasse', page.locator('main'))
  await signOut(page)
})

test('die Administration findet eine Entra-Gruppe über die Suche bei Microsoft', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung/stammdaten')
  await page.getByRole('link', { name: t.roster.groups.searchAtMicrosoft }).click()
  await expect(page.getByRole('heading', { name: 'Anmeldung (Test)' })).toBeVisible()
  await page.getByRole('button', { name: ANNA.name }).click()
  await expect(page.getByRole('heading', { name: t.roster.picker.title })).toBeVisible()
  await page.getByLabel(t.roster.picker.query).fill('Klasse 6')
  await page.getByRole('button', { name: t.roster.picker.take('Klasse 6A') }).click()
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.roster.groups.id, 'Klasse 6A'))).toHaveValue('33333333-3333-4333-8333-333333333333')
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.common.field.className, 'Klasse 6A'))).toHaveValue('6A')
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.common.field.grade, 'Klasse 6A'))).toHaveValue('10')
  // All the groups named after a class at once, class and Schulstufe filled in.
  await page.getByRole('button', { name: t.roster.picker.allClasses }).click()
  await expect(page.getByRole('button', { name: t.roster.picker.take('7B') })).toBeVisible()
  await shot(page, '22-gruppen-suchen')
  await picture(page, 'gruppen-suchen', page.locator('.panel', { has: page.getByRole('heading', { name: t.roster.picker.title }) }))
  await page.getByRole('button', { name: t.roster.picker.takeAll(2) }).click()
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.common.field.className, '7B'))).toHaveValue('7B')
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.common.field.grade, '7B'))).toHaveValue('11')
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.roster.groups.id, '8C'))).toHaveValue('55555555-5555-4555-8555-555555555555')
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.common.field.grade, '8C'))).toHaveValue('12')
  await expect(page.getByRole('button', { name: t.roster.picker.allClasses })).toBeVisible()
  await signOut(page)
})

test('die Organisation legt den Anmeldezeitraum fest und sieht den Bedarf je Tag und Schulstufe', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await expect(page.getByRole('heading', { name: t.campaign.demand.heading })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(literally(day('2034-07-03'))) })).toContainText(t.campaign.demand.cell(2, 3, 12))
  await picture(page, 'bedarf', section(page, t.campaign.demand.heading))
  await page.getByRole('button', { name: t.campaign.organization.editSettings }).click()
  const form = page.getByRole('form', { name: t.campaign.settings.label })
  await expect(form.getByLabel(t.campaign.settings.name, { exact: true })).toBeDisabled()
  await form.getByLabel(t.campaign.settings.opens, { exact: true }).fill('2034-03-06T08:00')
  await form.getByLabel(t.campaign.settings.closes, { exact: true }).fill('2034-03-13T20:00')
  await form.getByLabel(t.campaign.settings.lateUntil).fill('2034-03-17T20:00')
  await form.getByLabel(t.campaign.settings.wishesPerGroup).fill('3')
  await form.getByLabel(t.campaign.settings.dailyMinimum(9)).fill('240')
  await shot(page, '23-wahlfenster')
  await picture(page, 'einstellungen', form)
  await form.getByRole('button', { name: t.common.save }).click()
  await expect(page.getByRole('status')).toHaveText(t.common.saved)
  await expect(page.getByText(`${t.campaign.window.opens(dayTime('2034-03-06T08:00'), dayTime('2034-03-13T20:00'))}, ${t.campaign.window.late(dayTime('2034-03-17T20:00'))} · ${t.campaign.window.wishes(3)}`)).toBeVisible()
  await signOut(page)
})
