// Der Katalog: die Organisation legt eine Anmeldung an, sammelt Aktivitäten
// und legt die Kategorie Sport an, eine Lehrkraft trägt ihre Verfügbarkeit
// ein und reicht eine Aktivität der Kategorie ein, die Organisation sieht die
// Lehrkräfte je Tag, genehmigt und veröffentlicht, und Schüler*innen lesen
// den nummerierten Katalog mit den Kategorien. Baut
// auf den Klassenlisten aus 02-stammdaten auf (Anna organisiert als
// Administratorin, Bernd ist Lehrkraft, Sara Pfnäxthuber der 5A). Die
// Projektwoche ist die der ganzen Schule (e2e/support/scenario.ts): sobald
// sie Aktivitäten sammelt, tragen die anderen Lehrkräfte bis Mitte Februar
// ihre Verfügbarkeit und ihre Aktivitäten ein, und die Organisation
// genehmigt sie.

import { expect, test } from '../support/test.ts'
import { ANNA, BERND, CARLA, SARA } from '../support/personas.ts'
import { picture, section, shot } from '../support/screenshot.ts'
import { openAs, signOut } from '../support/sign-in.ts'
import { refused } from '../support/console.ts'
import { anyText, day, fee, literally, t } from '../support/messages.ts'
import { sample } from '../support/sample.ts'
import { CLIMBING, climbingNumber, LEFT_OUT, loadStage, PARTICIPATING_CLASSES, SCHOOL } from '../support/scenario.ts'

test.describe.configure({ mode: 'serial' })

const climbing = new RegExp(literally(sample.climbing))

test('die Organisation legt die Anmeldung an und öffnet sie für Aktivitäten', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await expect(page.getByRole('heading', { name: t.common.page.campaigns })).toBeVisible()
  await page.getByLabel(t.campaign.settings.name, { exact: true }).fill(sample.projectWeek)
  await page.getByLabel(t.common.field.schoolYear).fill('2033/34')
  await page.getByLabel(t.campaign.settings.projectDay(1), { exact: true }).fill('2034-07-03')
  // The weekday beside the date shows a slip of the month; the next day is proposed and the third follows it. Exact: the frame selects beside a day name it too.
  await expect(page.getByText(day('2034-07-03'))).toBeVisible()
  await page.getByRole('button', { name: t.common.addDay }).click()
  await expect(page.getByLabel(t.campaign.settings.projectDay(2), { exact: true })).toHaveValue('2034-07-04')
  await page.getByRole('button', { name: t.common.addDay }).click()
  await expect(page.getByLabel(t.campaign.settings.projectDay(3), { exact: true })).toHaveValue('2034-07-05')
  // Every class of the class lists is preselected; one is taken out, and the registration says so afterwards.
  const classes = page.getByRole('group', { name: t.campaigns.classes.legend })
  await expect(classes.getByRole('checkbox', { name: LEFT_OUT, exact: true })).toBeChecked()
  await classes.getByRole('checkbox', { name: LEFT_OUT, exact: true }).uncheck()
  await shot(page, '13-wahl-anlegen')
  await picture(page, 'anmeldung-anlegen', section(page, t.campaigns.new))
  await page.getByRole('button', { name: t.campaigns.create }).click()
  await expect(page.getByRole('heading', { name: sample.projectWeek })).toBeVisible()
  await expect(page.getByText(t.labels.campaignState.draft)).toBeVisible()
  const grades = PARTICIPATING_CLASSES.map((c) => c.grade)
  await expect(page.getByText(t.campaigns.classes.summary(PARTICIPATING_CLASSES.length, [Math.min(...grades), Math.max(...grades)]))).toBeVisible()
  await expect(page.getByText(t.campaigns.classes.notTakingPart(LEFT_OUT))).toBeVisible()
  await shot(page, '14-wahl-in-vorbereitung')
  await picture(page, 'anmeldung-in-vorbereitung', [page.getByRole('heading', { name: sample.projectWeek }), section(page, t.campaign.organization.heading)])
  // Every step is asked once more, with what it does; the deletion is offered beside it while the registration is in preparation.
  await expect(page.getByRole('button', { name: t.campaign.organization.delete })).toBeVisible()
  await page.getByRole('button', { name: t.campaign.organization.collect }).click()
  const confirm = page.getByRole('form', { name: t.campaign.transitions.confirm })
  await expect(confirm).toContainText(t.campaign.transitions.consequences.catalogue[0] ?? '')
  await picture(page, 'schritt-bestaetigen', confirm)
  await confirm.getByRole('button', { name: t.campaign.transitions.submit(t.campaign.organization.collect) }).click()
  await expect(page.getByText(t.labels.campaignState.catalogue)).toBeVisible()

  // The school's categories, for the rule the registration gets with its window (04-einstellungen); a name once, in any case.
  await page.getByRole('link', { name: t.common.page.categories }).click()
  await expect(page.getByRole('heading', { name: t.common.page.categories })).toBeVisible()
  await expect(page.getByText(t.categories.none)).toBeVisible()
  await page.getByLabel(t.categories.newName).fill(sample.sport)
  await page.getByRole('button', { name: t.categories.add }).click()
  await expect(page.getByRole('status')).toHaveText(t.categories.added)
  await expect(page.getByRole('row', { name: new RegExp(literally(sample.sport)) })).toContainText(t.categories.usage(0, 0))
  await page.getByLabel(t.categories.newName).fill(sample.sport.toUpperCase())
  await refused(page, 409, () => page.getByRole('button', { name: t.categories.add }).click())
  await expect(page.getByRole('alert')).toHaveText(t.errors.category_exists)
  await signOut(page)
  // The school's other categories, its teachers' availability and activities, until mid-February.
  await loadStage(page, 'catalogue')
})

test('eine Lehrkraft trägt ein, an welchen Projekttagen sie da ist', async ({ page }) => {
  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.availability.link }).click()
  await expect(page.getByRole('heading', { name: t.common.page.availability })).toBeVisible()
  await expect(page.getByLabel(t.availability.statusOn(day('2034-07-03')))).toHaveValue('available')
  await page.getByLabel(t.availability.statusOn(day('2034-07-04'))).selectOption('unavailable')
  await expect(page.getByText(t.availability.saved)).toBeVisible()
  await page.reload()
  await expect(page.getByLabel(t.availability.statusOn(day('2034-07-04')))).toHaveValue('unavailable')
  await picture(page, 'verfuegbarkeit', page.locator('main'))
  await signOut(page)
})

test('eine Lehrkraft reicht eine Aktivität ein, eine Klassenaktivität nähme ganze Klassen mit; die Organisation genehmigt und veröffentlicht', async ({ page }) => {
  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.common.page.newItem }).click()
  await expect(page.getByRole('heading', { name: t.common.page.newItem })).toBeVisible()
  await page.getByLabel(t.item.title).fill(sample.climbing)
  await page.getByLabel(t.item.description).fill(sample.climbingDescription)
  // In the school's periods: Monday from the 2nd period, four periods long (08:30 – 12:15).
  await page.getByLabel(t.common.field.day, { exact: true }).selectOption('2034-07-03')
  await page.getByLabel(t.item.sessions.fromPeriod).selectOption('2')
  await page.getByLabel(t.item.sessions.count, { exact: true }).fill('4')
  await expect(page.getByText('08:30 – 12:15')).toBeVisible()
  await page.getByLabel(t.common.field.places, { exact: true }).fill(String(CLIMBING.places))
  await page.getByLabel(t.item.participation.minParticipants).fill('6')
  // For the upper school, whose Monday morning it fits.
  const grades = page.getByRole('group', { name: t.item.participation.eligibleGrades })
  for (const grade of CLIMBING.grades) await grades.getByLabel(`${grade}.`, { exact: true }).check()
  await page.getByLabel(t.item.fee.amount).fill(sample.climbingFee)
  await page.getByLabel(t.item.fee.note).fill(sample.climbingFeeNote)
  await page.getByRole('group', { name: t.item.categories.intro }).getByLabel(sample.sport).check()
  // One companion wanted beside the lead: sought, until someone signs up on the list.
  await page.getByLabel(t.item.teachers.wanted).fill('1')
  await expect(page.getByText(t.item.participants.lead(BERND.name))).toBeVisible()
  await expect(page.getByText(t.item.teachers.sought(1))).toBeVisible()
  await shot(page, '15-neue-aktivitaet')
  await picture(page, 'aktivitaet-beschreibung', [page.getByRole('heading', { name: t.common.page.newItem }), page.getByLabel(t.item.teachers.search)])
  await picture(page, 'aktivitaet-termine', [page.getByRole('heading', { name: t.common.field.sessions, exact: true }), page.getByRole('button', { name: t.item.sessions.add })])
  await picture(page, 'aktivitaet-teilnahme', [page.getByRole('heading', { name: t.item.participation.heading }), page.getByRole('button', { name: t.item.saveAndPropose })])
  // Below the sessions the form says where the places go: the school's activities reached the upper school's Monday target already.
  await expect(page.getByText(t.item.gate.bringsNothing)).toBeVisible()
  await page.getByRole('button', { name: t.item.saveAndPropose }).click()
  await expect(page.getByRole('heading', { name: sample.projectWeek })).toBeVisible()
  const row = page.getByRole('row', { name: climbing })
  // Back on the list the saved activity is marked, under the day it starts on.
  await expect(row).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('rowheader', { name: new RegExp(`^${literally(day('2034-07-03'))} · `) })).toBeVisible()
  await expect(row).toContainText(t.labels.itemState.proposed)
  await expect(row).toContainText(t.item.participants.lead(BERND.name))
  await expect(row).toContainText(fee(1500))
  await shot(page, '16-wahl-eingereicht')
  await signOut(page)

  // The organization locks new offers: from now on an activity that goes only where the target is reached is refused to a teacher.
  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('button', { name: t.campaign.organization.editSettings }).click()
  const settings = page.getByRole('form', { name: t.campaign.settings.label })
  await settings.getByLabel(t.campaign.settings.lockNewOffers).check()
  await settings.getByRole('button', { name: t.common.save }).click()
  await expect(page.getByRole('status')).toHaveText(t.common.saved)
  await signOut(page)

  // Carla, a teacher and nothing more (Bernd organizes too, and the gate lets an organizer through).
  await openAs(page, CARLA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.common.page.newItem }).click()
  await page.getByLabel(t.item.title).fill(sample.yoga)
  await page.getByLabel(t.common.field.day, { exact: true }).selectOption('2034-07-03')
  await page.getByLabel(t.item.sessions.count, { exact: true }).fill('1')
  for (const grade of CLIMBING.grades) await page.getByRole('group', { name: t.item.participation.eligibleGrades }).getByLabel(`${grade}.`, { exact: true }).check()
  // The form says so before the submission, and the submission is refused with the day; the activity stays a draft.
  await expect(page.getByText(anyText((d) => t.item.gate.refused(d, null)))).toBeVisible()
  await expect(page.getByText(t.item.gate.advice)).toBeVisible()
  await picture(page, 'sperre', [page.getByText(t.item.gate.bringsNothing), page.getByText(t.item.gate.advice)])
  await refused(page, 409, () => page.getByRole('button', { name: t.item.saveAndPropose }).click())
  await expect(page.getByRole('alert')).toContainText(t.item.gate.refused(day('2034-07-03'), null))
  await page.getByRole('link', { name: `← ${t.common.backToCampaign}` }).click()
  const yoga = page.getByRole('row', { name: new RegExp(literally(sample.yoga)) })
  await expect(yoga).toContainText(t.labels.itemState.draft)
  await yoga.getByRole('button', { name: t.campaign.items.delete }).click()
  await expect(page.getByRole('row', { name: new RegExp(literally(sample.yoga)) })).toHaveCount(0)
  // An activity of its teachers alone, in the same period: no places and no class. The form says so, the lock does not refuse it, and the list marks it.
  await page.getByRole('link', { name: t.common.page.newItem }).click()
  await page.getByLabel(t.item.title).fill(sample.supervision)
  await page.getByLabel(t.common.field.day, { exact: true }).selectOption('2034-07-03')
  await page.getByLabel(t.item.sessions.count, { exact: true }).fill('1')
  await page.getByLabel(t.common.field.places, { exact: true }).fill('0')
  await expect(page.getByText(t.item.participation.staffOnly)).toBeVisible()
  await expect(page.getByLabel(t.item.participation.minParticipants)).toHaveCount(0)
  await picture(page, 'nur-lehrkraefte', [page.getByRole('heading', { name: t.item.participation.heading }), page.getByText(t.item.participation.staffOnly)])
  await page.getByRole('button', { name: t.item.saveAndPropose }).click()
  await expect(page.getByRole('heading', { name: sample.projectWeek })).toBeVisible()
  const supervision = page.getByRole('row', { name: new RegExp(literally(sample.supervision)) })
  await expect(supervision).toContainText(t.labels.itemState.proposed)
  await expect(supervision).toContainText(t.campaign.items.staffOnly)
  // Only her own: the filter leaves the supervision, and with it the header of its day.
  await page.getByLabel(t.filters.onlyMine).check()
  await expect(page.getByRole('row', { name: climbing })).toHaveCount(0)
  await picture(page, 'aktivitaeten-nach-tag', [page.getByRole('group', { name: t.filters.label }), supervision])
  await page.getByLabel(t.filters.onlyMine).uncheck()
  // Taken back and deleted, so the journeys after this one go by a catalogue without it.
  await supervision.getByRole('button', { name: t.campaign.items.unpropose }).click()
  await supervision.getByRole('button', { name: t.campaign.items.delete }).click()
  await expect(page.getByRole('row', { name: new RegExp(literally(sample.supervision)) })).toHaveCount(0)
  await signOut(page)

  // A class activity takes whole classes: its places become the extra ones other students may rank, and it has no minimum, since it always takes place.
  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.common.page.newItem }).click()
  await page.getByLabel(t.item.title).fill(sample.vienna)
  await page.getByRole('group', { name: t.item.participation.fixedClasses }).getByLabel('5A').check()
  await expect(page.getByLabel(t.item.participation.extraPlaces)).toBeVisible()
  await expect(page.getByLabel(t.item.participation.minParticipants)).toHaveCount(0)
  // On a day Bernd is not there, the form says so and still lets him save.
  await page.getByLabel(t.common.field.day, { exact: true }).selectOption('2034-07-04')
  await expect(page.getByText(t.item.teachers.unavailableOn(BERND.name, day('2034-07-04')))).toBeVisible()
  await picture(page, 'klassenaktivitaet', [page.getByRole('heading', { name: t.item.participation.heading }), page.getByRole('group', { name: t.item.participation.eligibleClasses })])
  // With 1A instead, on Tuesday morning: 1A is at the zoo then (the school's trip), so the form says so, and the submission is refused with it.
  const zoo = SCHOOL.items.find((item) => item.key === 'tue-1a-zoo')
  const zooLead = SCHOOL.teachers.find((teacher) => teacher.oid === zoo?.teachers[0])
  if (!zoo || !zooLead) throw new Error('the scenario takes 1A to the zoo on Tuesday')
  await page.getByRole('group', { name: t.item.participation.fixedClasses }).getByLabel('5A').uncheck()
  await page.getByRole('group', { name: t.item.participation.fixedClasses }).getByLabel('1A').check()
  const conflict = t.item.conflict('1A', day('2034-07-04'), '08:30', '10:15', zoo.title, zooLead.name)
  await expect(page.getByText(conflict)).toBeVisible()
  await refused(page, 409, () => page.getByRole('button', { name: t.item.saveAndPropose }).click())
  await expect(page.getByRole('alert')).toContainText(conflict)
  // Saved as a draft by the refused submission; deleted, so the journeys after this one go by a catalogue without it.
  await page.getByRole('link', { name: `← ${t.common.backToCampaign}` }).click()
  await expect(page.getByRole('row', { name: climbing })).toBeVisible()
  const vienna = page.getByRole('row', { name: new RegExp(literally(sample.vienna)) })
  await expect(vienna).toContainText(t.labels.itemState.draft)
  await vienna.getByRole('button', { name: t.campaign.items.delete }).click()
  await expect(page.getByRole('row', { name: new RegExp(literally(sample.vienna)) })).toHaveCount(0)
  await signOut(page)

  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  // Each activity says when it was first submitted; by that order the climbing, submitted last, comes last, and its row says where its places would go.
  await expect(page.getByRole('columnheader', { name: t.campaign.items.firstProposedAt })).toBeVisible()
  await page.getByLabel(t.campaign.items.order).selectOption('proposed')
  await expect(page.getByRole('row').last()).toContainText(sample.climbing)
  await expect(page.getByRole('row', { name: climbing })).toContainText(t.campaign.items.bringsNothing)
  await page.getByLabel(t.campaign.items.order).selectOption('number')
  // The submitted climbing, the last of the school's activities: its row, buttons included where the table runs past the column.
  await picture(page, 'aktivitaeten-pruefen', page.getByRole('row', { name: climbing }))
  // Returning it would leave Bernd, who has the duty to lead, with nothing in this registration: the form says so and nothing more; left where it is.
  await page.getByRole('row', { name: climbing }).getByRole('button', { name: t.campaign.items.return }).click()
  const returning = page.getByRole('form', { name: t.campaign.pending.returnTitle(sample.climbing) })
  await expect(returning.getByText(t.campaign.pending.leadsNothing(BERND.name))).toBeVisible()
  await returning.getByRole('button', { name: t.common.cancel }).click()
  // The submitted activities one after the other: the climbing is the only one waiting; it says where its places go, and is approved here.
  await page.getByRole('link', { name: t.review.link }).click()
  await expect(page.getByRole('heading', { name: t.review.heading })).toBeVisible()
  await expect(page.getByText(t.review.position(1, 1))).toBeVisible()
  await expect(page.getByRole('heading', { name: sample.climbing })).toBeVisible()
  await expect(page.getByText(t.campaign.items.bringsNothing)).toBeVisible()
  await expect(page.getByRole('heading', { name: t.review.after })).toBeVisible()
  await picture(page, 'eingereichte-durchgehen', page.locator('main'))
  await page.getByRole('button', { name: t.campaign.items.approve }).click()
  await expect(page.getByText(t.review.none)).toBeVisible()
  await page.getByRole('link', { name: `← ${t.review.back}` }).click()
  await expect(page.getByRole('row', { name: climbing })).toContainText(t.labels.itemState.approved)

  // Teachers by day: Bernd leads climbing on Monday and is not there on Tuesday; the organization changes that.
  await page.getByRole('link', { name: t.common.page.planning }).click()
  await expect(page.getByRole('heading', { name: t.common.page.planning })).toBeVisible()
  const bernd = page.getByRole('row', { name: new RegExp(literally(BERND.name)) })
  await expect(bernd).toContainText(t.planning.leads(sample.climbing))
  const tuesday = page.getByLabel(t.planning.statusOf(BERND.name, day('2034-07-04')))
  await expect(tuesday).toHaveValue('unavailable')
  await tuesday.selectOption('if_needed')
  await expect(page.getByText(t.planning.saved)).toBeVisible()
  await expect(tuesday).toHaveValue('if_needed')
  await expect(page.getByRole('link', { name: t.planning.export })).toBeVisible()
  // Carla's abbreviation, set beside her name: the one correction the list import is too much for.
  await page.getByRole('button', { name: t.planning.shortName.edit(CARLA.name) }).click()
  const shortName = page.getByRole('form', { name: t.planning.shortName.label(CARLA.name) })
  await shortName.getByRole('textbox').fill('KnC')
  await shortName.getByRole('button', { name: t.planning.shortName.save }).click()
  await expect(page.getByText(t.planning.shortName.saved)).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(literally(CARLA.name)) }).first()).toContainText('(KnC)')
  // The school's list for Carla: only if necessary on Monday, with a remark; checked, pictured, applied.
  const csv = page.getByRole('form', { name: t.planning.csv.title })
  await csv.getByLabel(t.planning.csv.paste).fill(`email;MO;DI;MI;Leitung;Anmerkung\n${CARLA.email};F;;;N;${sample.reserveOnly}\n`)
  await csv.getByRole('button', { name: t.planning.csv.check }).click()
  const check = section(page, t.planning.csv.title)
  await expect(check.getByRole('row', { name: new RegExp(literally(CARLA.name)) })).toContainText(`${t.labels.availability.available} → ${t.labels.availability.if_needed}`)
  await picture(page, 'verfuegbarkeit-import', check)
  await check.getByRole('button', { name: t.planning.csv.apply }).click()
  await expect(check.getByRole('status')).toHaveText(t.planning.csv.applied(1, 1, 0, 1))
  const carla = page.getByRole('row', { name: new RegExp(literally(CARLA.name)) }).first()
  await expect(carla).toContainText(sample.reserveOnly)
  await expect(page.getByLabel(t.planning.statusOf(CARLA.name, day('2034-07-03')))).toHaveValue('if_needed')
  // The sheet's Leitung column said N for Carla: no duty to lead, named in the line of her own, not among those who lead nothing.
  await expect(carla).toContainText(t.planning.duty.none)
  await expect(page.getByText(t.planning.withoutDuty(CARLA.name))).toBeVisible()
  const leadsNothing = page.getByText(anyText(t.planning.leadsNothing))
  if (await leadsNothing.count() > 0) await expect(leadsNothing).not.toContainText(CARLA.name)
  await picture(page, 'lehrkraefte-je-tag', page.locator('main'))
  await page.getByRole('link', { name: `← ${t.common.backToCampaign}` }).click()
  await page.getByRole('button', { name: t.campaign.organization.publish }).click()
  await page.getByRole('form', { name: t.campaign.transitions.confirm }).getByRole('button', { name: t.campaign.transitions.submit(t.campaign.organization.publish) }).click()
  await expect(page.getByText(t.labels.campaignState.published)).toBeVisible()
  await expect(page.getByRole('button', { name: t.campaign.organization.backToCatalogue })).toBeVisible()
  // Numbered in the order of the printed catalogue: by first session, then by title.
  await expect(page.getByRole('row', { name: climbing }).getByRole('cell').first()).toHaveText(String(climbingNumber(sample.climbing)))
  await expect(page.getByRole('link', { name: t.campaign.organization.catalogueExport })).toBeVisible()
  await shot(page, '17-katalog-veroeffentlicht')
  await signOut(page)
})

test('eine Lehrkraft trägt sich auf der Liste als Begleitung ein; die Tabelle zählt sie', async ({ page }) => {
  // Carla, available on Monday only if needed, which passes: the climbing seeks one companion, and she is it.
  await openAs(page, CARLA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await page.getByRole('link', { name: t.companions.link }).click()
  await expect(page.getByRole('heading', { name: t.companions.heading })).toBeVisible()
  const monday = page.getByRole('region', { name: day('2034-07-03') })
  await expect(monday.getByText(t.companions.myStatus(t.labels.availability.if_needed))).toBeVisible()
  const row = monday.getByRole('row', { name: climbing })
  await expect(row).toContainText(t.item.teachers.sought(1))
  await picture(page, 'begleitung-gesucht', [page.getByRole('heading', { name: t.companions.heading }), row])
  await row.getByRole('button', { name: `${t.companions.join}: ${sample.climbing}` }).click()
  await expect(page.getByRole('status')).toHaveText(t.companions.joined)
  await expect(row).toContainText(t.companions.accompanying)
  await expect(row).toContainText(t.item.teachers.complete)
  // Published, the registration not yet open: she could still take herself off; she stays. The table counts her.
  await expect(row.getByRole('button', { name: `${t.companions.leave}: ${sample.climbing}` })).toBeVisible()
  await page.getByRole('link', { name: `← ${t.common.backToCampaign}` }).click()
  await expect(page.getByRole('row', { name: climbing })).toContainText(t.campaign.items.companionsOf(1, 1))
  await signOut(page)
})

test('Schüler*innen lesen den veröffentlichten Katalog mit Nummern', async ({ page }) => {
  await openAs(page, SARA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await expect(page.getByRole('link', { name: t.common.page.newItem })).toHaveCount(0)
  await page.getByRole('link', { name: t.campaign.items.viewCatalogue }).click()
  await expect(page.getByRole('heading', { name: t.catalogue.titleOf(sample.projectWeek) })).toBeVisible()
  const heading = `${climbingNumber(sample.climbing)} · ${sample.climbing}`
  const item = page.locator('.catalogue-item').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
  await expect(item.getByText(`${day('2034-07-03')}, ${t.format.periods(2, 5)} (08:30 – 12:15)`)).toBeVisible()
  await expect(item.getByText(`${t.catalogue.places(CLIMBING.places)} · ${t.catalogue.forWhom(t.catalogue.grades(CLIMBING.grades))} · ${t.catalogue.fee(fee(1500))}`)).toBeVisible()
  await expect(page.getByRole('button', { name: t.catalogue.print })).toBeVisible()
  // Climbing is sport: the catalogue says so, and filters by it.
  await expect(item.getByText(sample.sport, { exact: true })).toBeVisible()
  await page.getByLabel(t.catalogue.categoryFilter).selectOption({ label: sample.sport })
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  await page.getByLabel(t.catalogue.categoryFilter).selectOption({ label: t.catalogue.allCategories })
  await shot(page, '18-katalog')
  await picture(page, 'katalog', page.locator('main'))
  await signOut(page)
})
