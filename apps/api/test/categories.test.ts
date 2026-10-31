// Categories and rules on a real database: the school's categories kept by
// organizers and administrators, audited, a name once in any case, one in
// use only renamed; an activity's categories, kept when an edit leaves
// them out and fixed for an approved activity from publication; a
// registration's rules, checked against the categories, fixed from the
// opening, audited when they change; the demand per rule; the choice page
// asking a list to reach each rule; a run computing with the rules, its
// snapshot holding the categories; a swap refused for a rule it would lose,
// the organizer's change forcing it.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AllocationRun, CategoriesResponse, CategoryUsageResponse, ClassStatus, DemandResponse, MyResultResponse, RunReviewResponse } from '@school-allocation/api-contracts'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item } from '../lib/models/items.ts'
import { startFakeSolver } from './helpers/fake-solver.ts'
import { DB, get, send, signIn } from './helpers/harness.ts'
import { CARLA } from './helpers/personas.ts'
import { school, type Ready, type View } from './helpers/school.ts'

const hour = 3_600_000
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

type Usage = CategoryUsageResponse & { error?: string }

const addCategory = (s: Ready, name: string) => send<Usage>(s, s.anna, 'POST', '/api/admin/categories', { name })

/** An item as the form sends it back, with `changes` over it. */
function bodyOf(item: Item, changes: Record<string, unknown> = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: item.title, description: item.description, location: item.location, feeCents: item.feeCents, feeNote: item.feeNote, places: item.places,
    minParticipants: item.minParticipants, cancellableBelowMin: item.cancellableBelowMin, fixedClasses: item.fixedClasses, eligibleGrades: item.eligibleGrades,
    eligibleClasses: item.eligibleClasses, teachers: item.teachers.map((t) => t.personId),
    sessions: item.sessions.map((session) => ({ startsAt: session.startsAt, endsAt: session.endsAt, credits: session.credits, ...(session.location ? { location: session.location } : {}) })),
    ...changes,
  }
  // The form leaves an empty text out.
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null && value !== ''))
}

async function editItem(s: Ready, id: string, changes: Record<string, unknown>) {
  const items = await get<{ items: Item[] }>(s, s.anna, `/api/campaigns/${s.campaign.id}/items`)
  const item = items.body.items.find((i) => i.id === id)
  assert.ok(item, id)
  return send<Item & { error?: string }>(s, s.anna, 'PATCH', `/api/items/${id}`, bodyOf(item, changes))
}

test('the school\'s categories: everyone signed in reads them, organizers keep them, audited; a name once, a category in use only renamed', DB, async (t) => {
  const s = await school(t)
  assert.deepEqual((await get<CategoriesResponse>(s, s.sara, '/api/categories')).body, { categories: [] })
  assert.equal((await get(s, s.sara, '/api/admin/categories')).status, 403)
  assert.equal((await send(s, s.bernd, 'POST', '/api/admin/categories', { name: 'Sport' })).status, 403, 'a teacher keeps no categories')

  const sport = await addCategory(s, '  Sport ')
  assert.equal(sport.status, 200, JSON.stringify(sport.body))
  assert.deepEqual(sport.body.categories.map((c) => [c.name, c.items, c.rules]), [['Sport', 0, 0]], 'trimmed')
  assert.equal((await addCategory(s, 'SPORT')).body.error, 'category_exists', 'one name in any case')
  assert.equal((await addCategory(s, '   ')).status, 400)
  const kreativ = await addCategory(s, 'Kreativ')
  assert.deepEqual(kreativ.body.categories.map((c) => c.name), ['Kreativ', 'Sport'], 'by name')
  const kreativId = kreativ.body.categories[0]?.id ?? ''

  const rename = (id: string, name: string) => send<Usage>(s, s.anna, 'PATCH', `/api/admin/categories/${id}`, { name })
  assert.equal((await rename(kreativId, 'sport')).body.error, 'category_exists')
  assert.equal((await rename(kreativId, 'Kunst')).status, 200)
  assert.equal((await rename(kreativId, 'Kunst')).status, 200, 'the same name again changes nothing')
  assert.equal((await rename('00000000-0000-0000-0000-000000000001', 'Musik')).status, 404)
  assert.deepEqual((await get<CategoriesResponse>(s, s.sara, '/api/categories')).body.categories.map((c) => c.name), ['Kunst', 'Sport'])
  const removed = await send<Usage>(s, s.anna, 'DELETE', `/api/admin/categories/${kreativId.toUpperCase()}`)
  assert.equal(removed.status, 200, JSON.stringify(removed.body))
  assert.deepEqual(removed.body.categories.map((c) => c.name), ['Sport'])

  const events = (await readAudit(s.db, SCHOOL_SCOPE)).filter((e) => e.action.startsWith('category.'))
  assert.deepEqual(events.map((e) => e.action), ['category.created', 'category.created', 'category.changed', 'category.removed'])
  assert.deepEqual(events[2]?.metadata, { categoryId: kreativId, from: 'Kreativ', to: 'Kunst' })

  // At most fifty.
  for (let n = 2; n <= 50; n++) assert.equal((await addCategory(s, `Kategorie ${n}`)).status, 200)
  assert.equal((await addCategory(s, 'Eine zu viel')).body.error, 'too_many_categories')
})

test('an activity\'s categories, a registration\'s rules: checked, audited, fixed from the opening; the demand per rule; a list complete only when it reaches the rules', DB, async (t) => {
  const s = await school(t)
  const id = s.campaign.id
  const sport = (await addCategory(s, 'Sport')).body.categories[0]?.id ?? ''
  const beruf = (await addCategory(s, 'Berufsorientierung')).body.categories.find((c) => c.name === 'Berufsorientierung')?.id ?? ''

  // Klettern and Schwimmen are sport, the class trip to Vienna careers guidance.
  assert.deepEqual((await editItem(s, s.items.klettern, { categories: [sport.toUpperCase()] })).body.categoryIds, [sport])
  assert.equal((await editItem(s, s.items.schwimmen, { categories: [sport] })).status, 200)
  assert.equal((await editItem(s, s.items.wien, { categories: [beruf] })).status, 200)
  const unknownCategory = await editItem(s, s.items.darts, { categories: ['00000000-0000-0000-0000-000000000001'] })
  assert.deepEqual([unknownCategory.status, unknownCategory.body.error], [422, 'category_unknown'])
  const kept = await editItem(s, s.items.klettern, { description: 'Mit Seil.' })
  assert.deepEqual(kept.body.categoryIds, [sport], 'an edit that names no categories keeps them')

  // The rules, replaced as a whole while the window may change.
  const settings = { name: s.campaign.name, schoolYear: s.campaign.schoolYear, projectDays: s.campaign.projectDays }
  const setRules = (rules: unknown[]) => send<Campaign & { error?: string, problems?: unknown[] }>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, rules })
  const sportRule = { categoryId: sport, grades: [9], classes: [], unit: 'items', minimum: 2 }
  const berufRule = { categoryId: beruf, grades: [9, 9], classes: ['5A'], unit: 'minutes', minimum: 400 }
  const unknown = await setRules([{ ...sportRule, categoryId: '00000000-0000-0000-0000-000000000001' }])
  assert.equal(unknown.status, 422)
  assert.deepEqual(unknown.body, { error: 'rules_invalid', problems: [{ code: 'category_unknown', rule: 0 }] })
  assert.equal((await setRules([{ ...sportRule, unit: 'items', minimum: 21 }])).body.error, 'rules_invalid', 'twenty activities at most')
  assert.equal((await setRules([{ ...sportRule, grades: [] }])).status, 400)
  const set = await setRules([sportRule, berufRule])
  assert.equal(set.status, 200, JSON.stringify(set.body))
  assert.deepEqual(set.body.rules.map(({ id: _, ...rule }) => rule), [sportRule, { ...berufRule, grades: [9] }], 'grades once')
  assert.equal((await setRules([sportRule, berufRule])).body.rules[0]?.id, set.body.rules[0]?.id, 'the same list again keeps the rules')
  // Settings without rules leave them.
  assert.equal((await send<Campaign>(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, wishesPerGroup: 1 })).body.rules.length, 2)
  const ruleEvents = (await readAudit(s.db, id)).filter((e) => e.action === 'campaign.rules-changed')
  assert.equal(ruleEvents.length, 1)
  assert.deepEqual(ruleEvents[0]?.metadata, { campaignId: id, rules: [{ categoryId: sport, grades: [9], classes: 0, unit: 'items', minimum: 2 }, { categoryId: beruf, grades: [9], classes: 1, unit: 'minutes', minimum: 400 }] })
  assert.equal((await send(s, s.bernd, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, rules: [] })).status, 403)

  // A category in use: renamed, never removed.
  const usage = await get<Usage>(s, s.anna, '/api/admin/categories')
  assert.deepEqual(usage.body.categories.map((c) => [c.name, c.items, c.rules]), [['Berufsorientierung', 1, 1], ['Sport', 2, 1]])
  assert.equal((await send<Usage>(s, s.anna, 'DELETE', `/api/admin/categories/${sport}`)).body.error, 'category_in_use')
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/categories/${sport}`, { name: 'Bewegung' })).status, 200)

  // The demand per rule: both students need two sport activities, Klettern's 12 and Schwimmen's 20 places bring one each;
  // the trip to Vienna (the whole class, 420 minutes) meets the careers rule before anyone ranks.
  const demand = await get<DemandResponse>(s, s.anna, `/api/campaigns/${id}/demand`)
  assert.equal(demand.status, 200, JSON.stringify(demand.body))
  assert.deepEqual(demand.body.rules.map(({ ruleId: _, ...rest }) => rest), [{ grade: 9, students: 2, needed: 4, offered: 32 }, { grade: 9, students: 2, needed: 0, offered: 0 }])

  // From the opening the rules are fixed; the choice page asks the list to reach them as far as the offer can.
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })
  assert.equal((await setRules([sportRule])).body.error, 'campaign_state')
  const view = await get<View>(s, s.sara, `/api/campaigns/${id}/my-choice`)
  const [monday, swim] = view.body.groups.map((g) => g.key) as [string, string]
  const save = (ranking: Record<string, string[]>) => send<View>(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking })
  const tanz = await save({ [monday]: [s.items.tanz], [swim]: [s.items.schwimmen] })
  assert.equal(tanz.status, 200, JSON.stringify(tanz.body))
  assert.deepEqual(tanz.body.rules.map((r) => [r.unit, r.fixed, r.ranked, r.offered, r.done]), [['items', 0, 1, 2, false], ['minutes', 420, 0, 0, true]])
  assert.equal(tanz.body.complete, false, 'every block has its wish, but sport falls short of what the offer allows')
  const klettern = await save({ [monday]: [s.items.klettern], [swim]: [s.items.schwimmen] })
  assert.deepEqual(klettern.body.rules.map((r) => r.done), [true, true])
  assert.equal(klettern.body.complete, true)
})

test('a run with rules: the snapshot holds them and the categories; the review, the result and the class page show each rule; a swap that loses one is refused, the organizer may force it', DB, async (t) => {
  const solver = await startFakeSolver()
  t.after(() => solver.close())
  const s = await school(t, { SOLVER_URL: solver.baseUrl })
  const id = s.campaign.id
  const sport = (await addCategory(s, 'Sport')).body.categories[0]?.id ?? ''
  assert.equal((await editItem(s, s.items.klettern, { categories: [sport] })).status, 200)
  assert.equal((await editItem(s, s.items.schwimmen, { categories: [sport] })).status, 200)
  const settings = { name: s.campaign.name, schoolYear: s.campaign.schoolYear, projectDays: s.campaign.projectDays }
  const rule = { categoryId: sport, grades: [9], classes: [], unit: 'items', minimum: 1 }
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, dailyMinimum: { 9: 200 }, rules: [rule] })).status, 200)

  // Sara ranks Klettern first; Tim ranks nothing.
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'open' })
  const view = await get<View>(s, s.sara, `/api/campaigns/${id}/my-choice`)
  const [monday, swim] = view.body.groups.map((g) => g.key) as [string, string]
  assert.equal((await send(s, s.sara, 'PUT', `/api/campaigns/${id}/my-choice`, { ranking: { [monday]: [s.items.klettern, s.items.tanz], [swim]: [s.items.schwimmen] } })).status, 200)
  await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'closed' })
  const started = await send<{ run: AllocationRun }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs`, { seed: 7 })
  assert.equal(started.status, 202, JSON.stringify(started.body))
  const runId = started.body.run.id
  const review = async () => (await get<RunReviewResponse>(s, s.anna, `/api/admin/campaigns/${id}/runs/${runId}`)).body
  let reviewed = await review()
  for (let i = 0; i < 200 && reviewed.run.status === 'running'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25))
    reviewed = await review()
  }
  assert.equal(reviewed.run.status, 'succeeded', JSON.stringify(reviewed.run))

  // The request carried the rule; the levels name the rule levels between the days and the wishes.
  const request = solver.requests.at(-1)
  assert.equal(request?.contract, 'allocation/v2')
  assert.deepEqual(request?.levels.slice(0, 5), ['students_with_deficit', 'deficit_minutes', 'students_missing_rule', 'rule_missing_items', 'rule_missing_minutes'])
  assert.ok(request?.students.every((student) => student.rules.length === 1 && student.rules[0]?.unit === 'items'))
  assert.deepEqual(reviewed.rules.map((r) => r.categoryId), [sport])
  assert.deepEqual(reviewed.categories.map((c) => c.name), ['Sport'])
  const sara = reviewed.students.find((st) => st.personId === s.saraPerson)
  assert.deepEqual(sara?.rules.map((r) => [r.have, r.met]), [[1, true]], 'Klettern, her first wish, is sport')
  const summary = reviewed.summary
  assert.equal(summary?.rules[0]?.students, 2)
  assert.equal(summary?.students.missingRule, new Set(summary?.ruleGaps.map((g) => g.personId)).size)
  assert.equal(summary?.rules[0]?.met, 2 - (summary?.students.missingRule ?? 0))

  // The snapshot holds the categories: Darts made sport since marks the run stale, put back it is not.
  assert.equal((await editItem(s, s.items.darts, { categories: [sport] })).status, 200)
  assert.equal((await review()).stale, true)
  assert.equal((await editItem(s, s.items.darts, { categories: [] })).status, 200)
  assert.equal((await review()).stale, false)

  const published = await send(s, s.anna, 'POST', `/api/admin/campaigns/${id}/runs/${runId}/publish`, { cancelledItemIds: reviewed.run.cancelledItemIds })
  assert.equal(published.status, 200, JSON.stringify(published.body))
  // From publication an approved activity's categories are what the run counted.
  assert.equal((await editItem(s, s.items.klettern, { categories: [] })).body.error, 'campaign_state')
  assert.equal((await editItem(s, s.items.klettern, { description: 'Mit Helm.' })).status, 200, 'its words may still change')

  const result = await get<MyResultResponse>(s, s.sara, `/api/campaigns/${id}/my-result`)
  assert.deepEqual(result.body.explanation.rules.map((r) => [r.categoryId, r.minimum, r.have, r.met]), [[sport, 1, 1, true]])

  // The swap window opens; Tanz would leave Sara without sport.
  assert.equal((await send(s, s.anna, 'PATCH', `/api/admin/campaigns/${id}`, { ...settings, swapFrom: iso(-hour), swapUntil: iso(24 * hour) })).status, 200)
  const swap = await send<{ error?: string }>(s, s.sara, 'POST', `/api/campaigns/${id}/swap`, { itemId: s.items.tanz })
  assert.equal(swap.body.error, 'rule_lost', JSON.stringify(swap.body))
  const offers = (await get<MyResultResponse>(s, s.sara, `/api/campaigns/${id}/my-result`)).body.offers ?? []
  assert.deepEqual(offers.find((o) => o.itemId === s.items.tanz)?.problems.map((p) => p.code), ['rule_lost'])

  // The organizer's change: refused the same way, forced on their word.
  const change = (force: boolean) => send<{ error?: string, change?: { forced: boolean } }>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/assignments`, { personId: s.saraPerson, itemId: s.items.tanz, removeItemId: s.items.klettern, reason: 'Wunsch der Eltern', force })
  assert.equal((await change(false)).body.error, 'rule_lost')
  const forced = await change(true)
  assert.equal(forced.status, 200, JSON.stringify(forced.body))
  assert.equal(forced.body.change?.forced, true)

  // The class teacher sees the rule Sara now misses.
  const carla = await signIn(s, CARLA)
  const status = await get<ClassStatus>(s, carla, `/api/campaigns/${id}/classes/5A/status`)
  assert.equal(status.status, 200, JSON.stringify(status.body))
  const placement = status.body.students.find((st) => st.personId === s.saraPerson)?.placement
  assert.deepEqual(placement?.rules.map((r) => [r.have, r.met]), [[0, false]])
  assert.deepEqual(placement?.offers, [], 'Klettern and Schwimmen overlap Tanz: nothing fits beside it')
})
