// Stammdaten: die Administratorin importiert die Personenliste, aus einer
// CSV-Datei und aus den Entra-Gruppen, prüft die Änderungen und übernimmt
// sie; wer in der Liste steht, ist nach der Anmeldung zugeordnet, wer nicht,
// wird von der Administratorin zugeordnet; Rollen werden erteilt.

import { expect, test } from '../support/test.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from '../support/personas.ts'
import { shot } from '../support/screenshot.ts'
import { openAs, signOut } from '../support/sign-in.ts'
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
  await expect(page.getByRole('heading', { name: 'Verwaltung' })).toBeVisible()
  await page.getByRole('link', { name: 'Stammdaten' }).click()
  await expect(page.getByRole('heading', { name: 'Stammdaten' })).toBeVisible()
  await expect(page.getByText('Noch keine Personenliste übernommen.')).toBeVisible()
  await shot(page, '04-stammdaten-leer')

  await page.getByLabel('Oder Inhalt einfügen').fill(CSV)
  await page.getByLabel('Schuljahr').last().fill('2026/27')
  await page.getByRole('button', { name: 'Importieren' }).click()
  await expect(page.getByRole('heading', { name: 'Import' })).toBeVisible()
  await expect(page.getByText('4 neu, 0 entfernt, 0 geändert, 0 unverändert.')).toBeVisible()
  await expect(page.getByText('Zur Prüfung')).toBeVisible()
  await shot(page, '05-import-pruefung')
  await page.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByRole('status')).toHaveText('Die Liste gilt jetzt.')
  await expect(page.getByText('Übernommen', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: '← Stammdaten' }).click()
  await expect(page.getByText('Noch keine Personenliste übernommen.')).toHaveCount(0)
  await expect(page.getByRole('table').last().getByRole('row')).toHaveCount(2)
  await shot(page, '06-stammdaten-liste')
  await signOut(page)
})

test('wer in der Liste steht, ist nach der Anmeldung zugeordnet; wer nicht, wird von der Administratorin zugeordnet', async ({ page }) => {
  await openAs(page, SARA, '/konto')
  await expect(page.getByText('Schüler/in, Klasse 5A (9. Schulstufe)')).toBeVisible()
  await shot(page, '07-konto-zugeordnet')
  await signOut(page)

  // Carla's account carries another address than the list: not recognised.
  await openAs(page, CARLA, '/konto')
  await expect(page.getByText('Noch keiner Person der Schule zugeordnet.')).toBeVisible()
  await signOut(page)

  await openAs(page, ANNA, '/verwaltung/personen')
  await expect(page.getByRole('heading', { name: 'Konten und Rollen' })).toBeVisible()
  await page.getByLabel('nur ohne Zuordnung').check()
  const carlaRow = page.getByRole('row', { name: new RegExp(CARLA.name) })
  await expect(carlaRow).toContainText('Nicht zugeordnet')
  await carlaRow.getByRole('button', { name: 'Zuordnen' }).click()
  const panel = page.getByRole('form', { name: `${CARLA.name} einer Person zuordnen` })
  await panel.getByLabel('Person der Schule').fill('Kollegin')
  await panel.getByRole('radio', { name: /Carla Kollegin/ }).check()
  await panel.getByLabel('Begründung').fill('Anderes Konto als in der Liste')
  await shot(page, '08-konto-zuordnen')
  await panel.getByRole('button', { name: 'Zuordnen' }).click()
  await expect(panel).toHaveCount(0)
  await page.getByLabel('nur ohne Zuordnung').uncheck()
  await expect(page.getByRole('row', { name: new RegExp(CARLA.name) })).toContainText('Lehrkraft')
  await signOut(page)

  await openAs(page, CARLA, '/konto')
  await expect(page.getByText('Lehrkraft', { exact: true })).toBeVisible()
  await signOut(page)
})

test('die Administratorin erteilt eine Rolle, die beim nächsten Seitenaufruf gilt', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung/personen')
  // Bernd has not signed in yet, so he has no account to grant a role to.
  await expect(page.getByRole('row', { name: new RegExp(BERND.name) })).toHaveCount(0)
  await signOut(page)
  await openAs(page, BERND, '/konto')
  await expect(page.getByText('Keine besonderen Rollen.')).toBeVisible()
  await signOut(page)

  await openAs(page, ANNA, '/verwaltung/personen')
  await page.getByRole('row', { name: new RegExp(BERND.name) }).getByRole('button', { name: 'Rolle' }).click()
  const panel = page.getByRole('form', { name: `${BERND.name} eine Rolle erteilen` })
  await panel.getByLabel('Rolle').selectOption('campaign_organizer')
  await panel.getByLabel('Begründung').fill('Organisiert die Projektwoche')
  await shot(page, '09-rolle-erteilen')
  await panel.getByRole('button', { name: 'Rolle erteilen' }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('row', { name: new RegExp(BERND.name) }).first()).toContainText('Organisation einer Wahl')
  await shot(page, '10-konten-und-rollen')
  await signOut(page)

  await openAs(page, BERND, '/konto')
  await expect(page.getByRole('listitem').filter({ hasText: 'Organisation einer Wahl' })).toBeVisible()
  await signOut(page)
})

test('die Administratorin liest die Personenliste aus den Entra-Gruppen mit ihrem eigenen Konto', async ({ page }) => {
  await openAs(page, ANNA, '/verwaltung/stammdaten')
  await page.getByRole('button', { name: 'Gruppe hinzufügen' }).click()
  await page.getByLabel('Gruppen-ID neue Gruppe').fill(CLASS_5A_GROUP)
  await page.getByLabel(`Bezeichnung ${CLASS_5A_GROUP}`).fill('5A')
  await page.getByLabel('Klasse 5A').fill('5A')
  await page.getByLabel('Schulstufe 5A').fill('9')
  await page.getByRole('button', { name: 'Gruppe hinzufügen' }).click()
  await page.getByLabel('Gruppen-ID neue Gruppe').fill(TEACHERS_GROUP)
  await page.getByLabel(`Bezeichnung ${TEACHERS_GROUP}`).fill('Lehrkräfte')
  await page.getByLabel('Art Lehrkräfte').selectOption('teacher')
  await page.getByRole('button', { name: 'Gruppen speichern' }).click()
  await expect(page.getByRole('status')).toHaveText('Gruppen gespeichert.')
  await shot(page, '11-entra-gruppen')

  await page.getByRole('link', { name: 'Aus Entra-Gruppen aktualisieren' }).click()
  await expect(page.getByRole('heading', { name: 'Anmeldung (Test)' })).toBeVisible()
  await page.getByRole('button', { name: ANNA.name }).click()
  await expect(page.getByRole('heading', { name: 'Import' })).toBeVisible()
  await expect(page).toHaveURL(/\/verwaltung\/stammdaten\/import\/[0-9a-f-]+$/)
  // Tim is new; Carla's list entry carried another address, so her group member is new too and the old entry goes.
  await expect(page.getByText('2 neu, 1 entfernt, 0 geändert, 3 unverändert.')).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(TIM.name) })).toBeVisible()
  await shot(page, '12-import-entra')
  await page.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(page.getByRole('status')).toHaveText('Die Liste gilt jetzt.')
  await signOut(page)

  // Tim was never bound by address: the import knows his object id.
  await openAs(page, TIM, '/konto')
  await expect(page.getByText('Schüler/in, Klasse 5A (9. Schulstufe)')).toBeVisible()
  await signOut(page)
})
