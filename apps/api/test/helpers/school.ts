// A school for the tests of the window and the allocation: a roster (Sara
// and Tim in 5A, Carla their class teacher by the CSV), a published
// catalogue of five items and the window's dates, as window.test.ts built
// it first.

import assert from 'node:assert/strict'
import type { Campaign } from '../../lib/models/campaigns.ts'
import type { ChoiceView } from '../../lib/models/choices.ts'
import type { Item } from '../../lib/models/items.ts'
import type { BatchDetail } from '../../lib/models/roster.ts'
import type { CookieJar } from './fake-entra.ts'
import { harness, send, signIn, type Harness } from './harness.ts'
import { ANNA, BERND, CARLA, SARA, TIM } from './personas.ts'

export const ADMIN = { BOOTSTRAP_ADMINS: ANNA.email ?? '' }
export const DAYS = ['2027-06-21', '2027-06-22']
export const CONTEXT = { baseUrl: 'https://wahl.example.org' }

export interface Ready extends Harness {
  anna: CookieJar
  bernd: CookieJar
  sara: CookieJar
  tim: CookieJar
  campaign: Campaign
  items: Record<'klettern' | 'tanz' | 'schwimmen' | 'darts' | 'wien', string>
  saraPerson: string
  timPerson: string
}

export type View = ChoiceView & { campaign: Campaign }

/** A school with a roster (Sara and Tim in 5A, Carla their class teacher by the CSV), a published catalogue of five items and the window's dates. */
export async function school(t: Parameters<typeof harness>[0], env: Record<string, string> = {}): Promise<Ready> {
  const h = await harness(t, { ...ADMIN, ...env })
  const anna0 = await signIn(h, ANNA)
  const csv = [
    'email;given_name;family_name;class;grade;kind;class_teacher_email',
    `${SARA.email};Sara;Schülerin;5A;9;student;${CARLA.email}`, `${TIM.email};Tim;Schüler;5A;9;student;${CARLA.email}`,
    `${ANNA.email};Anna;Lehrerin;;;teacher;`, `${BERND.email};Bernd;Lehrer;;;teacher;`, `${CARLA.email};Carla;Kollegin;;;teacher;`,
  ].join('\n')
  const batch = await send<BatchDetail>(h, anna0, 'POST', '/api/admin/roster/csv', { csv, schoolYear: '2026/27' })
  const committed = await send<BatchDetail>(h, anna0, 'POST', `/api/admin/roster/batches/${batch.body.id}/commit`)
  const person = (name: string) => committed.body.diff.added.find((e) => e.displayName === name)?.personId ?? ''
  const anna = await signIn(h, ANNA)
  const bernd = await signIn(h, BERND)
  const created = await send<Campaign>(h, anna, 'POST', '/api/admin/campaigns', { kind: 'project_week', name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS })
  const id = created.body.id
  await send(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'catalogue' })
  const session = (day: string, from: string, to: string, minutes: number) => ({ startsAt: `${day}T${from}:00+02:00`, endsAt: `${day}T${to}:00+02:00`, credits: [{ date: day, minutes }] })
  const propose = async (body: Record<string, unknown>) => {
    const item = await send<Item>(h, bernd, 'POST', `/api/campaigns/${id}/items`, { teachers: [person(BERND.name)], ...body })
    assert.equal(item.status, 201, JSON.stringify(item.body))
    await send(h, bernd, 'POST', `/api/items/${item.body.id}/propose`)
    assert.equal((await send(h, anna, 'POST', `/api/admin/items/${item.body.id}/approve`)).status, 200)
    return item.body.id
  }
  const items = {
    klettern: await propose({ title: 'Klettern', places: 12, sessions: [session('2027-06-21', '08:30', '12:15', 210)] }),
    tanz: await propose({ title: 'Tanz', places: 10, sessions: [session('2027-06-21', '08:30', '12:15', 210)] }),
    schwimmen: await propose({ title: 'Schwimmen', places: 20, sessions: [session('2027-06-21', '11:25', '13:10', 90)] }),
    darts: await propose({ title: 'Darts', places: 20, sessions: [session('2027-06-22', '08:30', '12:15', 210)] }),
    wien: await propose({ title: 'Wien', places: 2, fixedClasses: ['5A'], cancellableBelowMin: false, sessions: [session('2027-06-22', '08:00', '18:00', 420)] }),
  }
  const window = { name: 'Projektwoche 2027', schoolYear: '2026/27', projectDays: DAYS, opensAt: '2027-03-01T08:00:00+01:00', closesAt: '2027-03-08T20:00:00+01:00', lateUntil: '2027-03-12T20:00:00+01:00', reminderDays: 1 }
  assert.equal((await send(h, anna, 'PATCH', `/api/admin/campaigns/${id}`, window)).status, 200)
  const published = await send<Campaign>(h, anna, 'POST', `/api/admin/campaigns/${id}/transition`, { to: 'published' })
  assert.equal(published.status, 200)
  return { ...h, anna, bernd, sara: await signIn(h, SARA), tim: await signIn(h, TIM), campaign: published.body, items, saraPerson: person(SARA.name), timPerson: person(TIM.name) }
}
