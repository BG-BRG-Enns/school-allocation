// Nach der Veröffentlichung: eine zweite Anmeldung, mit der Organisation über
// die API bis zur veröffentlichten Einteilung gebracht (ein Projekttag, vier
// Aktivitäten, die Tauschzeit offen), dann im Browser: ein Schüler
// sieht die volle Aktivität als voll, eine Schülerin wechselt in eine
// mit freien Plätzen, der Klassenvorstand teilt den Schüler ohne Platz in
// eine Lücke zu, die Organisation nimmt mit Begründung heraus und lädt die
// Arbeitsmappe. Baut auf 01–06 auf (die Klassenlisten, Bernd als
// Klassenvorstand der 5A); die Anmeldung der vorigen Journeys bleibt unberührt.

import { expect, test } from '../support/test.ts'
import { apiGet, apiPost } from '../support/api.ts'
import { BASE_PATH } from '../support/base.ts'
import { anyCount, anyText, literally, t } from '../support/messages.ts'
import { ANNA, BERND, SARA, TIM } from '../support/personas.ts'
import { picture, section, shot } from '../support/screenshot.ts'
import { sample } from '../support/sample.ts'
import { openAs, signOut } from '../support/sign-in.ts'

test.describe.configure({ mode: 'serial' })

const DAY = '2027-06-28'
const NAME = sample.sportsWeek
const session = (from: string, to: string) => ({ startsAt: `${DAY}T${from}:00+02:00`, endsAt: `${DAY}T${to}:00+02:00`, credits: [{ date: DAY, minutes: 120 }] })

/** The browser's fetch, failing the step on a refusal: the setup asks for nothing it may not have. */
async function must<T>(answer: Promise<{ status: number, body: T }>, what: string): Promise<T> {
  const a = await answer
  expect(a.status, `${what}: ${JSON.stringify(a.body)}`).toBeLessThan(300)
  return a.body
}

test('die Organisation bringt eine zweite Anmeldung über die API bis zur veröffentlichten Einteilung, mit offener Tauschzeit', async ({ page }) => {
  // Bernd proposes the four activities of the Monday, every one with a fee so the run places nobody as a fallback: two in the morning (one place; five places), two in the afternoon (one place; ten places).
  await openAs(page, ANNA, '/wahlen')
  const campaign = await must(apiPost<{ id: string }>(page, '/api/admin/campaigns', { kind: 'project_week', name: NAME, schoolYear: '2026/27', projectDays: [DAY] }), 'campaign')
  const id = campaign.id
  await must(apiPost(page, `/api/admin/campaigns/${id}/transition`, { to: 'catalogue' }), 'catalogue')
  const teachers = await must(apiGet<{ teachers: { personId: string, displayName: string }[] }>(page, `/api/campaigns/${id}/teachers?q=Bernd`), 'teachers')
  const bernd = teachers.teachers.find((teacher) => teacher.displayName === BERND.name)?.personId ?? ''
  expect(bernd).not.toBe('')
  await signOut(page)

  await openAs(page, BERND, '/wahlen')
  const items: Record<string, string> = {}
  for (const [key, body] of [
    ['archery', { places: 1, feeCents: 200, sessions: [session('08:30', '10:30')] }],
    ['woodwork', { places: 5, feeCents: 400, sessions: [session('08:30', '10:30')] }],
    ['dance', { places: 1, feeCents: 500, sessions: [session('13:30', '15:30')] }],
    ['chess', { places: 10, feeCents: 300, sessions: [session('13:30', '15:30')] }],
  ] as const) {
    const title = sample[key]
    const item = await must(apiPost<{ id: string }>(page, `/api/campaigns/${id}/items`, { title, teachers: [bernd], ...body }), title)
    await must(apiPost(page, `/api/items/${item.id}/propose`), `${title} propose`)
    items[key] = item.id
  }
  await signOut(page)

  // Anna approves, publishes the catalogue, sets the window with a daily minimum of 240 and the swap window open now, opens, enters both lists, closes, runs and publishes.
  await openAs(page, ANNA, '/wahlen')
  for (const itemId of Object.values(items)) await must(apiPost(page, `/api/admin/items/${itemId}/approve`), 'approve')
  const now = Date.now()
  /** A PATCH or PUT from within the page, as apiPost does it. */
  const write = (method: 'PATCH' | 'PUT', path: string, payload: object) => page.evaluate(async ([m, url, body]) => {
    const response = await fetch(url, { method: m, headers: { 'accept': 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() as unknown }
  }, [method, `${BASE_PATH}${path}`, payload] as const)
  const patch = async (changes: object) => {
    const answer = await write('PATCH', `/api/admin/campaigns/${id}`, changes)
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
  }
  await patch({ name: NAME, schoolYear: '2026/27', projectDays: [DAY], opensAt: new Date(now - 7 * 86400e3).toISOString(), closesAt: new Date(now + 86400e3).toISOString(), lateUntil: new Date(now + 2 * 86400e3).toISOString(), swapFrom: new Date(now - 3600e3).toISOString(), swapUntil: new Date(now + 86400e3).toISOString(), wishesPerGroup: 3, dailyMinimum: { 9: 240 }, showTeachers: true, reminderDays: 1 })
  await must(apiPost(page, `/api/admin/campaigns/${id}/transition`, { to: 'published' }), 'published')
  await must(apiPost(page, `/api/admin/campaigns/${id}/transition`, { to: 'open' }), 'open')
  const missing = await must(apiGet<{ students: { personId: string, displayName: string }[] }>(page, `/api/admin/campaigns/${id}/missing`), 'students')
  const person = (name: string) => missing.students.find((s) => s.displayName === name)?.personId ?? ''
  const groupsOf = async (personId: string) => (await must(apiGet<{ groups: { key: string, items: { id: string }[] }[] }>(page, `/api/admin/campaigns/${id}/choices/${personId}`), 'groups')).groups
  const groups = await groupsOf(person(SARA.name))
  const morning = groups.find((g) => g.items.some((i) => i.id === items.archery))?.key ?? ''
  const afternoon = groups.find((g) => g.items.some((i) => i.id === items.dance))?.key ?? ''
  // Sara: archery, dance over chess. Tim: chess over dance, nothing in the morning (his list is incomplete), so archery is Sara's and he has a gap nothing fee-free could fill.
  const enter = (personId: string, ranking: Record<string, string[]>) => write('PUT', `/api/admin/campaigns/${id}/choices/${personId}`, { ranking, reason: 'Journey 07' })
  expect((await enter(person(SARA.name), { [morning]: [items.archery ?? ''], [afternoon]: [items.dance ?? '', items.chess ?? ''] })).status).toBe(200)
  expect((await enter(person(TIM.name), { [afternoon]: [items.chess ?? '', items.dance ?? ''] })).status).toBe(200)
  await must(apiPost(page, `/api/admin/campaigns/${id}/transition`, { to: 'closed' }), 'closed')
  const started = await must(apiPost<{ run: { id: string } }>(page, `/api/admin/campaigns/${id}/runs`, { seed: 7 }), 'run')
  await expect.poll(async () => (await apiGet<{ run: { status: string } }>(page, `/api/admin/campaigns/${id}/runs/${started.run.id}`)).body.run.status, { timeout: 30_000 }).toBe('succeeded')
  const review = await must(apiGet<{ run: { cancelledItemIds: string[] } }>(page, `/api/admin/campaigns/${id}/runs/${started.run.id}`), 'review')
  await must(apiPost(page, `/api/admin/campaigns/${id}/runs/${started.run.id}/publish`, { cancelledItemIds: review.run.cancelledItemIds }), 'publish')
  await signOut(page)
})

test('ein Schüler sieht die volle Aktivität als voll; eine Schülerin wechselt in eine mit freien Plätzen', async ({ page }) => {
  await openAs(page, TIM, '/wahlen')
  await page.getByRole('link', { name: NAME }).click()
  await page.getByRole('link', { name: t.campaign.student.viewResult }).click()
  await expect(page.getByRole('heading', { name: t.result.swap.heading })).toBeVisible()
  // Tim has chess; dance has its one place taken: on offer, but full, and the button says so by being disabled.
  const dance = page.getByRole('listitem').filter({ has: page.locator('strong', { hasText: new RegExp(`\\. ${literally(sample.dance)}$`) }) }).filter({ hasText: t.labels.moveProblem.item_full })
  await expect(dance).toBeVisible()
  await expect(dance.getByRole('button', { name: t.result.swap.submit })).toBeDisabled()
  await shot(page, '34-tausch-voll')
  await signOut(page)

  await openAs(page, SARA, '/wahlen')
  await page.getByRole('link', { name: NAME }).click()
  await page.getByRole('link', { name: t.campaign.student.viewResult }).click()
  // Sara has dance; chess has places, and the move leaves dance.
  const chess = page.getByRole('listitem').filter({ has: page.locator('strong', { hasText: new RegExp(`\\. ${literally(sample.chess)}$`) }) }).filter({ hasText: anyCount(t.result.freePlaces) })
  await expect(chess).toContainText(anyText(t.result.swap.leaves, String.raw`\d+\. ` + literally(sample.dance)))
  await picture(page, 'tauschen', section(page, t.result.swap.heading))
  page.once('dialog', (dialog) => void dialog.accept())
  await chess.getByRole('button', { name: t.result.swap.submit }).click()
  await expect(page.getByRole('status')).toHaveText(t.result.swapped)
  await expect(page.getByRole('listitem').filter({ hasText: sample.chess }).filter({ hasText: t.result.source.swap })).toBeVisible()
  await expect(page.getByRole('heading', { name: t.result.changes })).toBeVisible()
  await shot(page, '35-getauscht')
  await signOut(page)
})

test('der Klassenvorstand teilt den Schüler ohne Platz in eine Lücke zu; die Organisation nimmt mit Begründung heraus und lädt die Arbeitsmappe', async ({ page }) => {
  await openAs(page, BERND, '/wahlen')
  await page.getByRole('link', { name: NAME }).click()
  await page.getByRole('link', { name: t.campaign.myClass('5A') }).click()
  await expect(page.getByRole('heading', { name: t.schoolClass.unplaced.heading(1) })).toBeVisible()
  const form = page.getByRole('form', { name: t.schoolClass.unplaced.form(TIM.name) })
  // The option's label carries the catalogue number and the free places; the value is the id.
  await form.getByLabel(t.schoolClass.unplaced.itemFor(TIM.name)).selectOption(await form.getByRole('option', { name: new RegExp(literally(sample.woodwork)) }).getAttribute('value'))
  await form.getByLabel(t.schoolClass.unplaced.reasonFor(TIM.name)).fill(sample.reason.noMorningPlace)
  await picture(page, 'klasse-einteilen', section(page, t.schoolClass.unplaced.heading(1)))
  await form.getByRole('button', { name: t.schoolClass.unplaced.place }).click()
  await expect(page.getByRole('status')).toHaveText(t.schoolClass.placed)
  await expect(page.getByRole('heading', { name: t.schoolClass.unplaced.heading(0) })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: TIM.name }).first()).toContainText(`${sample.woodwork} (${t.labels.assignmentSource.manual})`)
  await shot(page, '36-klasse-zugeteilt')

  // The activity's teachers see its participants; Bernd, who organizes as well, through the activity's page.
  await page.getByRole('link', { name: `← ${t.common.backToCampaign}` }).click()
  await page.getByRole('row', { name: new RegExp(literally(sample.woodwork)) }).getByRole('link', { name: t.common.edit }).click()
  const participants = section(page, t.item.participants.heading(1))
  await expect(participants).toContainText(TIM.name)
  await picture(page, 'teilnehmerinnen', participants)
  await signOut(page)

  await openAs(page, ANNA, '/wahlen')
  await page.getByRole('link', { name: NAME }).click()
  await page.getByRole('link', { name: t.common.page.allocation }).click()
  await expect(page.getByRole('heading', { name: t.allocation.publication.changes(2) })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(literally(t.labels.changeKind.swap)) })).toContainText(SARA.name)
  await expect(page.getByRole('row', { name: new RegExp(literally(t.labels.changeKind.place)) })).toContainText(sample.reason.noMorningPlace)
  const change = page.getByRole('form', { name: t.allocation.change.title })
  await change.getByLabel(t.common.field.student).selectOption({ label: `${SARA.name} (5A)` })
  const from = change.getByLabel(t.allocation.change.from)
  await from.selectOption(await from.getByRole('option', { name: new RegExp(literally(sample.chess)) }).getAttribute('value'))
  await change.getByLabel(t.common.field.reason).fill(sample.reason.reportedIll)
  await change.getByRole('button', { name: t.allocation.change.submit }).click()
  await expect(page.getByRole('status')).toHaveText(t.allocation.changed)
  await expect(page.getByRole('heading', { name: t.allocation.publication.changes(3) })).toBeVisible()
  await expect(page.getByRole('row', { name: new RegExp(literally(t.labels.changeKind.remove)) })).toContainText(sample.reason.reportedIll)
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: t.allocation.publication.assignmentsExport }).click()
  expect((await download).suggestedFilename()).toBe(t.files.assignments('2026-27'))
  await shot(page, '37-aenderungen')
  await picture(page, 'aenderungen', [page.getByRole('heading', { name: t.allocation.publication.changes(3) }), change])
  await signOut(page)
})
