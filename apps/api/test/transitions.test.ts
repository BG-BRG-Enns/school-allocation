// The steps back and the deletion of a registration in preparation: from
// collecting back to preparation, from published back to collecting with
// the numbers kept; a draft deleted with its rules and draft items and
// audited in the school's chain; what refuses, and who may.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readAudit, SCHOOL_SCOPE } from '../lib/audit.ts'
import { createDatabase } from '../lib/db.ts'
import type { Campaign } from '../lib/models/campaigns.ts'
import type { Item } from '../lib/models/items.ts'
import type { BatchDetail } from '../lib/models/roster.ts'
import type { CookieJar } from './helpers/fake-entra.ts'
import { DB, get, harness, send, signIn, type Harness } from './helpers/harness.ts'
import { ANNA, BERND, SARA } from './helpers/personas.ts'

const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
const DAYS = ['2027-06-21', '2027-06-22']
const MONDAY = { startsAt: '2027-06-21T09:00:00+02:00', endsAt: '2027-06-21T13:00:00+02:00', credits: [{ date: '2027-06-21', minutes: 210 }] }

type Ready = Harness & { anna: CookieJar, bernd: CookieJar }

async function school(t: Parameters<typeof harness>[0]): Promise<Ready> {
  const h = await harness(t, ADMIN)
  const anna = await signIn(h, ANNA)
  const csv = ['email;given_name;family_name;class;grade;kind', `${SARA.email};Sara;Pfnäxthuber;5A;9;student`, `${ANNA.email};Anna;Zwexmhofer;;;teacher`, `${BERND.email};Bernd;Pfnöxlhofer;;;teacher`].join('\n')
  const batch = await send<BatchDetail>(h, anna, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  assert.equal((await send(h, anna, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)).status, 200)
  return { ...h, anna: await signIn(h, ANNA), bernd: await signIn(h, BERND) }
}

async function create(s: Ready, name = 'Projektwoche 2027'): Promise<string> {
  const created = await send<Campaign>(s, s.anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name, schoolYear: '2026/27', projectDays: DAYS })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  return created.body.id
}

const move = (s: Ready, id: string, to: string) => send<Campaign>(s, s.anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to })

test('collecting goes back to preparation and published back to collecting, the numbers kept; a second publication numbers only the rest', DB, async (t) => {
  const s = await school(t)
  const id = await create(s)
  assert.equal((await move(s, id, 'catalogue')).status, 200)
  // Back to preparation: teachers lose sight of it, the step is audited like any other.
  assert.equal((await move(s, id, 'draft')).body.state, 'draft')
  assert.equal((await get(s, s.bernd, `/api/campaigns/${id}`)).status, 404)
  assert.equal((await move(s, id, 'catalogue')).status, 200)
  // Two activities approved and published: numbered. Back to collecting, a third approved, published again: the first two keep their numbers.
  const url = `/api/campaigns/${id}/items`
  const ids: string[] = []
  for (const title of ['Klettern', 'Wien', 'Zoo']) {
    const item = await send<Item>(s, s.bernd, 'POST', url, { title, places: 10, teachers: [], sessions: [MONDAY] })
    assert.equal(item.status, 201, JSON.stringify(item.body))
    assert.equal((await send(s, s.bernd, 'POST', `/api/items/${item.body.id}/propose`)).status, 200)
    ids.push(item.body.id)
  }
  for (const itemId of ids.slice(0, 2)) assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${itemId}/approve`)).status, 200)
  assert.equal((await move(s, id, 'published')).status, 200)
  const numbers = async () => (await get<{ items: Item[] }>(s, s.anna, url)).body.items.map((i) => [i.title, i.number] as const).sort()
  const first = await numbers()
  assert.deepEqual(first.map(([title, number]) => [title, number !== null]), [['Klettern', true], ['Wien', true], ['Zoo', false]])
  assert.equal((await move(s, id, 'catalogue')).body.state, 'catalogue')
  assert.equal((await get<{ campaign: Campaign }>(s, s.bernd, `/api/campaigns/${id}`)).status, 200, 'teachers see it again')
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${ids[2]}/approve`)).status, 200)
  assert.equal((await move(s, id, 'published')).status, 200)
  const second = await numbers()
  assert.deepEqual(second.slice(0, 2), first.slice(0, 2), 'the numbers given stay')
  assert.notEqual(second[2]?.[1], null)
  // Nothing goes back from the opening on.
  assert.equal((await move(s, id, 'open')).status, 200)
  assert.equal((await move(s, id, 'published')).status, 409)
  assert.equal((await move(s, id, 'catalogue')).status, 409)
  assert.equal((await move(s, id, 'draft')).status, 409)
  const events = (await readAudit(s.db, id)).filter((e) => e.action === 'campaign.transitioned').map((e) => [e.metadata.from, e.metadata.to])
  assert.deepEqual(events, [['draft', 'catalogue'], ['catalogue', 'draft'], ['draft', 'catalogue'], ['catalogue', 'published'], ['published', 'catalogue'], ['catalogue', 'published'], ['published', 'open']])
})

test('a registration in preparation is deleted with its rules and draft items, audited in the school\'s chain; one past preparation or with a proposed item is not; a teacher may not', DB, async (t) => {
  const s = await school(t)
  const id = await create(s, 'Versuch')
  const other = await create(s, 'Projektwoche 2027')
  // A draft item left from collecting goes with the registration (an item is only ever created while it collects).
  assert.equal((await move(s, id, 'catalogue')).status, 200)
  assert.equal((await send(s, s.bernd, 'POST', `/api/campaigns/${id}/items`, { title: 'Entwurf', places: 10, teachers: [], sessions: [MONDAY] })).status, 201)
  assert.equal((await move(s, id, 'draft')).status, 200)
  assert.equal((await send(s, s.bernd, 'DELETE', `/api/admin/campaigns/${id}`)).status, 403)
  const deleted = await send<{ removed: { relation: string, count: number }[] }>(s, s.anna, 'DELETE', `/api/admin/campaigns/${id.toUpperCase()}`)
  assert.equal(deleted.status, 200, JSON.stringify(deleted.body))
  assert.deepEqual(Object.fromEntries(deleted.body.removed.map((r) => [r.relation, r.count])), { catalog_item: 1, campaign_rule: 0, campaign: 1 })
  assert.equal((await get(s, s.anna, `/api/campaigns/${id}`)).status, 404)
  assert.equal((await send(s, s.anna, 'DELETE', `/api/admin/campaigns/${id}`)).status, 404)
  // The registration's own chain stays, under a tombstone with its year, for the year's retention purge to find.
  const owner = createDatabase(s.ownerUrl, () => {})
  t.after(() => owner.close())
  assert.deepEqual((await owner.query<{ school_year: string, name: string }>('select school_year, name from deleted_campaign where id = $1', [id])).rows, [{ school_year: '2026/27', name: 'Versuch' }])
  assert.ok((await readAudit(owner, id)).length > 0)
  await assert.rejects(owner.query('select * from purge_deleted_campaigns($1)', ['2026/27']), /retention of 2026\/27 has not ended/)
  // The year stays in the retention overview by the tombstone alone, so the chain is purged with it one day.
  const years = await get<{ years: { schoolYear: string, campaigns: unknown[] }[] }>(s, s.anna, '/api/admin/retention')
  assert.ok(years.body.years.some((y) => y.schoolYear === '2026/27'))
  assert.deepEqual((await get<{ campaigns: Campaign[] }>(s, s.anna, '/api/campaigns')).body.campaigns.map((c) => c.id), [other])
  const audit = (await readAudit(s.db, SCHOOL_SCOPE)).filter((e) => e.action === 'campaign.deleted')
  assert.equal(audit.length, 1)
  assert.deepEqual(audit[0]?.metadata, { campaignId: id, name: 'Versuch', schoolYear: '2026/27', removed: { catalog_item: 1, campaign_rule: 0, campaign: 1 } })
  // The other one: collecting, with a proposed item; neither state lets it go.
  assert.equal((await move(s, other, 'catalogue')).status, 200)
  const proposed = await send<Item>(s, s.bernd, 'POST', `/api/campaigns/${other}/items`, { title: 'Klettern', places: 10, teachers: [], sessions: [MONDAY] })
  assert.equal((await send(s, s.bernd, 'POST', `/api/items/${proposed.body.id}/propose`)).status, 200)
  assert.equal((await send<{ error: string }>(s, s.anna, 'DELETE', `/api/admin/campaigns/${other}`)).body.error, 'campaign_state')
  assert.equal((await move(s, other, 'draft')).status, 200)
  const refused = await send<{ error: string }>(s, s.anna, 'DELETE', `/api/admin/campaigns/${other}`)
  assert.deepEqual([refused.status, refused.body.error], [409, 'campaign_state'], 'a proposed item keeps the registration')
  assert.equal((await get(s, s.anna, `/api/campaigns/${other}`)).status, 200)
  // A draft that once had a number: approved, published, back to collecting, returned to draft, back to preparation. The
  // number stays with it, and the function's refusal is answered as the state's.
  assert.equal((await move(s, other, 'catalogue')).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${proposed.body.id}/approve`)).status, 200)
  assert.equal((await move(s, other, 'published')).status, 200)
  assert.equal((await move(s, other, 'catalogue')).status, 200)
  assert.equal((await send(s, s.anna, 'POST', `/api/admin/items/${proposed.body.id}/return`, { note: 'noch einmal' })).status, 200)
  assert.equal((await move(s, other, 'draft')).status, 200)
  const numbered = await send<{ error: string }>(s, s.anna, 'DELETE', `/api/admin/campaigns/${other}`)
  assert.deepEqual([numbered.status, numbered.body.error], [409, 'campaign_state'], 'a numbered draft keeps the registration')
})
