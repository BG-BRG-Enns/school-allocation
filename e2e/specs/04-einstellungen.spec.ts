// Die Einstellungen der Schule und der Anmeldung: die Sprache, das Stundenraster, die
// Klassenvorstände (die ihre Klasse in der Anmeldung sehen), die Gruppensuche
// bei Microsoft für die Klassenlisten, der Anmeldezeitraum und der Bedarf je
// Tag und Schulstufe. Baut auf 02-stammdaten und 03-katalog auf: die
// Schule hat 25 Klassen, deren Klassenvorstände bis auf den der 5A
// zugeordnet sind, und die Projektwoche ihre Aktivitäten. Der
// Anmeldezeitraum und die Regeln sind die der Schule
// (e2e/support/scenario.ts).

import { htmlLang } from '../../packages/messages/src/index.ts'
import { expect, test } from '../support/test.ts'
import { refused } from '../support/console.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from '../support/personas.ts'
import { picture, section, shot } from '../support/screenshot.ts'
import { sample } from '../support/sample.ts'
import { openAs, signOut } from '../support/sign-in.ts'
import { day, dayTime, literally, LOCALE, t } from '../support/messages.ts'
import { classSize, demandOf, SCHOOL } from '../support/scenario.ts'
import { MONDAY } from '../scenario/school.ts'

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
  // The school's abbreviations from a pasted list: checked, then applied; the search knows them afterwards.
  const csv = page.getByRole('form', { name: t.classTeachers.csv.title })
  await csv.getByLabel(t.classTeachers.csv.paste).fill(['email;short_name', `${ANNA.email};ZwA`, `${BERND.email};PfB`, `${CARLA.email};KnC`].join('\n'))
  await csv.getByRole('button', { name: t.classTeachers.csv.check }).click()
  await expect(page.getByText(`${BERND.name}: – → PfB`)).toBeVisible()
  await picture(page, 'klassenvorstaende-csv', section(page, t.classTeachers.csv.title))
  await page.getByRole('button', { name: t.classTeachers.csv.apply }).click()
  await expect(page.getByRole('status')).toHaveText(t.classTeachers.csv.applied(3, 0))
  await page.getByRole('row', { name: /5A/ }).getByRole('button', { name: t.classTeachers.assign }).click()
  const panel = page.getByRole('form', { name: t.classTeachers.assignTo('5A') })
  await panel.getByLabel(t.classTeachers.addTeacher).fill('PfB')
  await panel.getByRole('button', { name: t.classTeachers.addPerson(BERND.name) }).click()
  await shot(page, '20-klassenvorstand-zuordnen')
  // From 5A's row down to the form below the 25 classes.
  await picture(page, 'klassenvorstand-zuordnen', [page.getByRole('row', { name: /5A/ }), panel])
  await panel.getByRole('button', { name: t.common.save }).click()
  await expect(page.getByRole('status')).toHaveText(t.classTeachers.saved)
  await expect(page.getByRole('row', { name: /5A/ })).toContainText(BERND.name)
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.campaign.myClass('5A') }).click()
  await expect(page.getByRole('heading', { name: t.schoolClass.title('5A') })).toBeVisible()
  await expect(page.getByRole('heading', { name: t.schoolClass.students(classSize('5A')) })).toBeVisible()
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
  // The groups of the 8th classes, who leave in May, are the ones nobody has labelled: the search finds them, and the form takes one in.
  const leaver = SCHOOL.leavers.find((c) => c.name === '8A')
  await page.getByLabel(t.roster.picker.query).fill('Klasse 8')
  await page.getByRole('button', { name: t.roster.picker.take('Klasse 8A') }).click()
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.roster.groups.id, 'Klasse 8A'))).toHaveValue(leaver?.groupId ?? '')
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.common.field.className, 'Klasse 8A'))).toHaveValue('8A')
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.common.field.grade, 'Klasse 8A'))).toHaveValue('12')
  // All the groups named after a class at once, class and Schulstufe filled in.
  await page.getByRole('button', { name: t.roster.picker.allClasses }).click()
  await expect(page.getByRole('button', { name: t.roster.picker.take('7B') })).toBeVisible()
  await shot(page, '22-gruppen-suchen')
  await picture(page, 'gruppen-suchen', page.locator('.panel', { has: page.getByRole('heading', { name: t.roster.picker.title }) }))
  await page.getByRole('button', { name: t.roster.picker.takeAll(2) }).click()
  // Exactly: "Klasse 7B" is a group the school labelled long ago, too.
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.common.field.className, '7B'), { exact: true })).toHaveValue('7B')
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.common.field.grade, '7B'), { exact: true })).toHaveValue('11')
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.roster.groups.id, '8C'), { exact: true })).toHaveValue('55555555-5555-4555-8555-555555555555')
  await expect(page.getByLabel(t.roster.groups.fieldOf(t.common.field.grade, '8C'), { exact: true })).toHaveValue('12')
  await expect(page.getByRole('button', { name: t.roster.picker.allClasses })).toBeVisible()
  // Left unsaved: the leavers stay out of the roster.
  await signOut(page)
})

test('die Organisation legt den Anmeldezeitraum fest und sieht den Bedarf je Tag und Schulstufe', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await expect(page.getByRole('heading', { name: t.campaign.demand.heading })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(literally(day(MONDAY))) })).toContainText(t.campaign.demand.cell(...demandOf(MONDAY, 9)))
  await picture(page, 'bedarf', section(page, t.campaign.demand.heading))
  await page.getByRole('button', { name: t.campaign.organization.editSettings }).click()
  const form = page.getByRole('form', { name: t.campaign.settings.label })
  await expect(form.getByLabel(t.campaign.settings.name, { exact: true })).toBeDisabled()
  await form.getByLabel(t.campaign.settings.opens, { exact: true }).fill('2034-03-06T08:00')
  await form.getByLabel(t.campaign.settings.closes, { exact: true }).fill('2034-03-12T20:00')
  await form.getByLabel(t.campaign.settings.lateUntil).fill('2034-03-19T20:00')
  await form.getByLabel(t.campaign.settings.wishesPerGroup).fill(String(SCHOOL.campaign.wishesPerGroup))
  // The minutes a day: 100 for the lower school, 200 from the 9th grade on.
  for (const [grade, minutes] of Object.entries(SCHOOL.campaign.dailyMinimum)) await form.getByLabel(t.campaign.settings.dailyMinimum(Number(grade))).fill(String(minutes))
  await shot(page, '23-wahlfenster')
  await picture(page, 'einstellungen', form)
  // Two rules: every student at least one sport activity, the form's defaults but for the category; the 7th grade 200 minutes of careers guidance.
  const [sport, careers] = SCHOOL.campaign.rules
  if (!sport || !careers || sport.category !== sample.sport) throw new Error('the scenario\'s rules are sport and careers guidance')
  await form.getByRole('button', { name: t.campaign.rulesEditor.add }).click()
  const rule = form.getByRole('group', { name: t.campaign.rulesEditor.rule(1) })
  await expect(rule.getByLabel(t.rules.category)).toHaveValue(/.+/)
  await rule.getByLabel(t.rules.category).selectOption({ label: sample.sport })
  for (const grade of sport.grades) await expect(rule.getByLabel(t.common.gradeOrdinal(grade))).toBeChecked()
  await expect(rule.getByLabel(t.campaign.rulesEditor.minimum)).toHaveValue('1')
  await form.getByRole('button', { name: t.campaign.rulesEditor.add }).click()
  const second = form.getByRole('group', { name: t.campaign.rulesEditor.rule(2) })
  await second.getByLabel(t.rules.category).selectOption({ label: careers.category })
  await second.getByLabel(t.campaign.rulesEditor.unit).selectOption(careers.unit)
  await second.getByLabel(t.campaign.rulesEditor.minimum).fill(String(careers.minimum))
  for (const grade of sport.grades) {
    if (!careers.grades.includes(grade)) await second.getByLabel(t.common.gradeOrdinal(grade)).uncheck()
  }
  await picture(page, 'regeln', [rule, second])
  await form.getByRole('button', { name: t.common.save }).click()
  await expect(page.getByRole('status')).toHaveText(t.common.saved)
  await expect(page.getByText(`${t.campaign.window.opens(dayTime('2034-03-06T08:00'), dayTime('2034-03-12T20:00'))}, ${t.campaign.window.late(dayTime('2034-03-19T20:00'))} · ${t.campaign.window.wishes(3)}`)).toBeVisible()
  const asks = t.rules.asks(sample.sport, 1, 'items')
  const asksCareers = t.rules.asks(careers.category, careers.minimum, careers.unit)
  await expect(section(page, t.campaign.organization.heading)).toContainText(`${asks} · ${t.rules.scope(sport.grades, [])}`)
  await expect(section(page, t.campaign.organization.heading)).toContainText(`${asksCareers} · ${t.rules.scope(careers.grades, [])}`)
  // The demand per rule, a row for each grade it asks of: what the grade needs against what the catalogue offers it, which suffices.
  await expect(page.getByText(t.campaign.demand.rulesIntro)).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(literally(asks)) })).toHaveCount(sport.grades.length)
  await expect(page.getByRole('row', { name: new RegExp(literally(asksCareers)) })).toHaveCount(careers.grades.length)
  await expect(page.getByRole('row', { name: new RegExp(literally(asksCareers)) })).toContainText('7.')
  await expect(page.getByRole('row').filter({ hasText: t.campaign.demand.ruleShort })).toHaveCount(0)
  // The school's categories, now each used by activities and Sport by a rule: the scenario's sport activities and the climbing (03-katalog).
  await page.getByRole('link', { name: t.common.page.categories }).click()
  await expect(page.getByRole('heading', { name: t.common.page.categories })).toBeVisible()
  const sports = SCHOOL.items.filter((i) => i.categories.includes(sample.sport)).length + 1
  await expect(page.getByRole('row').filter({ hasText: sample.sport })).toContainText(t.categories.usage(sports, 1))
  await picture(page, 'kategorien', page.locator('main'))
  await signOut(page)
})
