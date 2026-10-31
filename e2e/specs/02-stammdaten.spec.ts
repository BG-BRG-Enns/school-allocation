// Klassenlisten: die Administratorin liest die Klassenlisten ein, aus einer
// CSV-Datei und aus den Entra-Gruppen, prüft die Änderungen und übernimmt
// sie; wer in der Liste steht, ist nach dem Einloggen zugeordnet, wer nicht,
// wird von der Administratorin zugeordnet; Rollen werden erteilt.

import { expect, test } from '../support/test.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from '../support/personas.ts'
import { picture, section, shot } from '../support/screenshot.ts'
import { sample } from '../support/sample.ts'
import { openAs, signOut } from '../support/sign-in.ts'
import { t } from '../support/messages.ts'
import { CLASS_5A_GROUP, TEACHERS_GROUP } from '../../apps/api/test/helpers/fake-graph.ts'

test.describe.configure({ mode: 'serial' })

const CSV = [
  'email;given_name;family_name;class;grade;kind',
  `${SARA.email};Sara;Schülerin;5A;9;student`,
  `${ANNA.email};Anna;Lehrerin;;;teacher`,
  `${BERND.email};Bernd;Lehrer;;;teacher`,
  'carla.anders@schule.example.org;Carla;Kollegin;;;teacher',
].join('\n')

test('die Administratorin importiert eine CSV-Datei, sieht die Änderungen und übernimmt die Liste', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung')
  await expect(page.getByRole('heading', { name: t.common.page.admin })).toBeVisible()
  await page.getByRole('link', { name: t.common.page.roster }).click()
  await expect(page.getByRole('heading', { name: t.common.page.roster })).toBeVisible()
  await expect(page.getByText(t.roster.current.none)).toBeVisible()
  await shot(page, '04-stammdaten-leer')

  await page.getByLabel(t.roster.csv.paste).fill(CSV)
  await page.getByLabel(t.common.field.schoolYear).last().fill('2026/27')
  await picture(page, 'csv-hochladen', section(page, t.roster.csv.title))
  await page.getByRole('button', { name: t.roster.csv.import }).click()
  await expect(page.getByRole('heading', { name: t.rosterImport.title })).toBeVisible()
  await expect(page.getByText(t.rosterImport.changes.summary({ added: 4, removed: 0, changed: 0, unchanged: 0 }))).toBeVisible()
  await expect(page.getByText(t.labels.batchState.pending)).toBeVisible()
  await shot(page, '05-import-pruefung')
  await page.getByRole('button', { name: t.rosterImport.changes.commit }).click()
  await expect(page.getByRole('status')).toHaveText(t.rosterImport.changes.committed)
  await expect(page.getByText(t.labels.batchState.committed, { exact: true })).toBeVisible()

  await page.getByRole('link', { name: `← ${t.common.page.roster}` }).click()
  await expect(page.getByText(t.roster.current.none)).toHaveCount(0)
  await expect(page.getByRole('table').last().getByRole('row')).toHaveCount(2)
  await shot(page, '06-stammdaten-liste')
  await picture(page, 'importe', section(page, t.roster.batches.title))
  await signOut(page)
})

test('wer in der Liste steht, ist nach der Anmeldung zugeordnet; wer nicht, wird von der Administratorin zugeordnet', async ({ page }) => {
  await openAs(page, SARA, '/konto')
  await expect(page.getByText(t.account.student(t.labels.kind.student, '5A', 9))).toBeVisible()
  // A student's pages explain themselves: no help link.
  await expect(page.getByRole('link', { name: t.shell.help })).toHaveCount(0)
  await shot(page, '07-konto-zugeordnet')
  await signOut(page)

  // Carla's account carries another address than the list: not recognised.
  await openAs(page, CARLA, '/konto')
  await expect(page.getByText(t.account.unbound)).toBeVisible()
  await signOut(page)

  await openAs(page, ANNA, '/verwaltung/personen')
  await expect(page.getByRole('heading', { name: t.common.page.people })).toBeVisible()
  await page.getByLabel(t.people.accounts.unboundOnly).check()
  const carlaRow = page.getByRole('row', { name: new RegExp(CARLA.name) })
  await expect(carlaRow).toContainText(t.people.accounts.unbound)
  await carlaRow.getByRole('button', { name: t.people.open.bind }).click()
  const panel = page.getByRole('form', { name: t.people.title.bind(CARLA.name) })
  await panel.getByLabel(t.people.personSearch).fill('Kollegin')
  await panel.getByRole('radio', { name: /Carla Kollegin/ }).check()
  await panel.getByLabel(t.common.field.reason).fill(sample.reason.otherAccount)
  await shot(page, '08-konto-zuordnen')
  await picture(page, 'konto-zuordnen', section(page, t.people.accounts.title))
  await panel.getByRole('button', { name: t.people.submit.bind }).click()
  await expect(panel).toHaveCount(0)
  await page.getByLabel(t.people.accounts.unboundOnly).uncheck()
  await expect(page.getByRole('row', { name: new RegExp(CARLA.name) })).toContainText(t.labels.kind.teacher)
  await signOut(page)

  await openAs(page, CARLA, '/konto')
  await expect(page.getByText(t.labels.kind.teacher, { exact: true })).toBeVisible()
  await signOut(page)
})

test('die Administratorin erteilt eine Rolle, die beim nächsten Seitenaufruf gilt', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung/personen')
  // Bernd has not signed in yet, so he has no account to grant a role to.
  await expect(page.getByRole('row', { name: new RegExp(BERND.name) })).toHaveCount(0)
  await signOut(page)
  await openAs(page, BERND, '/konto')
  await expect(page.getByText(t.account.noRoles)).toBeVisible()
  await signOut(page)

  await openAs(page, ANNA, '/verwaltung/personen')
  await page.getByRole('row', { name: new RegExp(BERND.name) }).getByRole('button', { name: t.people.open.grant }).click()
  const panel = page.getByRole('form', { name: t.people.title.grant(BERND.name) })
  await panel.getByLabel(t.common.field.role).selectOption('campaign_organizer')
  await panel.getByLabel(t.common.field.reason).fill(sample.reason.organizes)
  await shot(page, '09-rolle-erteilen')
  await picture(page, 'rolle-erteilen', panel)
  await panel.getByRole('button', { name: t.people.submit.grant }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('row', { name: new RegExp(BERND.name) }).first()).toContainText(t.labels.role.campaign_organizer)
  await shot(page, '10-konten-und-rollen')
  await picture(page, 'konten-und-rollen', [section(page, t.people.accounts.title), section(page, t.people.roles)])
  await signOut(page)

  await openAs(page, BERND, '/konto')
  await expect(page.getByRole('listitem').filter({ hasText: t.labels.role.campaign_organizer })).toBeVisible()
  await signOut(page)
})

test('die Administratorin liest die Klassenlisten aus den Entra-Gruppen mit ihrem eigenen Konto', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung/stammdaten')
  await page.getByRole('button', { name: t.roster.groups.add }).click()
  await page.getByLabel(t.roster.groups.fieldOf(t.roster.groups.id, t.roster.groups.newGroup)).fill(CLASS_5A_GROUP)
  await page.getByLabel(t.roster.groups.fieldOf(t.roster.groups.label, CLASS_5A_GROUP)).fill('5A')
  await page.getByLabel(t.roster.groups.fieldOf(t.common.field.className, '5A')).fill('5A')
  await page.getByLabel(t.roster.groups.fieldOf(t.common.field.grade, '5A')).fill('9')
  await page.getByRole('button', { name: t.roster.groups.add }).click()
  await page.getByLabel(t.roster.groups.fieldOf(t.roster.groups.id, t.roster.groups.newGroup)).fill(TEACHERS_GROUP)
  await page.getByLabel(t.roster.groups.fieldOf(t.roster.groups.label, TEACHERS_GROUP)).fill(sample.teachersGroup)
  await page.getByLabel(t.roster.groups.fieldOf(t.roster.groups.kind, sample.teachersGroup)).selectOption('teacher')
  await page.getByRole('button', { name: t.roster.groups.save }).click()
  await expect(page.getByRole('status')).toHaveText(t.roster.groups.saved)
  await shot(page, '11-entra-gruppen')
  await picture(page, 'entra-gruppen', section(page, t.roster.groups.title))

  await page.getByRole('link', { name: t.roster.refresh.start }).click()
  await expect(page.getByRole('heading', { name: 'Anmeldung (Test)' })).toBeVisible()
  await page.getByRole('button', { name: ANNA.name }).click()
  await expect(page.getByRole('heading', { name: t.rosterImport.title })).toBeVisible()
  await expect(page).toHaveURL(/\/verwaltung\/stammdaten\/import\/[0-9a-f-]+$/)
  // Tim is new; Carla's list entry carried another address, so her group member is new too and the old entry goes.
  await expect(page.getByText(t.rosterImport.changes.summary({ added: 2, removed: 1, changed: 0, unchanged: 3 }))).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(TIM.name) })).toBeVisible()
  await shot(page, '12-import-entra')
  await picture(page, 'import-pruefen', page.locator('main'))
  await page.getByRole('button', { name: t.rosterImport.changes.commit }).click()
  await expect(page.getByRole('status')).toHaveText(t.rosterImport.changes.committed)
  await signOut(page)

  // Tim was never bound by address: the import knows his object id.
  await openAs(page, TIM, '/konto')
  await expect(page.getByText(t.account.student(t.labels.kind.student, '5A', 9))).toBeVisible()
  await signOut(page)
})
