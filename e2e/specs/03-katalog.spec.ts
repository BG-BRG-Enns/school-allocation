// Der Katalog: die Organisation legt eine Anmeldung an und sammelt Aktivitäten,
// eine Lehrkraft trägt ihre Verfügbarkeit ein und reicht eine Aktivität ein,
// die Organisation sieht die Lehrkräfte je Tag, genehmigt und veröffentlicht,
// und Schüler*innen lesen den nummerierten Katalog. Baut
// auf den Klassenlisten aus 02-stammdaten auf (Anna organisiert als
// Administratorin, Bernd ist Lehrkraft, Sara Schülerin der 5A).

import { expect, test } from '../support/test.ts'
import { ANNA, BERND, SARA } from '../support/personas.ts'
import { picture, section, shot } from '../support/screenshot.ts'
import { openAs, signOut } from '../support/sign-in.ts'
import { day, fee, literally, t } from '../support/messages.ts'
import { sample } from '../support/sample.ts'

test.describe.configure({ mode: 'serial' })

const climbing = new RegExp(literally(sample.climbing))

test('die Organisation legt die Anmeldung an und öffnet sie für Aktivitäten', async ({ page }) => {
  await openAs(page, ANNA, '/wahlen')
  await expect(page.getByRole('heading', { name: t.common.page.campaigns })).toBeVisible()
  await page.getByLabel(t.campaign.settings.name, { exact: true }).fill(sample.projectWeek)
  await page.getByLabel(t.common.field.schoolYear).fill('2033/34')
  await page.getByLabel(t.campaign.settings.projectDay(1)).fill('2034-07-03')
  await page.getByRole('button', { name: t.common.addDay }).click()
  await page.getByLabel(t.campaign.settings.projectDay(2)).fill('2034-07-04')
  await shot(page, '13-wahl-anlegen')
  await picture(page, 'anmeldung-anlegen', section(page, t.campaigns.new))
  await page.getByRole('button', { name: t.campaigns.create }).click()
  await expect(page.getByRole('heading', { name: sample.projectWeek })).toBeVisible()
  await expect(page.getByText(t.labels.campaignState.draft)).toBeVisible()
  await shot(page, '14-wahl-in-vorbereitung')
  await picture(page, 'anmeldung-in-vorbereitung', [page.getByRole('heading', { name: sample.projectWeek }), section(page, t.campaign.organization.heading)])
  await page.getByRole('button', { name: t.campaign.organization.collect }).click()
  await expect(page.getByText(t.labels.campaignState.catalogue)).toBeVisible()
  await signOut(page)
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
  await page.getByLabel(t.item.sessions.minutesOn(day('2034-07-03'))).fill('210')
  await page.getByLabel(t.common.field.places, { exact: true }).fill('12')
  await page.getByLabel(t.item.participation.minParticipants).fill('6')
  await page.getByLabel(t.item.fee.amount).fill(sample.climbingFee)
  await page.getByLabel(t.item.fee.note).fill(sample.climbingFeeNote)
  await expect(page.getByText(t.item.participants.lead(BERND.name))).toBeVisible()
  await shot(page, '15-neue-aktivitaet')
  await picture(page, 'aktivitaet-beschreibung', [page.getByRole('heading', { name: t.common.page.newItem }), page.getByLabel(t.item.teachers.search)])
  await picture(page, 'aktivitaet-termine', [page.getByRole('heading', { name: t.common.field.sessions, exact: true }), page.getByRole('button', { name: t.item.sessions.add })])
  await picture(page, 'aktivitaet-teilnahme', [page.getByRole('heading', { name: t.item.participation.heading }), page.getByRole('button', { name: t.item.saveAndPropose })])
  await page.getByRole('button', { name: t.item.saveAndPropose }).click()
  await expect(page.getByRole('heading', { name: sample.projectWeek })).toBeVisible()
  const row = page.getByRole('row', { name: climbing })
  await expect(row).toContainText(t.labels.itemState.proposed)
  await expect(row).toContainText(BERND.name)
  await expect(row).toContainText(fee(1500))
  await shot(page, '16-wahl-eingereicht')

  // A class activity takes whole classes: its places become the extra ones other students may rank, and it has no minimum, since it always takes place.
  await page.getByRole('link', { name: t.common.page.newItem }).click()
  await page.getByLabel(t.item.title).fill(sample.vienna)
  await page.getByRole('group', { name: t.item.participation.fixedClasses }).getByLabel('5A').check()
  await expect(page.getByLabel(t.item.participation.extraPlaces)).toBeVisible()
  await expect(page.getByLabel(t.item.participation.minParticipants)).toHaveCount(0)
  // On a day Bernd is not there, the form says so and still lets him save.
  await page.getByLabel(t.common.field.day, { exact: true }).selectOption('2034-07-04')
  await expect(page.getByText(t.item.teachers.unavailableOn(BERND.name, day('2034-07-04')))).toBeVisible()
  await picture(page, 'klassenaktivitaet', [page.getByRole('heading', { name: t.item.participation.heading }), page.getByRole('group', { name: t.item.participation.eligibleClasses })])
  // Left unsaved: the journeys after this one go by a catalogue without it.
  await page.getByRole('link', { name: `← ${t.common.backToCampaign}` }).click()
  await expect(page.getByRole('row', { name: climbing })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(literally(sample.vienna)) })).toHaveCount(0)
  await signOut(page)

  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await picture(page, 'aktivitaeten-pruefen', section(page, t.campaign.items.heading))
  await page.getByRole('row', { name: climbing }).getByRole('button', { name: t.campaign.items.approve }).click()
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
  await page.getByRole('link', { name: `← ${t.common.backToCampaign}` }).click()
  await page.getByRole('button', { name: t.campaign.organization.publish }).click()
  await expect(page.getByText(t.labels.campaignState.published)).toBeVisible()
  await expect(page.getByRole('row', { name: climbing })).toContainText('1')
  await expect(page.getByRole('link', { name: t.campaign.organization.catalogueExport })).toBeVisible()
  await shot(page, '17-katalog-veroeffentlicht')
  await signOut(page)
})

test('Schüler*innen lesen den veröffentlichten Katalog mit Nummern', async ({ page }) => {
  await openAs(page, SARA, '/wahlen')
  await page.getByRole('link', { name: sample.projectWeek }).click()
  await expect(page.getByRole('link', { name: t.common.page.newItem })).toHaveCount(0)
  await page.getByRole('link', { name: t.campaign.items.viewCatalogue }).click()
  await expect(page.getByRole('heading', { name: t.catalogue.titleOf(sample.projectWeek) })).toBeVisible()
  await expect(page.getByRole('heading', { name: `1 · ${sample.climbing}` })).toBeVisible()
  await expect(page.getByText(`${day('2034-07-03')}, ${t.format.periods(2, 5)} (08:30 – 12:15)`)).toBeVisible()
  await expect(page.getByText(`${t.catalogue.places(12)} · ${t.catalogue.forWhom(t.catalogue.allGrades)} · ${t.catalogue.fee(fee(1500))}`)).toBeVisible()
  await expect(page.getByRole('button', { name: t.catalogue.print })).toBeVisible()
  await shot(page, '18-katalog')
  await picture(page, 'katalog', page.locator('main'))
  await signOut(page)
})
